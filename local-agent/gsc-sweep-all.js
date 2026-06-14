// Sweep completo de coverage de todas las URLs del sitemap — A1 (2026-06-11)
require('dotenv').config();

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GSC_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(JSON.stringify(data));
  return data.access_token;
}

async function main() {
  const token = await getAccessToken();
  const xml = await (await fetch('https://ytubviral.com/sitemap.xml')).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  console.log(`Inspecting ${urls.length} URLs from live sitemap...\n`);

  const results = [];
  for (const url of urls) {
    const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: 'sc-domain:ytubviral.com' }),
    });
    const data = await res.json();
    const idx = data.inspectionResult?.indexStatusResult || {};
    const short = url.replace('https://ytubviral.com', '') || '/';
    const state = idx.coverageState || ('ERROR: ' + JSON.stringify(data.error?.message || data));
    results.push({ url: short, state, lastCrawl: idx.lastCrawlTime || null, googleCanonical: idx.googleCanonical || null });
    console.log(`${short.padEnd(55)} ${state}`);
    await new Promise(r => setTimeout(r, 1100));
  }

  const summary = {};
  for (const r of results) summary[r.state] = (summary[r.state] || 0) + 1;
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  // Date-stamped output (was hardcoded to 2026-06-11, which overwrote the baseline on every run).
  const today = new Date().toISOString().slice(0, 10);
  require('fs').writeFileSync(`reports/gsc-sweep-${today}.json`, JSON.stringify({ date: today, summary, results }, null, 2));
  console.log(`Saved to reports/gsc-sweep-${today}.json`);
}

main().catch(console.error);
