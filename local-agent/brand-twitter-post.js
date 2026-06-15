'use strict';

/**
 * Brand Twitter Post — generates a daily tweet with AI-generated image and posts
 * via Puppeteer using the brand account (chrome-profile).
 *
 * Uses Ideogram v3 TURBO to generate unique, visually rich images for each post.
 * Falls back to Satori infographic if Ideogram fails.
 *
 * Called from index.js cron at 10:30 Europe/Madrid.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { callClaude } = require('./claude');
const { postTweet } = require('./outreach-tweet');
const db = require('./db');

const TAG = 'brand-twitter-post';
const BASE_URL = (process.env.NEXTAUTH_URL || 'https://ytubviral.com').replace(/\/$/, '');
const IDEOGRAM_KEY = process.env.IDEOGRAM_API_KEY;

// ── Day themes ──────────────────────────────────────────────────────────────

const TEMAS_SEMANA = {
  0: { tema: 'dato o estadística de YouTube', mencionarProducto: true },
  1: { tema: 'error común de YouTubers', mencionarProducto: false },
  2: { tema: 'tip práctico y accionable', mencionarProducto: true },
  3: { tema: 'tutorial o how-to', mencionarProducto: false },
  4: { tema: 'herramienta destacada + uso real', mencionarProducto: true },
  5: { tema: 'pregunta / debate con opinión', mencionarProducto: false },
  6: { tema: 'comparativa / antes vs después', mencionarProducto: true },
};

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Visual styles that rotate daily for variety
const IMAGE_STYLES = [
  { scene: 'a sleek dark workspace with neon monitor glow, YouTube analytics dashboard visible', palette: 'dark blue, cyan neon, deep black' },
  { scene: 'a creator studio with camera, ring light, and laptop showing video editing software', palette: 'warm orange, soft white, dark gray' },
  { scene: 'an abstract data visualization with glowing nodes and connections, tech aesthetic', palette: 'electric purple, teal, dark background' },
  { scene: 'a modern minimalist desk with a phone showing a trending YouTube video', palette: 'coral red, clean white, charcoal' },
  { scene: 'a dramatic aerial view of a city at night with screens showing social media metrics', palette: 'gold, deep navy, bright white highlights' },
  { scene: 'a futuristic holographic display showing growth charts and video thumbnails', palette: 'green glow, deep black, white accents' },
  { scene: 'a cozy creative space with mood lighting, journal and laptop, inspiration board on wall', palette: 'warm amber, soft cream, rich brown' },
];

// ── Content generation ──────────────────────────────────────────────────────

async function generateTweetContent() {
  const day = DAYS[new Date().getDay()];
  const theme = TEMAS_SEMANA[new Date().getDay()];

  const prompt = `
Hoy es ${day}. El tema del día es: ${theme.tema}

Escribe UN SOLO tweet de X/Twitter (máximo 250 caracteres) que pueda funcionar en el feed "Para ti".

REGLAS:
- Debe funcionar SOLO, sin contexto. Que pare el scroll.
- Fórmulas que funcionan:
  * Un dato brutal + opinión corta
  * Una pregunta provocadora
  * Un error común + solución en 1 línea
  * Una afirmación contraintuitiva
- Tono: directo, seguro, con datos. Sin hedging.
- Sin hashtags (la infografía complementa el tweet)
- Sin emojis excesivos (máximo 1-2)
- ${theme.mencionarProducto ? 'Puedes mencionar ytubviral.com si encaja naturalmente, pero no fuerces.' : 'No menciones YTubViral hoy.'}
- Sin comillas ni markdown

Devuelve SOLO el texto del tweet, nada más.
`.trim();

  const text = await callClaude(prompt, 150, {
    caller: TAG,
    system: 'Eres Javier, fundador de YTubViral. Tu voz es directa, honesta y basada en datos reales sobre YouTube.',
  });

  if (!text || text.length < 10) throw new Error('Claude returned empty tweet');
  return text.slice(0, 280);
}

// ── Ideogram image generation ───────────────────────────────────────────────

async function generateImagePrompt(tweetText) {
  const prompt = `Given this tweet about YouTube:
"${tweetText}"

Write a concise image generation prompt (max 200 chars) for a 1:1 social media visual.
The image should be eye-catching and related to the tweet's topic.

RULES:
- NO text, NO words, NO letters, NO numbers in the image
- Focus on a strong visual scene/metaphor related to the topic
- Modern, premium, editorial photography or 3D render style
- Dramatic lighting, rich colors, professional composition
- Think: what image would make someone stop scrolling?

Return ONLY the image prompt, nothing else.`;

  const imagePrompt = await callClaude(prompt, 100, {
    caller: TAG,
    system: 'You are a visual art director. Write concise, vivid image prompts.',
  });

  return imagePrompt?.trim() || null;
}

async function generateIdeogramImage(tweetText) {
  if (!IDEOGRAM_KEY) {
    console.log(`[${TAG}] No IDEOGRAM_API_KEY — skipping AI image`);
    return null;
  }

  // Get today's visual style for variety
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const style = IMAGE_STYLES[dayOfYear % IMAGE_STYLES.length];

  // Generate a prompt based on tweet content
  let imagePrompt = await generateImagePrompt(tweetText);

  if (!imagePrompt) {
    // Fallback: use the rotating style directly
    imagePrompt = `${style.scene}, professional photography, dramatic lighting`;
  }

  // Enhance the prompt with style guidelines
  const fullPrompt = `${imagePrompt}. Color palette: ${style.palette}. No text, no words, no letters. Cinematic lighting, 4K quality, editorial style.`;

  console.log(`[${TAG}] Ideogram prompt: "${fullPrompt.slice(0, 100)}..."`);

  try {
    const body = JSON.stringify({
      prompt: fullPrompt,
      resolution: '1024x1024',
      rendering_speed: 'TURBO',
      magic_prompt: 'ON',
      style_type: 'REALISTIC',
      negative_prompt: 'text, words, letters, numbers, watermark, logo, blurry, low quality, distorted',
    });

    const res = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
      method: 'POST',
      headers: {
        'Api-Key': IDEOGRAM_KEY,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[${TAG}] Ideogram error ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) {
      console.error(`[${TAG}] No image URL in Ideogram response`);
      return null;
    }

    // Download to temp file
    const tmpPath = path.join(os.tmpdir(), `ytubviral-ai-${Date.now()}.png`);
    await downloadUrl(imageUrl, tmpPath);
    console.log(`[${TAG}] AI image generated and downloaded`);
    return tmpPath;
  } catch (err) {
    console.error(`[${TAG}] Ideogram failed: ${err.message}`);
    return null;
  }
}

// ── Fallback: Satori infographic ────────────────────────────────────────────

function buildFallbackInfographicUrl(content) {
  const sentences = content.split(/[.!?]\s/).map(s => s.trim()).filter(s => s.length > 15 && s.length < 150);
  const quote = (sentences[0] || content.slice(0, 100)).replace(/[.!?]$/, '');
  const params = new URLSearchParams();
  params.set('format', 'story');
  params.set('quote', quote);
  params.set('tag', 'YouTube Tips');
  return `${BASE_URL}/api/og/infographic?${params.toString()}`;
}

// ── Download helper ─────────────────────────────────────────────────────────

function downloadUrl(url, destPath) {
  return new Promise((resolve, reject) => {
    const get = (targetUrl, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const mod = targetUrl.startsWith('https') ? https : require('http');

      mod.get(targetUrl, { timeout: 20000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(destPath); });
        file.on('error', reject);
      }).on('error', reject).on('timeout', function () {
        this.destroy();
        reject(new Error('Download timeout'));
      });
    };

    get(url);
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`[${TAG}] Starting daily brand tweet...`);

  // 1. Generate tweet text
  const tweetText = await generateTweetContent();
  console.log(`[${TAG}] Generated tweet (${tweetText.length} chars): "${tweetText.slice(0, 60)}..."`);

  // 2. Reuse the day's shared brand image if the Vercel cron already generated one
  //    (avoids a duplicate Ideogram call). Otherwise generate our own.
  let imagePath = null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const sharedUrl = await db.getDailyBrandImage(today).catch(() => null);
    if (sharedUrl) {
      const tmpPath = path.join(os.tmpdir(), `ytubviral-shared-${Date.now()}.png`);
      imagePath = await downloadUrl(sharedUrl, tmpPath);
      console.log(`[${TAG}] Reusing shared daily brand image (no Ideogram call)`);
    } else {
      imagePath = await generateIdeogramImage(tweetText);
    }
  } catch (err) {
    console.error(`[${TAG}] AI image failed: ${err.message}`);
  }

  // Fallback to old Satori infographic
  if (!imagePath) {
    console.log(`[${TAG}] Falling back to Satori infographic...`);
    try {
      const fallbackUrl = buildFallbackInfographicUrl(tweetText);
      const tmpPath = path.join(os.tmpdir(), `ytubviral-infographic-${Date.now()}.png`);
      imagePath = await downloadUrl(fallbackUrl, tmpPath);
    } catch (err) {
      console.error(`[${TAG}] Satori fallback also failed: ${err.message} — posting without image`);
    }
  }

  // 3. Post via Puppeteer with brand account
  try {
    await postTweet('brand', tweetText, imagePath);
    console.log(`[${TAG}] Brand tweet posted successfully!`);
  } finally {
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
}

// CLI support
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(`[${TAG}] Fatal: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { run };
