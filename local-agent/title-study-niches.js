'use strict';

/**
 * TITLE STUDY — muestra por NICHO de creador (complementa el dataset trending).
 *
 * Busca los vídeos más vistos (order=viewCount) en nichos relevantes para
 * creadores, en EN y ES, y calcula las mismas métricas de título que el
 * colector trending. Permite comparar "trending global" vs "top por nicho".
 *
 * Coste: search.list = 100 unidades/llamada. ~16 queries = 1.600 unidades de
 * las 10.000 diarias. Sin inventar nada — títulos reales de la API.
 *
 * Uso:  node title-study-niches.js [YYYY-MM-DD]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { analyzeTitle, median, pct } = require('./title-study-collect');

const KEY = process.env.YT_API_KEY || process.env.YOUTUBE_API_KEY;
if (!KEY) { console.error('Falta YT_API_KEY'); process.exit(1); }

// Nichos de creador (EN + ES) — términos que devuelven contenido de canales reales.
const QUERIES = [
  'gaming gameplay', 'videojuegos gameplay',
  'cooking recipe', 'recetas cocina',
  'fitness workout', 'rutina fitness',
  'tech review', 'análisis tecnología',
  'makeup tutorial', 'tutorial maquillaje',
  'travel vlog', 'vlog viaje',
  'personal finance', 'finanzas personales',
  'study with me', 'productividad estudiar',
];

async function searchNiche(q) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=50&q=${encodeURIComponent(q)}&relevanceLanguage=${/[áéíóúñ]|recet|análisis|maquill|viaje|finanzas|estudiar|videojuegos|rutina/i.test(q) ? 'es' : 'en'}&key=${KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) { console.error(`[${q}] API error: ${d.error.message}`); return []; }
  return (d.items || []).map(v => ({
    videoId: v.id?.videoId,
    title: v.snippet?.title || '',
    niche: q,
    channel: v.snippet?.channelTitle || '',
    publishedAt: v.snippet?.publishedAt || null,
  })).filter(v => v.videoId);
}

function pctOf(arr, fn) { return pct(arr.filter(fn).length, arr.length); }

async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  console.log(`[title-study-niches] Buscando top-by-views en ${QUERIES.length} nichos...`);

  const seen = new Set();
  const videos = [];
  for (const q of QUERIES) {
    const items = await searchNiche(q);
    for (const v of items) {
      if (seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      videos.push({ ...v, ...analyzeTitle(v.title) });
    }
    console.log(`  "${q}": ${items.length} (únicos acumulados: ${videos.length})`);
    await new Promise(r => setTimeout(r, 150));
  }

  const N = videos.length;
  if (!N) { console.error('Sin datos — abortando'); process.exit(1); }

  const charLens = videos.map(v => v.lenChars);
  const wordLens = videos.map(v => v.lenWords);

  const stats = {
    date,
    sampleSize: N,
    niches: QUERIES.length,
    source: 'YouTube Data API v3 — search.list order=viewCount por nicho (datos públicos reales)',
    titleLength: {
      avgChars: Math.round(charLens.reduce((a, b) => a + b, 0) / N),
      medianChars: median(charLens),
      avgWords: Math.round((wordLens.reduce((a, b) => a + b, 0) / N) * 10) / 10,
      medianWords: median(wordLens),
    },
    features: {
      withNumber: pctOf(videos, v => v.hasNumber),
      withBrackets: pctOf(videos, v => v.hasBrackets),
      withQuestion: pctOf(videos, v => v.hasQuestion),
      withColon: pctOf(videos, v => v.hasColon),
      withAllCapsWord: pctOf(videos, v => v.hasAllCapsWord),
      howTo: pctOf(videos, v => v.isHowTo),
      listicle: pctOf(videos, v => v.isListicle),
      withHookWord: pctOf(videos, v => v.hasHook),
    },
  };

  const outDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `title-study-niches-${date}.json`);
  fs.writeFileSync(out, JSON.stringify({ stats, rawSampleFirst20: videos.slice(0, 20) }, null, 2));

  console.log(`\n[title-study-niches] N=${N}. Resumen:`);
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nGuardado en ${out}`);
}

main().catch(e => { console.error(e); process.exit(1); });
