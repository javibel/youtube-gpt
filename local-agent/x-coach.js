'use strict';

// X COACH — el "trabajo de las personas" pero hecho por Javier en persona (@plata24155).
//
// Cada mañana genera un PLAN listo para ejecutar y lo envía a javijimenoplata@gmail.com:
//   1. Tweets listos para publicar (voz de Javier, biblia de marca) → copiar y pegar.
//   2. Lista de engagement: posts concretos de X para dar like y/o responder, con el
//      texto de respuesta YA REDACTADO. Javier pulsa el link, copia/pega o da like.
//
// La búsqueda en X es SOLO LECTURA (twitter.searchTweets, sesión brand) — no automatiza
// nada en la cuenta de Javier. Él ejecuta todo a mano.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const twitter = require('./twitter');
const { callClaude, detectPostLang } = require('./claude');
const { sendViaResend } = require('./resend');

const TAG = 'x-coach';
const RECIPIENT = 'javijimenoplata@gmail.com';
const SEEN_FILE = path.join(__dirname, 'x-coach-seen.json');
const MAX_SEEN = 400;

// Cuántas acciones de engagement proponer por día y cuántos tweets propios.
const TARGET_ENGAGEMENTS = 6;
const TARGET_POSTS = 2;

// Términos de búsqueda — conversaciones de creadores de YouTube ES+EN. Rotan a diario.
const SEARCH_QUERIES = [
  'youtube seo', 'crecer en youtube', 'small youtuber', 'youtube thumbnail',
  'youtube algorithm', 'no views youtube', 'grow my channel', 'miniatura youtube',
  'cómo crecer canal youtube', 'youtube tips', 'content creator help', 'pocas visitas youtube',
];

// ── Seen tracking (no repetir el mismo post día tras día) ────────────────────
function loadSeen() {
  try { return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'))); }
  catch { return new Set(); }
}
function saveSeen(set) {
  const arr = [...set].slice(-MAX_SEEN);
  try { fs.writeFileSync(SEEN_FILE, JSON.stringify(arr)); } catch {}
}

// Normaliza la URL del tweet a /status/<id> para dedup estable.
function tweetKey(url) {
  const m = String(url).match(/status\/(\d+)/);
  return m ? m[1] : url;
}

// Señal de alta intención (pregunta / problema explícito) — priorizamos estos.
function isHighIntent(text) {
  return /\?|help|recommend|how (do|to)|what tool|looking for|any (good|tool)|stuck|no views|nadie ve|c[óo]mo |ayuda|recomien|qu[ée] herramienta|pocas visitas/i.test(text);
}

// ── Redacción de respuestas (voz de Javier, fundador honesto) ────────────────
async function draftReply(author, text) {
  const lang = detectPostLang(text) === 'en' ? 'en' : 'es';
  const system = lang === 'es'
    ? [
        'Eres Javier (Javi Plata), fundador de YTubViral. Persona real, no community manager.',
        'Vienes de la automatización industrial (PLCs/SCADAs), ahora construyes un SaaS para creadores de YouTube. Hablas con honestidad, aportas valor, no vendes.',
        'Español de España (vosotros, léxico peninsular). Cero invención de datos/cifras/casos. No nombres herramientas de la competencia.',
        'Solo menciona ytubviral.com si encaja de forma MUY natural (rara vez); por defecto, NO lo menciones — aporta valor y punto.',
      ].join('\n')
    : [
        'You are Javier (Javi Plata), founder of YTubViral. A real person, not a community manager.',
        'Background in industrial automation (PLCs/SCADA), now building a SaaS for YouTube creators. Honest, value-first, never salesy.',
        'Reply in natural English. Never invent data/numbers/cases. Never name competitor tools.',
        'Only mention ytubviral.com if it fits VERY naturally (rarely); by default DO NOT mention it — just add value.',
      ].join('\n');

  const prompt = lang === 'es'
    ? `Este es un post de @${author} en X:\n"${text}"\n\nEscribe una respuesta breve (máx 240 caracteres), útil y humana, como le contestarías de verdad a un creador. Sin hashtags, sin comillas, máximo 1 emoji y solo si aporta. Devuelve SOLO el texto de la respuesta.`
    : `Here's a post by @${author} on X:\n"${text}"\n\nWrite a short reply (max 240 chars), genuinely helpful and human, the way you'd actually answer a creator. No hashtags, no quotes, max 1 emoji and only if it adds something. Return ONLY the reply text.`;

  try {
    const reply = await callClaude(prompt, 160, { caller: TAG, system });
    return reply ? reply.trim().replace(/^["']|["']$/g, '').slice(0, 280) : null;
  } catch (err) {
    console.error(`[${TAG}] draftReply error: ${err.message}`);
    return null;
  }
}

// ── Tweets propios para publicar ─────────────────────────────────────────────
async function generatePosts() {
  const { generateTweetContent } = require('./brand-twitter-post');
  const posts = [];
  for (let i = 0; i < TARGET_POSTS; i++) {
    try {
      const t = await generateTweetContent();
      if (t && !posts.includes(t)) posts.push(t);
    } catch (err) {
      console.error(`[${TAG}] generatePosts error: ${err.message}`);
    }
  }
  return posts;
}

// ── Recolección de targets de engagement ─────────────────────────────────────
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
      if (tw.text.trim().endsWith('…')) continue; // truncado
      usedKeys.add(key);
      collected.push({ ...tw, key, highIntent: isHighIntent(tw.text) });
    }
  }

  // Prioriza alta intención; coge los mejores TARGET_ENGAGEMENTS
  collected.sort((a, b) => (b.highIntent ? 1 : 0) - (a.highIntent ? 1 : 0));
  const chosen = collected.slice(0, TARGET_ENGAGEMENTS);

  // Redacta respuestas y marca como vistos
  for (const t of chosen) {
    t.reply = await draftReply(t.author, t.text);
    seen.add(t.key);
  }
  saveSeen(seen);
  return chosen;
}

// ── Construcción y envío del email ───────────────────────────────────────────
function buildEmail(posts, targets) {
  const fecha = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'long', year: 'numeric' });
  let body = `Plan de X para hoy — ${fecha}\nCuenta: @plata24155\n`;
  body += `${'='.repeat(55)}\n\n`;

  body += `PARTE 1 — PUBLICAR (${posts.length} tweets)\n`;
  body += `Copia y pega cada uno como tweet nuevo.\n\n`;
  if (!posts.length) {
    body += `(No se pudo generar contenido hoy — revisar logs)\n\n`;
  } else {
    posts.forEach((p, i) => {
      body += `--- Tweet ${i + 1} (${p.length} car.) ---\n${p}\n\n`;
    });
  }

  body += `\n${'='.repeat(55)}\n\n`;
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

  body += `${'='.repeat(55)}\n`;
  body += `Recordatorio: ritmo humano. No hace falta hacerlo todo de golpe —\n`;
  body += `repártelo en el día. Salta lo que no encaje contigo.\n\n`;
  body += `X Coach — YTubViral\n`;
  return body;
}

async function run() {
  console.log(`[${TAG}] Generando plan de X...`);
  const [posts, targets] = await Promise.all([
    generatePosts(),
    collectTargets(),
  ]);

  const subject = `📋 Plan de X para hoy — ${targets.length} acciones + ${posts.length} posts`;
  const body = buildEmail(posts, targets);

  try {
    await sendViaResend({ to: RECIPIENT, subject, body, from: 'agent' });
    console.log(`[${TAG}] Plan enviado a ${RECIPIENT} — ${posts.length} posts, ${targets.length} engagements`);
  } catch (err) {
    console.error(`[${TAG}] Envío fallido: ${err.message}`);
    // Fallback a disco
    fs.writeFileSync(path.join(__dirname, 'reports', `x-coach-${new Date().toISOString().slice(0, 10)}.txt`), body);
  }
  return { posts: posts.length, targets: targets.length };
}

module.exports = { run, draftReply, collectTargets, generatePosts };

if (require.main === module) {
  const db = require('./db');
  db.initDb()
    .then(() => run())
    .then(r => { console.log('Done', JSON.stringify(r)); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
