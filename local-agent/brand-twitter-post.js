'use strict';

/**
 * Brand Twitter Post — generates a daily tweet with infographic and posts
 * via Puppeteer using the brand account (chrome-profile).
 *
 * Replaces the Twitter API (paid) with free Puppeteer-based posting.
 * Called from index.js cron at 09:00 Europe/Madrid.
 *
 * Usage:
 *   node brand-twitter-post.js          # run manually
 *   require('./brand-twitter-post').run() # from cron
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { callClaude } = require('./claude');
const { postTweet } = require('./outreach-tweet');

const TAG = 'brand-twitter-post';
const BASE_URL = (process.env.NEXTAUTH_URL || 'https://ytubviral.com').replace(/\/$/, '');

// ── Day themes (mirrored from content-generator.ts) ─────────────────────────

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

const DAY_TAGS = {
  0: 'Dato YouTube',
  1: 'Error Común',
  2: 'Tip Práctico',
  3: 'Tutorial',
  4: 'Herramienta',
  5: 'Debate',
  6: 'Comparativa',
};

const FORMATS = ['listicle', 'micro-story', 'hot-take', 'framework'];

function getTodayFormat() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return FORMATS[dayOfYear % FORMATS.length];
}

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
  // Trim to 280 chars max
  return text.slice(0, 280);
}

// ── Infographic URL builder (mirrored from infographic-generator.ts) ────────

function extractTitle(content) {
  const firstLine = content.split('\n').find(l => l.trim().length > 10);
  if (!firstLine) return 'YouTube Tips';
  return firstLine
    .replace(/#\S+/g, '')
    .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ¿?¡!.,:\-–—%()'"]/g, '')
    .trim()
    .slice(0, 120);
}

function extractQuote(content) {
  const sentences = content
    .split(/[.!?]\s/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 150);
  return (sentences[0] || content.slice(0, 100)).replace(/[.!?]$/, '');
}

function buildInfographicUrl(content) {
  const fmt = getTodayFormat();
  const tag = DAY_TAGS[new Date().getDay()] || 'YouTube Tips';
  const params = new URLSearchParams();
  params.set('format', fmt === 'micro-story' ? 'story' : fmt);
  params.set('tag', tag);

  // For a single tweet, use quote/story format (most versatile)
  params.set('format', 'story');
  params.set('quote', extractQuote(content));

  return `${BASE_URL}/api/og/infographic?${params.toString()}`;
}

// ── Image download ──────────────────────────────────────────────────────────

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `ytubviral-infographic-${Date.now()}.png`);

    const get = (targetUrl, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const mod = targetUrl.startsWith('https') ? https : require('http');

      mod.get(targetUrl, { timeout: 15000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} downloading infographic`));
        }

        const file = fs.createWriteStream(tmpPath);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(tmpPath); });
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

  // 2. Build infographic URL and download
  const infographicUrl = buildInfographicUrl(tweetText);
  console.log(`[${TAG}] Downloading infographic...`);

  let imagePath = null;
  try {
    imagePath = await downloadImage(infographicUrl);
    console.log(`[${TAG}] Infographic downloaded: ${imagePath}`);
  } catch (err) {
    console.error(`[${TAG}] Infographic download failed: ${err.message} — posting without image`);
  }

  // 3. Post via Puppeteer with brand account
  try {
    await postTweet('brand', tweetText, imagePath);
    console.log(`[${TAG}] Brand tweet posted successfully!`);
  } finally {
    // Clean up temp image
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
