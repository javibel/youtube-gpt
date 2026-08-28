'use strict';
/**
 * ESTUDIO DE MINIATURAS — FASE 1: recogida de muestra.
 *
 * Diseño caso-control:
 *   - Grupo TOP:     order=viewCount        -> los que ganaron
 *   - Grupo NORMAL:  ventana 6-12 meses atrás, order=date -> vídeos corrientes
 *     que ya han tenido tiempo de rendir (evita el sesgo de "recién subido").
 *
 * Filtros:
 *   - SOLO vídeos largos (>180s). Los Shorts no tienen miniatura diseñada:
 *     mezclarlos fue el error del estudio de títulos.
 *
 * Guarda: thumb-study-raw.json
 */
require('dotenv').config({ path: 'C:/Users/jimen/youtube-gpt/local-agent/.env' });
const fs = require('fs');
const KEY = process.env.YT_API_KEY || process.env.YOUTUBE_API_KEY;
if (!KEY) { console.error('Falta YT_API_KEY'); process.exit(1); }

const TOPICS = [
  { id: 'gaming', en: 'gaming gameplay', es: 'videojuegos gameplay' },
  { id: 'cocina', en: 'cooking recipe', es: 'recetas cocina' },
  { id: 'fitness', en: 'fitness workout', es: 'rutina fitness' },
  { id: 'tecnologia', en: 'tech review', es: 'análisis tecnología' },
  { id: 'belleza', en: 'makeup tutorial', es: 'tutorial maquillaje' },
  { id: 'viajes', en: 'travel vlog', es: 'vlog viaje' },
  { id: 'finanzas', en: 'personal finance', es: 'finanzas personales' },
  { id: 'estudio', en: 'study with me', es: 'productividad estudiar' },
];

const MIN_SECS = 180; // > 3 min => no es Short

function durSec(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function searchIds(q, lang, extra) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&q=${encodeURIComponent(q)}&relevanceLanguage=${lang}&key=${KEY}&${extra}`;
  const d = await (await fetch(url)).json();
  if (d.error) { console.error(`  ! search "${q}": ${d.error.message}`); return []; }
  return (d.items || []).map(i => i.id?.videoId).filter(Boolean);
}

async function hydrate(ids) {
  if (!ids.length) return [];
  const d = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${KEY}`)).json();
  if (d.error) { console.error(`  ! videos: ${d.error.message}`); return []; }
  return (d.items || []).map(v => {
    const th = v.snippet.thumbnails || {};
    const best = th.maxres || th.standard || th.high || th.medium;
    return {
      id: v.id,
      title: v.snippet.title,
      channelId: v.snippet.channelId,
      channel: v.snippet.channelTitle,
      publishedAt: v.snippet.publishedAt,
      views: Number(v.statistics?.viewCount || 0),
      likes: Number(v.statistics?.likeCount || 0),
      comments: Number(v.statistics?.commentCount || 0),
      secs: durSec(v.contentDetails?.duration),
      thumb: best?.url || null,
      thumbW: best?.width || 0,
    };
  });
}

async function channelSubs(channelIds) {
  const out = {};
  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50);
    const d = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${batch.join(',')}&key=${KEY}`)).json();
    if (d.error) { console.error(`  ! channels: ${d.error.message}`); continue; }
    for (const c of d.items || []) {
      out[c.id] = Number(c.statistics?.subscriberCount || 0);
    }
    await sleep(120);
  }
  return out;
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function main() {
  const rows = [];
  const windowExtra = `order=date&publishedAfter=${isoDaysAgo(365)}&publishedBefore=${isoDaysAgo(180)}`;

  for (const t of TOPICS) {
    for (const lang of ['es', 'en']) {
      const q = t[lang];
      for (const grupo of ['TOP', 'NORMAL']) {
        const extra = grupo === 'TOP' ? 'order=viewCount' : windowExtra;
        const ids = await searchIds(q, lang, extra);
        const items = await hydrate(ids);
        const longs = items.filter(v => v.secs > MIN_SECS && v.thumb);
        for (const v of longs) rows.push({ ...v, topic: t.id, lang, grupo });
        console.log(`${t.id.padEnd(12)} ${lang} ${grupo.padEnd(7)} -> ${String(items.length).padStart(2)} vídeos, ${String(longs.length).padStart(2)} largos`);
        await sleep(200);
      }
    }
  }

  console.log(`\nRecogidos ${rows.length} vídeos largos. Pidiendo suscriptores de los canales...`);
  const chIds = [...new Set(rows.map(r => r.channelId))];
  const subs = await channelSubs(chIds);
  for (const r of rows) r.subs = subs[r.channelId] || 0;

  fs.writeFileSync('thumb-study-raw.json', JSON.stringify(rows, null, 2));
  const byGroup = g => rows.filter(r => r.grupo === g).length;
  console.log(`\nGuardado thumb-study-raw.json`);
  console.log(`  TOP:    ${byGroup('TOP')}`);
  console.log(`  NORMAL: ${byGroup('NORMAL')}`);
  console.log(`  Canales únicos: ${chIds.length}`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
