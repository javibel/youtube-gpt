'use strict';

/**
 * TITLE STUDY — muestra por NICHO de creador (complementa el dataset trending).
 *
 * Busca los vídeos más vistos (order=viewCount) en 8 nichos relevantes para
 * creadores, en EN y ES, y calcula las mismas métricas de título que el
 * colector trending. Permite comparar "trending global" vs "top por nicho",
 * y por nicho individual (v2, 2026-07-09: antes esto solo agregaba las 16
 * queries en un único bloque global; ahora también desglosa por tema,
 * fusionando EN+ES del mismo tema — eran el mismo nicho en dos idiomas, no
 * 16 nichos distintos).
 *
 * Coste: search.list = 100 unidades/llamada. 8 temas × 2 idiomas = 16 queries
 * = 1.600 unidades de las 10.000 diarias. Sin inventar nada — títulos reales
 * de la API.
 *
 * Uso:  node title-study-niches.js [YYYY-MM-DD]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { analyzeTitle, median, pct } = require('./title-study-collect');

const KEY = process.env.YT_API_KEY || process.env.YOUTUBE_API_KEY;
if (!KEY) { console.error('Falta YT_API_KEY'); process.exit(1); }

// 8 temas de creador, cada uno con query EN + ES.
const TOPICS = [
  { id: 'gaming', label: { es: 'Gaming', en: 'Gaming' }, en: 'gaming gameplay', es: 'videojuegos gameplay' },
  { id: 'cocina', label: { es: 'Cocina', en: 'Cooking' }, en: 'cooking recipe', es: 'recetas cocina' },
  { id: 'fitness', label: { es: 'Fitness', en: 'Fitness' }, en: 'fitness workout', es: 'rutina fitness' },
  { id: 'tecnologia', label: { es: 'Tecnología', en: 'Tech' }, en: 'tech review', es: 'análisis tecnología' },
  { id: 'belleza', label: { es: 'Belleza', en: 'Beauty' }, en: 'makeup tutorial', es: 'tutorial maquillaje' },
  { id: 'viajes', label: { es: 'Viajes', en: 'Travel' }, en: 'travel vlog', es: 'vlog viaje' },
  { id: 'finanzas', label: { es: 'Finanzas personales', en: 'Personal finance' }, en: 'personal finance', es: 'finanzas personales' },
  { id: 'estudio', label: { es: 'Educación y estudio', en: 'Studying' }, en: 'study with me', es: 'productividad estudiar' },
];

async function searchQuery(q, lang) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=50&q=${encodeURIComponent(q)}&relevanceLanguage=${lang}&key=${KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) { console.error(`[${q}] API error: ${d.error.message}`); return []; }
  return (d.items || []).map(v => ({
    videoId: v.id?.videoId,
    title: v.snippet?.title || '',
    query: q,
    channel: v.snippet?.channelTitle || '',
    publishedAt: v.snippet?.publishedAt || null,
  })).filter(v => v.videoId);
}

function pctOf(arr, fn) { return pct(arr.filter(fn).length, arr.length); }

function computeStats(videos) {
  const N = videos.length;
  if (!N) return null;
  const charLens = videos.map(v => v.lenChars);
  const wordLens = videos.map(v => v.lenWords);
  return {
    sampleSize: N,
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
}

async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  console.log(`[title-study-niches] Buscando top-by-views en ${TOPICS.length} temas (EN+ES)...`);

  const allVideos = [];
  const topics = [];

  for (const topic of TOPICS) {
    const seenTopic = new Set();
    const topicVideos = [];
    for (const [lang, q] of [['en', topic.en], ['es', topic.es]]) {
      const items = await searchQuery(q, lang);
      for (const v of items) {
        if (seenTopic.has(v.videoId)) continue;
        seenTopic.add(v.videoId);
        const enriched = { ...v, ...analyzeTitle(v.title), topic: topic.id };
        topicVideos.push(enriched);
        allVideos.push(enriched);
      }
      console.log(`  [${topic.id}/${lang}] "${q}": ${items.length}`);
      await new Promise(r => setTimeout(r, 150));
    }
    const stats = computeStats(topicVideos);
    topics.push({ id: topic.id, label: topic.label, ...stats });
    console.log(`  → ${topic.id}: N=${topicVideos.length}${stats && stats.sampleSize < 30 ? ' (MUESTRA PEQUEÑA)' : ''}`);
  }

  const N = allVideos.length;
  if (!N) { console.error('Sin datos — abortando'); process.exit(1); }

  const global = computeStats(allVideos);

  const output = {
    date,
    source: 'YouTube Data API v3 — search.list order=viewCount por tema, EN+ES fusionados (datos públicos reales)',
    topicsCount: TOPICS.length,
    sampleSizeGlobal: N,
    global,
    topics,
  };

  const outDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `title-study-niches-${date}.json`);
  fs.writeFileSync(out, JSON.stringify({ ...output, rawSampleFirst20: allVideos.slice(0, 20) }, null, 2));

  console.log(`\n[title-study-niches] N=${N} vídeos únicos en ${TOPICS.length} temas. Resumen global:`);
  console.log(JSON.stringify(global, null, 2));
  console.log(`\nGuardado en ${out}`);
}

main().catch(e => { console.error(e); process.exit(1); });
