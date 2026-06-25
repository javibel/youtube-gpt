'use strict';

// Bluesky persona driver — usa la API oficial (AT Protocol) vía @atproto/api.
// A diferencia de twitter/reddit/facebook NO usa Puppeteer ni perfiles de Chrome:
// se autentica con handle + app password (no la contraseña real) → riesgo de ban mínimo.
// Credenciales por persona en bluesky-accounts.json (gitignored, junto a las cookies):
//   { "persona-alex": { "handle": "alex.bsky.social", "appPassword": "xxxx-xxxx-xxxx-xxxx" }, ... }
// App passwords se generan en Bluesky → Settings → App Passwords.

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { sendEmail } = require('./reports');
const { adjustedLimit, shouldSkipSession, shouldSkipPost, readingPause, actionPause, commentPause } = require('./humanize');

const BASE_LIMITS = { likes: 6, replies: 2 };

// Términos de búsqueda por persona — cada una tiene su propio pool para que
// no acaben en los mismos posts simultáneamente.
const PERSONA_SEARCH_TERMS = {
  'persona-alex': [
    'youtube thumbnail', 'video editing tips', 'youtube production', 'miniatura youtube',
    'editar vídeo youtube', 'content creator setup', 'youtube shorts editing',
  ],
  'persona-ferran': [
    'youtube growth', 'youtube algorithm', 'youtube seo', 'crecer en youtube',
    'algoritmo de youtube', 'youtube marketing', 'canal de youtube pequeño',
  ],
  'persona-ana': [
    'content creator tips', 'youtube community', 'social media youtube', 'creadores de contenido',
    'estrategia youtube', 'youtube engagement', 'gestionar canal youtube',
  ],
  'persona-mayra': [
    'youtube titles', 'youtube description seo', 'small youtuber', 'seo youtube',
    'títulos youtube', 'grow my channel', 'youtube keyword research',
  ],
};
// Fallback pool si la persona no tiene asignados términos propios
const DEFAULT_SEARCH_TERMS = [
  'youtube growth', 'small youtuber', 'youtube seo', 'crecer en youtube', 'creadores de contenido',
];

// Palabras que confirman que el post va de YouTube/creadores (filtro de relevancia ligero).
const RELEVANT = /(youtube|yt\b|canal|channel|subscriber|suscriptor|thumbnail|miniatura|video|vídeo|views|visitas|creador|creator|algoritmo|algorithm|seo)/i;

const OWN_HANDLES = new Set(); // se rellena con el handle propio en cada sesión para no auto-responder

let _AgentCtor = null;
function getAgentCtor() {
  if (_AgentCtor) return _AgentCtor;
  const pkg = require('@atproto/api');
  _AgentCtor = pkg.AtpAgent || pkg.BskyAgent;
  if (!_AgentCtor) throw new Error('@atproto/api no exporta AtpAgent/BskyAgent');
  return _AgentCtor;
}

function loadAccounts() {
  const file = path.join(__dirname, 'bluesky-accounts.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

let sessionAlertSent = false;

async function login(accountId) {
  const accounts = loadAccounts();
  const creds = accounts[accountId];
  if (!creds || !creds.handle || !creds.appPassword) {
    console.error(`[bluesky:${accountId}] Sin credenciales en bluesky-accounts.json`);
    return null;
  }
  const Agent = getAgentCtor();
  const agent = new Agent({ service: creds.service || 'https://bsky.social' });
  try {
    await agent.login({ identifier: creds.handle, password: creds.appPassword });
    OWN_HANDLES.add(creds.handle.toLowerCase());
    sessionAlertSent = false;
    return agent;
  } catch (err) {
    console.error(`[bluesky:${accountId}] Login fallido: ${err.message}`);
    if (!sessionAlertSent) {
      sessionAlertSent = true;
      await sendEmail(
        'YCML Bluesky: login fallido',
        `No se pudo iniciar sesión en Bluesky para ${accountId} (${creds.handle}).\n` +
        `Revisa el app password en bluesky-accounts.json (Bluesky > Settings > App Passwords).\n\nAgente YTubViral`
      ).catch(e => console.error('[bluesky] alert failed:', e.message));
    }
    return null;
  }
}

async function searchRecent(agent, term, limit = 15) {
  try {
    const res = await agent.app.bsky.feed.searchPosts({ q: term, limit, sort: 'latest' });
    return res?.data?.posts || [];
  } catch (err) {
    console.error(`[bluesky] searchPosts("${term}") error: ${err.message}`);
    return [];
  }
}

function isOwnPost(post) {
  const h = post?.author?.handle?.toLowerCase() || '';
  return OWN_HANDLES.has(h);
}

// opts: { accountId, persona, commentGenerator }
async function engageWithPosts(opts = {}) {
  const accountId = opts.accountId || null;
  const commentGen = opts.commentGenerator;
  const tag = `bluesky:${accountId}`;

  if (!commentGen) {
    console.error(`[${tag}] sin commentGenerator`);
    return;
  }
  if (shouldSkipSession()) {
    console.log(`[${tag}] Skipping session (random rest)`);
    return;
  }

  const limits = { likes: adjustedLimit(BASE_LIMITS.likes), replies: adjustedLimit(BASE_LIMITS.replies) };

  await db.ensureBlueskyTable().catch(e => console.error(`[${tag}] ensureTable: ${e.message}`));

  const todayLikes = await db.countTodayActions('bsky_like', accountId);
  const todayReplies = await db.countTodayActions('bsky_reply', accountId);
  if (todayLikes >= limits.likes && todayReplies >= limits.replies) {
    console.log(`[${tag}] Daily limits reached`);
    return;
  }

  const agent = await login(accountId);
  if (!agent) return;
  console.log(`[${tag}] Session limits: ${limits.likes} likes, ${limits.replies} replies`);

  let likesGiven = 0;
  let repliesGiven = 0;

  const myTerms = PERSONA_SEARCH_TERMS[accountId] || DEFAULT_SEARCH_TERMS;
  const tried = new Set();
  for (let attempt = 0; attempt < 3; attempt++) {
    let term;
    do { term = myTerms[Math.floor(Math.random() * myTerms.length)]; }
    while (tried.has(term) && tried.size < myTerms.length);
    tried.add(term);

    console.log(`[${tag}] Searching: "${term}" (attempt ${attempt + 1})`);
    const posts = await searchRecent(agent, term);
    console.log(`[${tag}] Found ${posts.length} posts`);

    for (const post of posts) {
      const text = post?.record?.text || '';
      const uri = post?.uri;
      const cid = post?.cid;
      if (!uri || !cid || !text) continue;
      if (isOwnPost(post)) continue;
      if (text.length < 25) continue;            // demasiado corto para aportar algo
      if (!RELEVANT.test(text)) continue;        // no va de YouTube/creadores
      if (text.toLowerCase().includes('ytubviral')) continue; // ya nos menciona, no auto-spam

      const already = await db.hasBlueskyAction(uri, accountId);
      if (already) continue;
      if (shouldSkipPost()) continue;

      await readingPause();

      // Decide independently whether to like and/or reply — humans don't always do both.
      // ~70% chance to like a matched post, ~40% chance to reply (and only if not already liking
      // this same post — avoids the robotic like+reply-on-every-post pattern).
      const willLike  = Math.random() < 0.70 && todayLikes + likesGiven < limits.likes;
      const willReply = Math.random() < 0.40 && todayReplies + repliesGiven < limits.replies && !willLike;

      if (willLike) {
        try {
          await agent.like(uri, cid);
          likesGiven++;
          await db.saveAction({ type: 'bsky_like', profileUrl: uri, accountId });
          console.log(`[${tag}] Liked @${post.author.handle}`);
          await actionPause();
        } catch (err) {
          console.error(`[${tag}] like error: ${err.message}`);
        }
      }

      if (willReply) {
        try {
          const reply = await commentGen(post.author?.displayName || post.author?.handle || '', text);
          if (reply && reply.trim()) {
            const body = reply.trim().slice(0, 300);
            await agent.post({
              text: body,
              reply: {
                root: { uri, cid },
                parent: { uri, cid },
              },
            });
            repliesGiven++;
            await db.saveAction({ type: 'bsky_reply', profileUrl: uri, content: body, accountId });
            console.log(`[${tag}] Replied to @${post.author.handle}: "${body.slice(0, 50)}..."`);
            await commentPause();
          }
        } catch (err) {
          console.error(`[${tag}] reply error: ${err.message}`);
        }
      }

      await actionPause();
      if (todayLikes + likesGiven >= limits.likes && todayReplies + repliesGiven >= limits.replies) break;
    }

    if (likesGiven > 0 || repliesGiven > 0) break;
  }

  console.log(`[${tag}] Session done — ${likesGiven} likes, ${repliesGiven} replies`);
}

module.exports = { engageWithPosts, login, searchRecent };
