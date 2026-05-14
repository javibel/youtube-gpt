require('dotenv').config();

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GSC_REFRESH_TOKEN;
const SITE_URL = 'sc-domain:ytubviral.com';

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(JSON.stringify(data));
  return data.access_token;
}

async function inspectUrl(token, url) {
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL }),
  });
  const data = await res.json();
  return data;
}

async function main() {
  const token = await getAccessToken();
  const urls = [
    'https://ytubviral.com/',
    'https://ytubviral.com/blog',
    'https://ytubviral.com/blog/herramientas-ia-para-youtubers-2026',
    'https://ytubviral.com/blog/como-escribir-titulos-virales-youtube',
    'https://ytubviral.com/blog/descripciones-seo-youtube-guia',
    'https://ytubviral.com/blog/7-frameworks-titulos-virales-youtube',
    'https://ytubviral.com/blog/cuanto-gana-un-youtuber-en-espana',
    'https://ytubviral.com/blog/setup-youtube-menos-500-euros',
    'https://ytubviral.com/blog/keyword-research-youtube-guia',
    'https://ytubviral.com/blog/ab-testing-youtube-titulos-guia',
    'https://ytubviral.com/blog/algoritmo-youtube-2026-como-funciona',
    'https://ytubviral.com/blog/como-conseguir-suscriptores-youtube-2026',
    'https://ytubviral.com/blog/como-analizar-competencia-youtube',
    'https://ytubviral.com/blog/thumbnails-youtube-guia-ctr',
    'https://ytubviral.com/blog/como-crear-scripts-youtube-con-ia',
    'https://ytubviral.com/blog/como-monetizar-youtube-2026-guia',
    'https://ytubviral.com/features/keyword-research',
    'https://ytubviral.com/features/seo-score',
    'https://ytubviral.com/features/competitor-analysis',
    'https://ytubviral.com/features/revenue-estimator',
    'https://ytubviral.com/features/ab-testing',
    'https://ytubviral.com/features/learning-hub',
    'https://ytubviral.com/features/learning-hub/seo-basics',
    'https://ytubviral.com/features/learning-hub/keyword-research',
    'https://ytubviral.com/features/learning-hub/retention',
    'https://ytubviral.com/features/learning-hub/thumbnails',
    'https://ytubviral.com/features/learning-hub/analytics-deep',
    'https://ytubviral.com/features/learning-hub/growth-strategy',
    'https://ytubviral.com/features/learning-hub/competitor-analysis',
    'https://ytubviral.com/features/learning-hub/ab-testing',
    'https://ytubviral.com/features/learning-hub/best-time',
    'https://ytubviral.com/features/learning-hub/trend-explorer',
    'https://ytubviral.com/features/learning-hub/ai-generator',
    'https://ytubviral.com/features/learning-hub/content-calendar',
    'https://ytubviral.com/features/learning-hub/video-predictor',
    'https://ytubviral.com/features/learning-hub/ai-coach',
    'https://ytubviral.com/features/trend-explorer',
    'https://ytubviral.com/features/ai-generator',
    'https://ytubviral.com/features/best-time',
    'https://ytubviral.com/features/retention-analyzer',
    'https://ytubviral.com/features/video-predictor',
    'https://ytubviral.com/features/content-calendar',
    'https://ytubviral.com/features/channel-analytics',
    'https://ytubviral.com/features/ai-coach',
    'https://ytubviral.com/extension',
    'https://ytubviral.com/gear',
    'https://ytubviral.com/signup',
    'https://ytubviral.com/privacy',
    'https://ytubviral.com/terms',
    'https://ytubviral.com/legal',
    'https://ytubviral.com/launch',
  ];

  console.log('URL'.padEnd(55) + 'STATUS'.padEnd(40) + 'LAST CRAWL');
  console.log('-'.repeat(110));

  for (const url of urls) {
    const result = await inspectUrl(token, url);
    const idx = result.inspectionResult?.indexStatusResult;
    const short = url.replace('https://ytubviral.com', '') || '/';
    const verdict = idx?.coverageState || 'unknown';
    const lastCrawl = idx?.lastCrawlTime ? idx.lastCrawlTime.slice(0, 10) : 'never';
    console.log(`${short.padEnd(55)}${verdict.padEnd(40)}${lastCrawl}`);
    // Rate limit: max 600 requests/min, but be safe
    await new Promise(r => setTimeout(r, 1200));
  }
}

main().catch(console.error);
