require('dotenv').config();

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GSC_REFRESH_TOKEN;

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

async function requestIndexing(token, url) {
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  const token = await getAccessToken();
  // Only public pages that return 200 OK (no auth redirects)
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
    'https://ytubviral.com/blog/youtube-neurodivergencia-guia',
    'https://ytubviral.com/blog/auditoria-canal-youtube-guia',
    'https://ytubviral.com/blog/tour-completo-ytubviral-14-herramientas',
    'https://ytubviral.com/blog/ideas-videos-youtube-no-se-que-subir',
    'https://ytubviral.com/blog/best-youtube-title-generator-2026',
    'https://ytubviral.com/blog/vidiq-alternative-free-2026',
    'https://ytubviral.com/blog/tubebuddy-vs-vidiq-2026',
    'https://ytubviral.com/blog/youtube-description-generator-ai',
    'https://ytubviral.com/blog/youtube-tag-generator-free-2026',
    'https://ytubviral.com/blog/youtube-keyword-research-free-tool',
    'https://ytubviral.com/blog/youtube-analytics-tools-free-2026',
    'https://ytubviral.com/blog/how-to-get-more-views-youtube-2026',
    'https://ytubviral.com/blog/youtube-thumbnail-tips-beginners-guide',
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
    'https://ytubviral.com/title-analyzer',
    'https://ytubviral.com/ctr-calculator',
    'https://ytubviral.com/youtube-money-calculator',
    'https://ytubviral.com/engagement-rate-calculator',
    'https://ytubviral.com/youtube-title-ideas',
    'https://ytubviral.com/gear',
    'https://ytubviral.com/gear/cameras',
    'https://ytubviral.com/gear/microphones',
    'https://ytubviral.com/gear/lighting',
    'https://ytubviral.com/gear/accessories',
    'https://ytubviral.com/gear/audio',
    'https://ytubviral.com/gear/hardware',
    'https://ytubviral.com/gear/software',
    'https://ytubviral.com/gear/accessibility',
    'https://ytubviral.com/gear/noise-cancelling',
    'https://ytubviral.com/gear/fidget-tools',
    'https://ytubviral.com/gear/deep-pressure',
    'https://ytubviral.com/gear/wearables-rings',
    'https://ytubviral.com/gear/movement',
    'https://ytubviral.com/gear/timers',
    'https://ytubviral.com/pricing',
    'https://ytubviral.com/signup',
    'https://ytubviral.com/privacy',
    'https://ytubviral.com/terms',
    'https://ytubviral.com/legal',
    'https://ytubviral.com/launch',
  ];

  for (const url of urls) {
    const { status, data } = await requestIndexing(token, url);
    const short = url.replace('https://ytubviral.com', '');
    if (status === 200) {
      console.log(`  ✓ ${(short || '/').padEnd(50)} notified: ${data.urlNotificationMetadata?.latestUpdate?.type ?? 'OK'}`);
    } else {
      console.log(`  ✗ ${(short || '/').padEnd(50)} ${status}: ${data.error?.message ?? JSON.stringify(data)}`);
    }
  }
}

main().catch(console.error);
