'use strict';

// BRAND SOCIAL COACH — plan diario para que Javier opere @YTubViral a mano en X y Bluesky.
//
// Diferencia con x-coach.js (@plata24155 personal):
// - Voz de marca/equipo, no de fundador individual
// - Búsquedas orientadas a problemas que YTubViral resuelve directamente
// - Respuestas más "servicio" — ofrece la herramienta cuando encaja
// - Genera posts de marca: tips, datos, mini-hilos útiles
// - Incluye sección Bluesky con posts adaptados (más largo, sin límite 280)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const twitter = require('./twitter');
const { callClaude, detectPostLang } = require('./claude');
const { sendViaResend } = require('./resend');

const bluesky = require('./bluesky');

const TAG = 'brand-x-coach';
const RECIPIENT = 'javijimenoplata@gmail.com';
const SEEN_FILE = path.join(__dirname, 'brand-x-coach-seen.json');
const BSKY_SEEN_FILE = path.join(__dirname, 'brand-bsky-coach-seen.json');
const MAX_SEEN = 400;

const TARGET_ENGAGEMENTS = 6;
const TARGET_POSTS = 2;
const BSKY_TARGET_ENGAGEMENTS = 6;
const BSKY_ACCOUNT = 'brand-ytubviral';

// Búsquedas orientadas a problemas que YTubViral resuelve
const SEARCH_QUERIES = [
  'youtube title ideas', 'youtube seo tool', 'keyword research youtube',
  'how to rank on youtube', 'youtube description generator', 'youtube tags',
  'seo score youtube', 'título vídeo youtube', 'herramienta seo youtube',
  'youtube analytics tips', 'optimize youtube video', 'mejorar seo youtube',
  'youtube thumbnail tips', 'best youtube tools', 'free youtube tools',
];

function loadSeen() {
  try { return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'))); }
  catch { return new Set(); }
}
function saveSeen(set) {
  const arr = [...set].slice(-MAX_SEEN);
  try { fs.writeFileSync(SEEN_FILE, JSON.stringify(arr)); } catch {}
}

function tweetKey(url) {
  const m = String(url).match(/status\/(\d+)/);
  return m ? m[1] : url;
}

function isHighIntent(text) {
  return /\?|help|recommend|how (do|to)|what tool|looking for|any (good|tool|free)|best tool|herramienta|recomiend|qué us|cómo mejorar|necesito/i.test(text);
}

// Voz de marca — equipo YTubViral, cercano pero profesional
async function draftReply(author, text) {
  const lang = detectPostLang(text) === 'en' ? 'en' : 'es';
  const system = lang === 'es'
    ? [
        'Eres el equipo de YTubViral (@YTubViral), herramienta gratuita de IA para YouTubers.',
        'Tono: cercano, profesional, útil. Como un equipo pequeño que de verdad quiere ayudar.',
        'Puedes mencionar ytubviral.com cuando sea relevante (el usuario busca herramientas, pregunta por SEO, títulos, keywords). Hazlo natural, no spam.',
        'Español de España. Cero invención de datos. No nombres competidores.',
        'Sin hashtags. Máximo 1 emoji si aporta.',
      ].join('\n')
    : [
        'You are the YTubViral team (@YTubViral), a free AI toolkit for YouTube creators.',
        'Tone: approachable, professional, genuinely helpful. Small team that cares.',
        'You CAN mention ytubviral.com when relevant (user is looking for tools, asking about SEO, titles, keywords). Keep it natural, not spammy.',
        'Never invent data. Never name competitors.',
        'No hashtags. Max 1 emoji if it adds value.',
      ].join('\n');

  const prompt = lang === 'es'
    ? `Post de @${author} en X:\n"${text}"\n\nEscribe una respuesta breve (máx 240 car.) desde @YTubViral. Útil primero, mención del producto solo si encaja. Sin hashtags ni comillas. SOLO el texto de la respuesta.`
    : `Post by @${author} on X:\n"${text}"\n\nWrite a short reply (max 240 chars) from @YTubViral. Value first, product mention only if it fits. No hashtags, no quotes. Return ONLY the reply text.`;

  try {
    const reply = await callClaude(prompt, 160, { caller: TAG, system });
    return reply ? reply.trim().replace(/^["']|["']$/g, '').slice(0, 280) : null;
  } catch (err) {
    console.error(`[${TAG}] draftReply error: ${err.message}`);
    return null;
  }
}

// --- Bluesky engagement ---

const BSKY_SEARCH_QUERIES = [
  'youtube seo', 'youtube tips', 'youtube growth', 'small youtuber',
  'keyword research youtube', 'youtube thumbnail', 'creator tools',
  'grow my channel', 'youtube algorithm', 'youtube analytics',
  'crecer en youtube', 'seo youtube', 'herramienta youtube',
];

function loadBskySeen() {
  try { return new Set(JSON.parse(fs.readFileSync(BSKY_SEEN_FILE, 'utf8'))); }
  catch { return new Set(); }
}
function saveBskySeen(set) {
  const arr = [...set].slice(-MAX_SEEN);
  try { fs.writeFileSync(BSKY_SEEN_FILE, JSON.stringify(arr)); } catch {}
}

function postToUrl(post) {
  const did = post.author?.did;
  const handle = post.author?.handle;
  const rkey = post.uri?.split('/').pop();
  if (handle && rkey) return `https://bsky.app/profile/${handle}/post/${rkey}`;
  if (did && rkey) return `https://bsky.app/profile/${did}/post/${rkey}`;
  return null;
}

async function draftBskyReply(author, text) {
  const lang = detectPostLang(text) === 'en' ? 'en' : 'es';
  const system = lang === 'es'
    ? [
        'Eres el equipo de YTubViral (ytubviral.com), herramienta gratuita de IA para YouTubers.',
        'Tono: cercano, profesional, útil. Equipo pequeño que quiere ayudar.',
        'Puedes mencionar ytubviral.com cuando sea relevante. Hazlo natural.',
        'Español de España. Cero invención. No nombres competidores.',
        'Sin hashtags. Máximo 1 emoji. Máximo 280 caracteres.',
      ].join('\n')
    : [
        'You are the YTubViral team (ytubviral.com), a free AI toolkit for YouTube creators.',
        'Tone: approachable, professional, genuinely helpful. Small team that cares.',
        'You CAN mention ytubviral.com when relevant. Keep it natural.',
        'Never invent data. Never name competitors.',
        'No hashtags. Max 1 emoji. Max 280 chars.',
      ].join('\n');

  const prompt = lang === 'es'
    ? `Post de @${author} en Bluesky:\n"${text}"\n\nEscribe una respuesta breve (máx 280 car.) desde la cuenta de YTubViral. Útil primero, mención del producto solo si encaja. SOLO el texto.`
    : `Post by @${author} on Bluesky:\n"${text}"\n\nWrite a short reply (max 280 chars) from the YTubViral account. Value first, product mention only if it fits. Return ONLY the reply text.`;

  try {
    const reply = await callClaude(prompt, 160, { caller: TAG, system });
    return reply ? reply.trim().replace(/^["']|["']$/g, '').slice(0, 300) : null;
  } catch (err) {
    console.error(`[${TAG}] draftBskyReply error: ${err.message}`);
    return null;
  }
}

async function collectBskyTargets() {
  const agent = await bluesky.login(BSKY_ACCOUNT).catch(() => null);
  if (!agent) {
    console.log(`[${TAG}] Bluesky login failed for ${BSKY_ACCOUNT} — skipping engagement`);
    return [];
  }

  const seen = loadBskySeen();
  const queries = [...BSKY_SEARCH_QUERIES].sort(() => Math.random() - 0.5).slice(0, 4);
  const collected = [];
  const usedKeys = new Set();

  for (const query of queries) {
    if (collected.length >= BSKY_TARGET_ENGAGEMENTS * 2) break;
    console.log(`[${TAG}] Bluesky buscando: "${query}"`);
    const posts = await bluesky.searchRecent(agent, query, 12).catch(() => []);
    for (const post of posts) {
      const text = post.record?.text || '';
      const rkey = post.uri?.split('/').pop();
      if (!rkey || usedKeys.has(rkey) || seen.has(rkey)) continue;
      if (text.length < 20) continue;
      const author = post.author?.handle || '';
      if (author.includes('ytubviral')) continue;
      usedKeys.add(rkey);
      collected.push({
        author,
        text,
        url: postToUrl(post),
        key: rkey,
        highIntent: isHighIntent(text),
      });
    }
  }

  collected.sort((a, b) => (b.highIntent ? 1 : 0) - (a.highIntent ? 1 : 0));
  const chosen = collected.slice(0, BSKY_TARGET_ENGAGEMENTS);

  for (const t of chosen) {
    t.reply = await draftBskyReply(t.author, t.text);
    seen.add(t.key);
  }
  saveBskySeen(seen);
  return chosen;
}

// Posts de marca para Bluesky — más largos, con link, tono equipo
async function generateBlueskyPosts() {
  const system = [
    'Eres el equipo de YTubViral (ytubviral.com). Escribes posts para Bluesky dirigidos a creadores de YouTube.',
    'Tono: cercano, profesional, de equipo pequeño. Bluesky permite 300 caracteres.',
    'Puedes mencionar ytubviral.com en ~1 de cada 2 posts — siempre con contexto útil.',
    'NUNCA inventes cifras, casos de éxito ni testimonios. Todo real o genérico.',
    'Sin hashtags. Máximo 1 emoji. Bilingüe: alterna español e inglés entre posts.',
    'Alterna entre: tip accionable, pregunta a la audiencia, dato/insight.',
  ].join('\n');

  const posts = [];
  const prompts = [
    'Escribe un post de marca para Bluesky (máx 300 car.) con un tip accionable sobre SEO de YouTube o cómo mejorar títulos. EN INGLÉS. Devuelve SOLO el texto.',
    'Escribe un post de marca para Bluesky (máx 300 car.) con una pregunta interesante a creadores de YouTube o un insight útil. EN ESPAÑOL de España. Devuelve SOLO el texto.',
  ];
  for (const prompt of prompts) {
    try {
      const t = await callClaude(prompt, 180, { caller: TAG, system });
      if (t) posts.push(t.trim().replace(/^["']|["']$/g, '').slice(0, 300));
    } catch (err) {
      console.error(`[${TAG}] generateBlueskyPosts error: ${err.message}`);
    }
  }
  return posts;
}

// Posts de marca para X — tips útiles, datos, mini-insights
async function generatePosts() {
  const system = [
    'Eres el equipo de YTubViral (@YTubViral). Escribes tweets de marca: tips, datos reales, insights para creadores de YouTube.',
    'Tono: profesional pero cercano. Un equipo pequeño que sabe de SEO de YouTube.',
    'Puedes mencionar ytubviral.com en ~1 de cada 3 tweets, siempre con contexto útil.',
    'NUNCA inventes cifras, casos de éxito ni testimonios. Todo real o genérico.',
    'Sin hashtags. Sin emojis excesivos (máx 1). Español de España.',
    'Alterna entre: tip accionable, pregunta a la audiencia, dato/insight, mini-hilo (2 tweets separados por \\n\\n).',
  ].join('\n');

  const posts = [];
  for (let i = 0; i < TARGET_POSTS; i++) {
    try {
      const prompt = i === 0
        ? 'Escribe un tweet de marca (máx 280 car.) con un tip accionable sobre SEO de YouTube, títulos o keywords. Devuelve SOLO el texto.'
        : 'Escribe un tweet de marca (máx 280 car.) con una pregunta interesante a creadores de YouTube o un insight sobre cómo funciona el algoritmo. Devuelve SOLO el texto.';
      const t = await callClaude(prompt, 160, { caller: TAG, system });
      if (t) posts.push(t.trim().replace(/^["']|["']$/g, '').slice(0, 280));
    } catch (err) {
      console.error(`[${TAG}] generatePosts error: ${err.message}`);
    }
  }
  return posts;
}

async function collectTargets() {
  const seen = loadSeen();
  const queries = [...SEARCH_QUERIES].sort(() => Math.random() - 0.5).slice(0, 5);
  const collected = [];
  const usedKeys = new Set();

  for (const query of queries) {
    if (collected.length >= TARGET_ENGAGEMENTS * 2) break;
    console.log(`[${TAG}] Buscando: "${query}"`);
    const tweets = await twitter.searchTweets({ query, max: 12 }).catch(() => []);
    for (const tw of tweets) {
      const key = tweetKey(tw.tweetUrl);
      if (usedKeys.has(key) || seen.has(key)) continue;
      if (!twitter.isRelevantTweet(tw.text)) continue;
      if (tw.text.trim().endsWith('…')) continue;
      usedKeys.add(key);
      collected.push({ ...tw, key, highIntent: isHighIntent(tw.text) });
    }
  }

  collected.sort((a, b) => (b.highIntent ? 1 : 0) - (a.highIntent ? 1 : 0));
  const chosen = collected.slice(0, TARGET_ENGAGEMENTS);

  for (const t of chosen) {
    t.reply = await draftReply(t.author, t.text);
    seen.add(t.key);
  }
  saveSeen(seen);
  return chosen;
}

function buildEmail(posts, targets, bskyPosts, bskyTargets) {
  const fecha = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'long', year: 'numeric' });
  let body = `Plan BRAND para hoy — ${fecha}\nCuentas: @YTubViral (X) + ytubviral.com (Bluesky)\n`;
  body += `${'='.repeat(55)}\n\n`;

  // --- X ---
  body += `📌 X / TWITTER — @YTubViral\n\n`;

  body += `PARTE 1 — PUBLICAR (${posts.length} tweets)\n`;
  body += `Copia y pega cada uno como tweet nuevo.\n\n`;
  if (!posts.length) {
    body += `(No se pudo generar contenido hoy — revisar logs)\n\n`;
  } else {
    posts.forEach((p, i) => {
      body += `--- Tweet ${i + 1} (${p.length} car.) ---\n${p}\n\n`;
    });
  }

  body += `PARTE 2 — ENGAGEMENT (${targets.length} acciones)\n`;
  body += `Pulsa el link. Da like. Si hay respuesta, cópiala y pégala.\n\n`;
  if (!targets.length) {
    body += `(No se encontraron posts relevantes hoy)\n\n`;
  } else {
    targets.forEach((t, i) => {
      body += `${i + 1}. ${t.highIntent ? '🔥 ' : ''}@${t.author || 'usuario'}\n`;
      body += `   Post: "${t.text.slice(0, 180)}${t.text.length > 180 ? '…' : ''}"\n`;
      body += `   Link: ${t.tweetUrl}\n`;
      body += `   Acción: dar LIKE${t.reply ? ' + responder' : ''}\n`;
      if (t.reply) body += `   Respuesta:\n   ${t.reply}\n`;
      body += `\n`;
    });
  }

  // --- Bluesky ---
  body += `\n${'='.repeat(55)}\n\n`;
  body += `🦋 BLUESKY — ytubviral.com\n`;
  body += `https://bsky.app/profile/ytubviral.com\n\n`;

  body += `PARTE 3 — PUBLICAR (${bskyPosts.length} posts en Bluesky)\n`;
  body += `Abre Bluesky, copia y pega cada post.\n\n`;
  if (!bskyPosts.length) {
    body += `(No se pudo generar contenido hoy)\n\n`;
  } else {
    bskyPosts.forEach((p, i) => {
      body += `--- Post ${i + 1} (${p.length} car.) ---\n${p}\n\n`;
    });
  }

  body += `PARTE 4 — ENGAGEMENT (${bskyTargets.length} acciones en Bluesky)\n`;
  body += `Pulsa el link. Da like. Si hay respuesta, cópiala y pégala.\n\n`;
  if (!bskyTargets.length) {
    body += `(No se encontraron posts relevantes o la cuenta brand no está configurada)\n`;
    body += `Para activar: añade "brand-ytubviral" en bluesky-accounts.json\n\n`;
  } else {
    bskyTargets.forEach((t, i) => {
      body += `${i + 1}. ${t.highIntent ? '🔥 ' : ''}@${t.author || 'usuario'}\n`;
      body += `   Post: "${t.text.slice(0, 200)}${t.text.length > 200 ? '…' : ''}"\n`;
      body += `   Link: ${t.url}\n`;
      body += `   Acción: dar LIKE${t.reply ? ' + responder' : ''}\n`;
      if (t.reply) body += `   Respuesta:\n   ${t.reply}\n`;
      body += `\n`;
    });
  }

  body += `${'='.repeat(55)}\n`;
  body += `Recordatorio: voz de equipo, no personal. Mencionar producto cuando encaje.\n`;
  body += `X = @YTubViral | Bluesky = ytubviral.com\n\n`;
  body += `Brand Social Coach — YTubViral\n`;
  return body;
}

async function run() {
  console.log(`[${TAG}] Generando plan brand (X + Bluesky)...`);
  const [posts, targets, bskyPosts, bskyTargets] = await Promise.all([
    generatePosts(),
    collectTargets(),
    generateBlueskyPosts(),
    collectBskyTargets(),
  ]);

  const subject = `🏷️ Plan Brand — X: ${posts.length}p+${targets.length}eng | Bsky: ${bskyPosts.length}p+${bskyTargets.length}eng`;
  const body = buildEmail(posts, targets, bskyPosts, bskyTargets);

  try {
    await sendViaResend({ to: RECIPIENT, subject, body, from: 'agent' });
    console.log(`[${TAG}] Plan enviado a ${RECIPIENT} — X: ${posts.length}p+${targets.length}eng, Bsky: ${bskyPosts.length}p+${bskyTargets.length}eng`);
  } catch (err) {
    console.error(`[${TAG}] Envío fallido: ${err.message}`);
    fs.writeFileSync(path.join(__dirname, 'reports', `brand-x-coach-${new Date().toISOString().slice(0, 10)}.txt`), body);
  }
  return { posts: posts.length, targets: targets.length };
}

module.exports = { run };

if (require.main === module) {
  const db = require('./db');
  db.initDb()
    .then(() => run())
    .then(r => { console.log('Done', JSON.stringify(r)); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
