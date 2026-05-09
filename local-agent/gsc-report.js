/**
 * Google Search Console — Status report
 * Usage: node gsc-report.js
 */

require('dotenv').config();

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GSC_REFRESH_TOKEN;
const SITE_URL = 'sc-domain:ytubviral.com'; // or 'https://ytubviral.com/'

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function gscFetch(token, endpoint, body = null) {
  const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}`;
  const opts = {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) {
    opts.method = 'POST';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${base}${endpoint}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC API ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  const token = await getAccessToken();

  // 1. List sitemaps
  console.log('=== SITEMAPS ===');
  try {
    const sitemaps = await gscFetch(token, '/sitemaps');
    if (sitemaps.sitemap) {
      for (const s of sitemaps.sitemap) {
        console.log(`  ${s.path} — ${s.lastSubmitted} — errors: ${s.errors}, warnings: ${s.warnings}`);
        if (s.contents) {
          for (const c of s.contents) {
            console.log(`    ${c.type}: submitted=${c.submitted}, indexed=${c.indexed}`);
          }
        }
      }
    } else {
      console.log('  No sitemaps found');
    }
  } catch (e) {
    console.error('  Sitemaps error:', e.message);
  }

  // 2. Search analytics — last 28 days, by page
  console.log('\n=== SEARCH PERFORMANCE (last 28 days, by page) ===');
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0];

  try {
    const analytics = await gscFetch(token, '/searchAnalytics/query', {
      startDate,
      endDate,
      dimensions: ['page'],
      rowLimit: 25,
    });

    if (analytics.rows && analytics.rows.length > 0) {
      console.log(`  ${'Page'.padEnd(60)} Clicks  Impr  CTR%   Pos`);
      console.log(`  ${'-'.repeat(60)} ------  ----  -----  ----`);
      for (const row of analytics.rows) {
        const page = row.keys[0].replace('https://ytubviral.com', '').padEnd(60);
        const clicks = String(row.clicks).padStart(6);
        const impressions = String(row.impressions).padStart(5);
        const ctr = (row.ctr * 100).toFixed(1).padStart(5);
        const position = row.position.toFixed(1).padStart(5);
        console.log(`  ${page} ${clicks}  ${impressions}  ${ctr}  ${position}`);
      }
    } else {
      console.log('  No search data available yet');
    }
  } catch (e) {
    console.error('  Analytics error:', e.message);
  }

  // 3. Search analytics — by query
  console.log('\n=== TOP QUERIES (last 28 days) ===');
  try {
    const queries = await gscFetch(token, '/searchAnalytics/query', {
      startDate,
      endDate,
      dimensions: ['query'],
      rowLimit: 20,
    });

    if (queries.rows && queries.rows.length > 0) {
      console.log(`  ${'Query'.padEnd(50)} Clicks  Impr  CTR%   Pos`);
      console.log(`  ${'-'.repeat(50)} ------  -----  -----  ----`);
      for (const row of queries.rows) {
        const query = row.keys[0].padEnd(50);
        const clicks = String(row.clicks).padStart(6);
        const impressions = String(row.impressions).padStart(6);
        const ctr = (row.ctr * 100).toFixed(1).padStart(5);
        const position = row.position.toFixed(1).padStart(5);
        console.log(`  ${query} ${clicks}  ${impressions}  ${ctr}  ${position}`);
      }
    } else {
      console.log('  No query data available yet');
    }
  } catch (e) {
    console.error('  Queries error:', e.message);
  }

  // 4. URL inspection — check key pages
  console.log('\n=== INDEX STATUS (URL Inspection) ===');
  const urlsToCheck = [
    'https://ytubviral.com/',
    'https://ytubviral.com/signup',
    'https://ytubviral.com/blog',
    'https://ytubviral.com/blog/herramientas-ia-para-youtubers-2026',
    'https://ytubviral.com/blog/como-escribir-titulos-virales-youtube',
    'https://ytubviral.com/blog/descripciones-seo-youtube-guia',
    'https://ytubviral.com/blog/7-frameworks-titulos-virales-youtube',
    'https://ytubviral.com/research',
    'https://ytubviral.com/competitors',
    'https://ytubviral.com/extension',
    'https://ytubviral.com/features/keyword-research',
    'https://ytubviral.com/features/seo-score',
    'https://ytubviral.com/features/competitor-analysis',
    'https://ytubviral.com/features/revenue-estimator',
    'https://ytubviral.com/features/ab-testing',
    'https://ytubviral.com/gear',
    'https://ytubviral.com/blog/mejores-camaras-youtube-2026',
    'https://ytubviral.com/blog/primer-estudio-youtube-setup-barato',
  ];

  for (const url of urlsToCheck) {
    try {
      const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL }),
      });
      const data = await res.json();
      const result = data.inspectionResult?.indexStatusResult;
      if (result) {
        const status = result.coverageState ?? 'unknown';
        const verdict = result.verdict ?? 'unknown';
        const lastCrawl = result.lastCrawlTime ?? 'never';
        const pageFetch = result.pageFetchState ?? '?';
        const shortUrl = url.replace('https://ytubviral.com', '');
        console.log(`  ${(shortUrl || '/').padEnd(55)} ${verdict.padEnd(20)} crawl: ${lastCrawl.split('T')[0]}  fetch: ${pageFetch}`);
      }
    } catch (e) {
      const shortUrl = url.replace('https://ytubviral.com', '');
      console.error(`  ${shortUrl}: ${e.message}`);
    }
  }
}

main().catch(console.error);
