'use strict';
/**
 * FASE 1b — ampliar la muestra.
 * Pide la 2ª página (pageToken) de cada búsqueda y añade al raw existente,
 * deduplicando por videoId. Prioriza ampliar NORMAL, que es de donde salen
 * los canales pequeños del análisis B.
 */
require('dotenv').config({ path: 'C:/Users/jimen/youtube-gpt/local-agent/.env' });
const fs = require('fs');
const KEY = process.env.YT_API_KEY || process.env.YOUTUBE_API_KEY;

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
const MIN_SECS = 180;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function durSec(iso){const m=/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso||'');if(!m)return 0;return (+m[1]||0)*86400+(+m[2]||0)*3600+(+m[3]||0)*60+(+m[4]||0);}
function isoDaysAgo(d){return new Date(Date.now()-d*86400000).toISOString();}

async function search(q, lang, extra, pageToken) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&q=${encodeURIComponent(q)}&relevanceLanguage=${lang}&key=${KEY}&${extra}${pageToken ? '&pageToken=' + pageToken : ''}`;
  const d = await (await fetch(url)).json();
  if (d.error) { console.error(`  ! ${q}: ${d.error.message}`); return { ids: [], next: null }; }
  return { ids: (d.items || []).map(i => i.id?.videoId).filter(Boolean), next: d.nextPageToken || null };
}
async function hydrate(ids) {
  if (!ids.length) return [];
  const d = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${KEY}`)).json();
  if (d.error) { console.error(`  ! videos: ${d.error.message}`); return []; }
  return (d.items || []).map(v => {
    const th = v.snippet.thumbnails || {};
    const best = th.maxres || th.standard || th.high || th.medium;
    return { id: v.id, title: v.snippet.title, channelId: v.snippet.channelId, channel: v.snippet.channelTitle,
      publishedAt: v.snippet.publishedAt, views: Number(v.statistics?.viewCount||0),
      likes: Number(v.statistics?.likeCount||0), comments: Number(v.statistics?.commentCount||0),
      secs: durSec(v.contentDetails?.duration), thumb: best?.url||null, thumbW: best?.width||0 };
  });
}
async function channelSubs(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const d = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids.slice(i,i+50).join(',')}&key=${KEY}`)).json();
    if (!d.error) for (const c of d.items || []) out[c.id] = Number(c.statistics?.subscriberCount || 0);
    await sleep(120);
  }
  return out;
}

async function main() {
  const existing = JSON.parse(fs.readFileSync('./thumb-study-raw.json', 'utf8'));
  const seen = new Set(existing.map(r => r.id));
  console.log(`Partiendo de ${existing.length} vídeos.\n`);
  const nuevos = [];
  const windowExtra = `order=date&publishedAfter=${isoDaysAgo(365)}&publishedBefore=${isoDaysAgo(180)}`;

  for (const t of TOPICS) {
    for (const lang of ['es', 'en']) {
      for (const grupo of ['NORMAL', 'TOP']) {
        const extra = grupo === 'TOP' ? 'order=viewCount' : windowExtra;
        // página 1 solo para obtener el token; página 2 es la nueva
        const p1 = await search(t[lang], lang, extra);
        if (!p1.next) { console.log(`${t.id} ${lang} ${grupo}: sin 2ª página`); continue; }
        const p2 = await search(t[lang], lang, extra, p1.next);
        const items = await hydrate(p2.ids);
        const longs = items.filter(v => v.secs > MIN_SECS && v.thumb && !seen.has(v.id));
        for (const v of longs) { seen.add(v.id); nuevos.push({ ...v, topic: t.id, lang, grupo }); }
        console.log(`${t.id.padEnd(12)} ${lang} ${grupo.padEnd(7)} +${longs.length} nuevos`);
        await sleep(200);
      }
    }
  }

  console.log(`\n${nuevos.length} vídeos nuevos. Pidiendo suscriptores...`);
  const subs = await channelSubs([...new Set(nuevos.map(r => r.channelId))]);
  for (const r of nuevos) r.subs = subs[r.channelId] || 0;

  const all = existing.concat(nuevos);
  fs.writeFileSync('thumb-study-raw.json', JSON.stringify(all, null, 2));
  console.log(`\nTotal ahora: ${all.length} (TOP ${all.filter(r=>r.grupo==='TOP').length}, NORMAL ${all.filter(r=>r.grupo==='NORMAL').length})`);
  const small = all.filter(r => r.subs > 1000 && r.subs < 500000);
  console.log(`En banda 1k-500k subs (análisis B): ${small.length} -> ~${Math.floor(small.length/4)} por grupo`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
