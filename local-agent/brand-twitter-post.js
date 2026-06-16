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

// ── Mensaje de fondo + pilares de contenido (material REAL, sin calendario) ──

const MENSAJE_DE_FONDO =
  'Crecer en YouTube es decidir con datos, no adivinar — y casi siempre empieza por el título, el CTR y las keywords. ' +
  'YTubViral existe para que esas decisiones dejen de ser a ciegas.';

const PILARES = [
  { id: 'principio', brief: 'Explica un principio REAL de cómo funciona YouTube (cómo pesa el título, búsqueda vs navegación, retención de los primeros segundos). Sin inventar cifras: si no sabes el número real, habla del mecanismo.', mencionarProducto: false },
  { id: 'opinion', brief: 'Una opinión GENUINA y honesta sobre estrategia de YouTube o el ecosistema de creadores. Algo en lo que crees de verdad. Invita al debate.', mencionarProducto: false },
  { id: 'leccion', brief: 'Un consejo accionable y concreto que el creador pueda aplicar hoy (títulos, keywords, miniaturas, retención). Sin inventar casos de estudio; si ilustras, en hipotético explícito.', mencionarProducto: true },
  { id: 'producto', brief: 'Algo REAL que hace YTubViral (SEO de vídeos, keyword research de YouTube, análisis de competencia, SEO score). Honesto, sin inventar resultados de usuarios.', mencionarProducto: true },
  { id: 'pregunta', brief: 'Una pregunta GENUINA a la comunidad de creadores. No finjas tener la respuesta. Corto.', mencionarProducto: false },
];

function pickPilar() {
  return PILARES[Math.floor(Math.random() * PILARES.length)];
}

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

// Lee los posts recientes (cualquier plataforma) para no repetir arranque/ejemplo/tema.
async function getRecentPostsContext() {
  try {
    const rows = await db.query(
      `SELECT platform, content FROM social_posts
       WHERE status = 'published' AND "createdAt" >= NOW() - INTERVAL '14 days'
       ORDER BY "createdAt" DESC LIMIT 12`
    );
    if (!rows.length) return '';
    return rows.map(r => `[${r.platform}] ${String(r.content || '').slice(0, 200)}`).join('\n\n');
  } catch { return ''; }
}

async function generateTweetContent() {
  const pilar = pickPilar();
  const recent = await getRecentPostsContext();

  const system = [
    'Eres Javier, fundador de YTubViral (ytubviral.com). Voz directa, honesta y humana — una persona real, no un community manager.',
    '',
    `MENSAJE DE FONDO (hilo conductor de todo lo que publicas): ${MENSAJE_DE_FONDO}`,
    '',
    'REGLA INNEGOCIABLE — CERO INVENCIÓN: no inventes estadísticas, porcentajes, casos de estudio ni resultados de clientes. PROHIBIDO el patrón "Analicé N canales" / "esta semana analicé un canal de X que pasó de A a B vistas". Si no tienes un dato real y verificable, habla del principio, no de una cifra. Si ilustras con un ejemplo que no ocurrió, enmárcalo en hipotético explícito ("imagina un título tipo…").',
    '',
    'NATURALIDAD: varía el arranque, la estructura y el registro. No suenes a plantilla ni a anuncio.',
    '',
    'ESPAÑOL DE ESPAÑA: usa "vosotros" (nunca "ustedes"), conjugación y léxico peninsular ("vale", "móvil", "ordenador", "vídeo"). Eres de Barcelona.',
  ].join('\n');

  const prompt = [
    `PILAR DE HOY: ${pilar.id}`,
    pilar.brief,
    '',
    'Escribe UN SOLO tweet (máximo 270 caracteres) que funcione solo, sin contexto, y pare el scroll de forma natural — sin fórmulas manidas.',
    pilar.mencionarProducto
      ? 'Puedes mencionar ytubviral.com si encaja con naturalidad, nunca forzado.'
      : 'No menciones YTubViral hoy.',
    'Sin hashtags. Sin comillas. Sin markdown. Máximo 1 emoji, y solo si aporta.',
    recent ? `\nTUS POSTS RECIENTES (NO repitas su arranque, ejemplo, cifra ni tema):\n${recent}` : '',
    '\nDevuelve SOLO el texto del tweet.',
  ].join('\n');

  const text = await callClaude(prompt, 200, { caller: TAG, system });

  if (!text || text.length < 10) throw new Error('Claude returned empty tweet');
  return text.trim().slice(0, 280);
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
    // Persist so the narrative memory (this file + the Vercel content engine) avoids repeating it
    try {
      await db.query(
        `INSERT INTO social_posts (id, platform, content, status, "createdAt", "publishedAt")
         VALUES (gen_random_uuid()::text, 'twitter', $1, 'published', NOW(), NOW())`,
        [tweetText]
      );
    } catch (e) {
      console.error(`[${TAG}] Could not save tweet to social_posts: ${e.message}`);
    }
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

module.exports = { run, generateTweetContent };
