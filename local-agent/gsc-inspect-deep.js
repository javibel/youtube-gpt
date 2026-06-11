// Diagnóstico profundo de indexación — A1 (2026-06-11)
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
  return res.json();
}

async function main() {
  const token = await getAccessToken();
  const urls = [
    'https://ytubviral.com/',
    'https://ytubviral.com/blog',
    'https://ytubviral.com/blog/algoritmo-youtube-2026-como-funciona',
    'https://ytubviral.com/blog/como-escribir-titulos-virales-youtube',
    'https://ytubviral.com/features/seo-score',
    'https://ytubviral.com/features/keyword-research',
    'https://ytubviral.com/features/learning-hub/seo-basics',
    'https://ytubviral.com/gear',
    'https://ytubviral.com/gear/cameras',
    'https://ytubviral.com/pricing',
    'https://ytubviral.com/signup',
    'https://ytubviral.com/trends',
  ];

  for (const url of urls) {
    const result = await inspectUrl(token, url);
    const idx = result.inspectionResult?.indexStatusResult || {};
    const short = url.replace('https://ytubviral.com', '') || '/';
    console.log(JSON.stringify({
      url: short,
      verdict: idx.verdict,
      coverageState: idx.coverageState,
      robotsTxtState: idx.robotsTxtState,
      indexingState: idx.indexingState,
      pageFetchState: idx.pageFetchState,
      lastCrawlTime: idx.lastCrawlTime,
      crawledAs: idx.crawledAs,
      googleCanonical: idx.googleCanonical,
      userCanonical: idx.userCanonical,
      sitemap: idx.sitemap,
      referringUrls: (idx.referringUrls || []).slice(0, 3),
    }));
    await new Promise(r => setTimeout(r, 1200));
  }
}

main().catch(console.error);
