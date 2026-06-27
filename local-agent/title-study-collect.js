'use strict';

/**
 * TITLE STUDY COLLECTOR — activo SEO enlazable (data study).
 *
 * Recoge vídeos REALES del chart `mostPopular` de YouTube en muchas regiones,
 * deduplica por videoId y calcula métricas verificables sobre los TÍTULOS:
 * longitud, % con número, % con corchetes, % con pregunta, mayúsculas, patrones
 * "how to"/listicle, palabras gancho. Sin inventar nada — solo agrega datos
 * públicos de la API. Salida: reports/title-study-{fecha}.json
 *
 * Coste de cuota: 1 unidad por región (endpoint videos.list chart=mostPopular).
 * ~30 regiones = ~30 unidades de las 10.000 diarias → trivial.
 *
 * Uso:  node title-study-collect.js [YYYY-MM-DD]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const KEY = process.env.YT_API_KEY || process.env.YOUTUBE_API_KEY;
if (!KEY) { console.error('Falta YT_API_KEY'); process.exit(1); }

// Regiones con ecosistema YouTube grande → muestra global y diversa.
const REGIONS = [
  'US', 'GB', 'CA', 'AU', 'IE',            // anglófonas
  'ES', 'MX', 'AR', 'CO', 'CL',            // hispanohablantes
  'BR', 'PT', 'FR', 'DE', 'IT',            // otras europeas/LatAm
  'IN', 'JP', 'KR', 'ID', 'PH',            // Asia
  'NL', 'SE', 'PL', 'TR', 'RU',
  'ZA', 'NG', 'EG', 'SA', 'NZ',
];

// ── Métricas de título (metodología transparente) ──
const HOOK_WORDS = [
  // EN
  'how', 'why', 'best', 'top', 'new', 'free', 'easy', 'secret', 'ultimate',
  'guide', 'tips', 'tutorial', 'review', 'vs', 'fast', 'amazing', 'shocking',
  'mistake', 'mistakes', 'never', 'always', 'proven', 'simple', 'hack', 'hacks',
  // ES
  'como', 'cómo', 'por qué', 'porque', 'mejor', 'mejores', 'gratis', 'fácil',
  'secreto', 'guía', 'trucos', 'tutorial', 'reseña', 'nuevo', 'rápido', 'error',
  'errores', 'nunca', 'siempre', 'increíble',
];

function analyzeTitle(raw) {
  const title = (raw || '').trim();
  const lenChars = title.length;
  const words = title.split(/\s+/).filter(Boolean);
  const lenWords = words.length;
  const hasNumber = /\d/.test(title);
  const hasBrackets = /[\[\]()|｜]/.test(title);
  const hasQuestion = /\?|¿/.test(title);
  const hasColon = /:/.test(title);
  // Palabras totalmente en mayúscula de ≥3 letras (grito/énfasis)
  const allCapsWords = words.filter(w => {
    const letters = w.replace(/[^A-Za-zÁÉÍÓÚÑ]/g, '');
    return letters.length >= 3 && letters === letters.toUpperCase();
  }).length;
  const hasAllCapsWord = allCapsWords > 0;
  const lower = title.toLowerCase();
  const isHowTo = /\bhow to\b|\bcómo\b|\bcomo\b/.test(lower);
  // Listicle: número seguido de sustantivo plural típico ("5 ways", "7 trucos")
  const isListicle = /\b\d{1,3}\s+\w+/.test(lower) && /\b\d{1,3}\b/.test(lower);
  const hookCount = HOOK_WORDS.reduce((n, w) => {
    const re = new RegExp(`(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`, 'i');
    return n + (re.test(lower) ? 1 : 0);
  }, 0);
  const hasHook = hookCount > 0;
  return { lenChars, lenWords, hasNumber, hasBrackets, hasQuestion, hasColon, hasAllCapsWord, isHowTo, isListicle, hasHook };
}

async function fetchRegion(region) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${region}&maxResults=50&key=${KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) { console.error(`[${region}] API error: ${d.error.message}`); return []; }
  return (d.items || []).map(v => ({
    videoId: v.id,
    title: v.snippet?.title || '',
    region,
    categoryId: v.snippet?.categoryId || null,
    views: Number(v.statistics?.viewCount || 0),
    publishedAt: v.snippet?.publishedAt || null,
  }));
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
function pct(n, total) { return total ? Math.round((n / total) * 1000) / 10 : 0; }

async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  console.log(`[title-study] Recogiendo mostPopular en ${REGIONS.length} regiones...`);

  const seen = new Set();
  const videos = [];
  for (const region of REGIONS) {
    const items = await fetchRegion(region);
    for (const v of items) {
      if (seen.has(v.videoId)) continue; // mismo vídeo trending en varias regiones → 1 vez
      seen.add(v.videoId);
      videos.push({ ...v, ...analyzeTitle(v.title) });
    }
    console.log(`  ${region}: ${items.length} (únicos acumulados: ${videos.length})`);
    await new Promise(r => setTimeout(r, 120));
  }

  const N = videos.length;
  if (!N) { console.error('Sin datos — abortando'); process.exit(1); }

  const charLens = videos.map(v => v.lenChars);
  const wordLens = videos.map(v => v.lenWords);

  // Distribución por buckets de longitud (chars)
  const buckets = { '≤30': 0, '31–50': 0, '51–70': 0, '71–100': 0, '>100': 0 };
  for (const l of charLens) {
    if (l <= 30) buckets['≤30']++;
    else if (l <= 50) buckets['31–50']++;
    else if (l <= 70) buckets['51–70']++;
    else if (l <= 100) buckets['71–100']++;
    else buckets['>100']++;
  }

  // Vistas medianas por presencia/ausencia de número (señal accionable)
  const withNum = videos.filter(v => v.hasNumber).map(v => v.views);
  const noNum = videos.filter(v => !v.hasNumber).map(v => v.views);

  const stats = {
    date,
    sampleSize: N,
    regions: REGIONS.length,
    source: 'YouTube Data API v3 — chart=mostPopular (datos públicos reales)',
    titleLength: {
      avgChars: Math.round(charLens.reduce((a, b) => a + b, 0) / N),
      medianChars: median(charLens),
      avgWords: Math.round((wordLens.reduce((a, b) => a + b, 0) / N) * 10) / 10,
      medianWords: median(wordLens),
      minChars: Math.min(...charLens),
      maxChars: Math.max(...charLens),
      distribution: buckets,
    },
    features: {
      withNumber: pct(videos.filter(v => v.hasNumber).length, N),
      withBrackets: pct(videos.filter(v => v.hasBrackets).length, N),
      withQuestion: pct(videos.filter(v => v.hasQuestion).length, N),
      withColon: pct(videos.filter(v => v.hasColon).length, N),
      withAllCapsWord: pct(videos.filter(v => v.hasAllCapsWord).length, N),
      howTo: pct(videos.filter(v => v.isHowTo).length, N),
      listicle: pct(videos.filter(v => v.isListicle).length, N),
      withHookWord: pct(videos.filter(v => v.hasHook).length, N),
    },
    viewsByNumber: {
      medianViewsWithNumber: median(withNum),
      medianViewsWithoutNumber: median(noNum),
    },
    methodology: {
      hookWordsCount: HOOK_WORDS.length,
      note: 'Métricas calculadas sobre los títulos exactos devueltos por la API. Dedup por videoId entre regiones. Sin edición manual ni exclusiones.',
    },
  };

  const outDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `title-study-${date}.json`);
  fs.writeFileSync(out, JSON.stringify({ stats, rawSampleFirst20: videos.slice(0, 20) }, null, 2));

  console.log(`\n[title-study] N=${N} vídeos únicos. Resumen:`);
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nGuardado en ${out}`);
}

module.exports = { analyzeTitle, median, pct, HOOK_WORDS };

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
