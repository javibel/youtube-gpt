'use strict';

// BRAND BLUESKY COACH — plan diario para que Javier opere la cuenta de marca en Bluesky
// (bsky.app/profile/ytubviral.com) a mano.
//
// Historia: antes esto era "brand-x-coach.js" y cubría X (@YTubViral) + Bluesky.
// 31/08/2026 Javier abandona Twitter/X por completo (cuenta quemada) — este coach
// queda SOLO como Bluesky. El X Coach personal (@plata24155) también se apagó.
//
// Dos bloques en el email:
//   PARTE 1 — PUBLICAR: posts de iniciativa propia de la marca (tip / pregunta / dato).
//   PARTE 2 — RESPONDER: solo a creadores que piden (directa o indirectamente) consejo
//            o feedback sobre su propio canal.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { callClaude, detectPostLang } = require('./claude');
const { sendViaResend } = require('./resend');

const bluesky = require('./bluesky');

const TAG = 'brand-bluesky-coach';
const RECIPIENT = 'javijimenoplata@gmail.com';
const BSKY_SEEN_FILE = path.join(__dirname, 'brand-bsky-coach-seen.json');
const MAX_SEEN = 400;

// Engagement en Bluesky = responder solo a creadores que piden ayuda sobre su canal.
const BSKY_TARGET_ENGAGEMENTS = 8;
const BSKY_ACCOUNT = 'brand-ytubviral';

// Datos reales autorizados (estudio propio, API oficial de YouTube) — la ÚNICA
// fuente de cifras propias citables. Público en ytubviral.com/youtube-title-study.
const REAL_DATA =
  'DATOS REALES citables (estudio propio de 1.814 títulos vía API de YouTube, en ytubviral.com/youtube-title-study): ' +
  'longitud mediana 48 caracteres en trending global vs 69 en los más vistos por nicho; con número 29% vs 41%; listicles 6% vs 21%; palabras gancho 7% vs 27%. ' +
  'Son las únicas cifras propias permitidas — cualquier otra, no la uses.';

// ── Búsqueda de creadores que piden ayuda ───────────────────────────────────

// Búsquedas orientadas a creadores que piden feedback/consejo sobre SU canal,
// no a conversaciones genéricas de SEO.
const BSKY_SEARCH_QUERIES = [
  'my youtube channel', 'youtube feedback', 'roast my channel', 'rate my channel',
  'youtube channel review', 'why no views', 'no views youtube', 'first youtube video',
  'started a youtube channel', 'how do i grow youtube', 'youtube not growing',
  'small youtuber advice', 'youtube thumbnail feedback', 'stuck at subscribers',
  'mi canal de youtube', 'no tengo visitas youtube', 'cómo hago crecer mi canal',
  'empecé un canal de youtube', 'consejo para youtubers', 'feedback miniatura youtube',
];

// El post debe hablar del PROPIO canal/contenido del autor (primera persona)…
const BSKY_FIRST_PERSON = /\b(my channel|my (first )?video|my content|my views|my subs|my subscribers|my thumbnail|i (just )?(started|posted|uploaded|launched|made|created)|i'?m a (small |new )?(youtuber|creator))\b|\bmi canal\b|\bmis? v[íi]deos?\b|\bmi contenido\b|\bmis visitas\b|\bmi miniatura\b|\bacabo de (subir|empezar|publicar|crear)\b|\bhe (empezado|subido|publicado|creado)\b|\bsoy (un[a]? )?(peque[ñn][oa] )?(youtuber|creador[a]?)\b/i;
// …y pedir ayuda de forma explícita (pregunta) o indirecta (frustración/estancamiento).
const BSKY_ASKING = /\?|\b(advice|feedback|help|tips|critique|roast|review|thoughts|suggestions|how do i|how can i|what am i doing wrong|any (tips|advice|ideas|suggestions))\b|\bconsejo\b|\bayuda\b|\bfeedback\b|\bqu[ée] hago mal\b|\bc[óo]mo (puedo|hago|consigo|mejoro)\b|\balguna (idea|recomendaci[óo]n|sugerencia)\b/i;
const BSKY_STRUGGLE = /\b(no views|no one watches|nobody watches|0 views|zero views|not growing|can'?t grow|plateau|stuck at|still (only )?\d+ subs|discouraged|frustrated|about to give up|demotivat)\b|\bsin visitas\b|\bnadie (me )?(ve|mira)\b|\bno crece\b|\bestancad|\bno consigo\b|\bdesanimad|\ba punto de rendir/i;

// ¿Es un creador buscando (directa o indirectamente) consejo sobre su canal?
// Único tipo de post al que la marca debe responder en Bluesky.
function isCreatorSeekingAdvice(text) {
  if (!BSKY_FIRST_PERSON.test(text)) return false;
  return BSKY_ASKING.test(text) || BSKY_STRUGGLE.test(text);
}

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
        'Contexto: este creador está pidiendo ayuda o feedback sobre su canal. Tu único objetivo es AYUDARLE de verdad.',
        'Da 1-2 consejos concretos y accionables sobre SU caso (títulos, miniatura, primeros segundos, nicho, constancia…). Nada de generalidades.',
        'NO menciones ytubviral.com salvo que pida explícitamente una herramienta; si lo haces, una sola vez y sin sonar a anuncio.',
        'Tono: cercano, de igual a igual, equipo pequeño que ha pasado por lo mismo. Español de España.',
        'Cero invención de datos/casos. No nombres competidores. Sin hashtags. Máximo 1 emoji. Máximo 280 caracteres.',
      ].join('\n')
    : [
        'You are the YTubViral team (ytubviral.com), a free AI toolkit for YouTube creators.',
        'Context: this creator is asking for help or feedback on their channel. Your only goal is to genuinely HELP them.',
        'Give 1-2 specific, actionable tips for THEIR situation (titles, thumbnail, first seconds, niche, consistency…). No generic filler.',
        'Do NOT mention ytubviral.com unless they explicitly ask for a tool; if you do, once only and never ad-like.',
        'Tone: warm, peer-to-peer, small team that has been there. Natural English.',
        'Never invent data or cases. Never name competitors. No hashtags. Max 1 emoji. Max 280 chars.',
      ].join('\n');

  const prompt = lang === 'es'
    ? `Post de @${author} en Bluesky (un creador pidiendo ayuda):\n"${text}"\n\nEscribe una respuesta breve (máx 280 car.) que le sea de verdad útil. SOLO el texto.`
    : `Post by @${author} on Bluesky (a creator asking for help):\n"${text}"\n\nWrite a short reply (max 280 chars) that is genuinely useful to them. Return ONLY the reply text.`;

  try {
    const reply = await callClaude(prompt, 160, { caller: TAG, system });
    return reply ? reply.trim().replace(/^["']|["']$/g, '').slice(0, 300) : null;
  } catch (err) {
    console.error(`[${TAG}] draftBskyReply error: ${err.message}`);
    return null;
  }
}

async function collectBskyTargets() {
  // Login con cualquier cuenta disponible — solo necesitamos leer, no postear
  const accounts = ['brand-ytubviral', 'persona-alex', 'persona-ferran', 'persona-ana', 'persona-mayra'];
  let agent = null;
  for (const acct of accounts) {
    agent = await bluesky.login(acct).catch(() => null);
    if (agent) { console.log(`[${TAG}] Bluesky search via ${acct}`); break; }
  }
  if (!agent) {
    console.log(`[${TAG}] No Bluesky account available — skipping engagement`);
    return [];
  }

  const seen = loadBskySeen();
  const queries = [...BSKY_SEARCH_QUERIES].sort(() => Math.random() - 0.5).slice(0, 6);
  const collected = [];
  const usedKeys = new Set();

  for (const query of queries) {
    if (collected.length >= BSKY_TARGET_ENGAGEMENTS * 3) break;
    console.log(`[${TAG}] Bluesky buscando: "${query}"`);
    const posts = await bluesky.searchRecent(agent, query, 15).catch(() => []);
    for (const post of posts) {
      const text = post.record?.text || '';
      const rkey = post.uri?.split('/').pop();
      if (!rkey || usedKeys.has(rkey) || seen.has(rkey)) continue;
      if (text.length < 20) continue;
      const author = post.author?.handle || '';
      if (author.includes('ytubviral')) continue;
      // SOLO creadores pidiendo ayuda/feedback sobre su propio canal.
      if (!isCreatorSeekingAdvice(text)) continue;
      // Descarta a otras marcas/herramientas haciéndose autopromo.
      if (/\b(our (tool|app|platform)|we built|check out my (tool|app)|link in bio|use code|sign up (now|today)|affiliate)\b/i.test(text)) continue;
      usedKeys.add(rkey);
      collected.push({
        author,
        text,
        url: postToUrl(post),
        key: rkey,
        highIntent: BSKY_ASKING.test(text), // pregunta explícita > señal indirecta
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

// ── Posts propios de la marca ───────────────────────────────────────────────

// Posts de iniciativa propia de la marca en Bluesky (tip / pregunta / dato).
// Bluesky es un canal más donde YTubViral publica su propio contenido; esto NO es
// engagement (para eso, collectBskyTargets).
async function generateBlueskyPosts() {
  const system = [
    'Eres el equipo de YTubViral (ytubviral.com). Escribes posts para Bluesky dirigidos a creadores de YouTube.',
    'Tono: cercano, profesional, de equipo pequeño. Bluesky permite 300 caracteres.',
    'Puedes mencionar ytubviral.com en ~1 de cada 2 posts — siempre con contexto útil.',
    'NUNCA inventes cifras, casos de éxito ni testimonios. Todo real o genérico.',
    REAL_DATA,
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

// ── Email ───────────────────────────────────────────────────────────────────

function buildEmail(bskyPosts, bskyTargets) {
  const fecha = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'long', year: 'numeric' });
  let body = `Plan BLUESKY de marca para hoy — ${fecha}\n`;
  body += `Cuenta: ytubviral.com — https://bsky.app/profile/ytubviral.com\n`;
  body += `${'='.repeat(55)}\n\n`;

  body += `PARTE 1 — PUBLICAR (${bskyPosts.length} posts)\n`;
  body += `Iniciativa propia de la marca. Abre Bluesky, copia y pega cada post.\n\n`;
  if (!bskyPosts.length) {
    body += `(No se pudo generar contenido hoy — revisar logs)\n\n`;
  } else {
    bskyPosts.forEach((p, i) => {
      body += `--- Post ${i + 1} (${p.length} car.) ---\n${p}\n\n`;
    });
  }

  body += `\n${'='.repeat(55)}\n\n`;
  body += `PARTE 2 — RESPONDER a creadores que piden ayuda (${bskyTargets.length})\n`;
  body += `Solo creadores que piden (directa o indirectamente) consejo o feedback\n`;
  body += `sobre su propio canal. Pulsa el link, da like y pega la respuesta.\n`;
  body += `Salta lo que no encaje.\n\n`;
  if (!bskyTargets.length) {
    body += `(Hoy no se encontró ningún creador pidiendo ayuda — o la cuenta brand no está configurada)\n`;
    body += `Para activar: añade "brand-ytubviral" en bluesky-accounts.json\n\n`;
  } else {
    bskyTargets.forEach((t, i) => {
      body += `${i + 1}. ${t.highIntent ? '🔥 ' : ''}@${t.author || 'usuario'}\n`;
      body += `   Post: "${t.text.slice(0, 240)}${t.text.length > 240 ? '…' : ''}"\n`;
      body += `   Link: ${t.url}\n`;
      body += `   Acción: dar LIKE${t.reply ? ' + responder' : ''}\n`;
      if (t.reply) body += `   Respuesta:\n   ${t.reply}\n`;
      body += `\n`;
    });
  }

  body += `${'='.repeat(55)}\n`;
  body += `Recordatorio: voz de equipo. Ayudar primero; producto solo si lo piden.\n\n`;
  body += `Brand Bluesky Coach — YTubViral\n`;
  return body;
}

async function run() {
  console.log(`[${TAG}] Generando plan Bluesky de marca...`);
  const [bskyPosts, bskyTargets] = await Promise.all([
    generateBlueskyPosts(),
    collectBskyTargets(),
  ]);

  const subject = `🦋 Plan Bluesky marca — ${bskyPosts.length} posts + ${bskyTargets.length} respuestas a creadores`;
  const body = buildEmail(bskyPosts, bskyTargets);

  try {
    await sendViaResend({ to: RECIPIENT, subject, body, from: 'agent' });
    console.log(`[${TAG}] Plan enviado a ${RECIPIENT} — Bsky: ${bskyPosts.length}p + ${bskyTargets.length}eng`);
  } catch (err) {
    console.error(`[${TAG}] Envío fallido: ${err.message}`);
    fs.writeFileSync(path.join(__dirname, 'reports', `brand-bluesky-coach-${new Date().toISOString().slice(0, 10)}.txt`), body);
  }
  return { posts: bskyPosts.length, targets: bskyTargets.length };
}

module.exports = { run };

if (require.main === module) {
  const db = require('./db');
  db.initDb()
    .then(() => run())
    .then(r => { console.log('Done', JSON.stringify(r)); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
