/**
 * Google Search Console — Submit sitemap + request re-crawl
 * Resubmits the sitemap and pings Google to crawl new pages
 */
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

async function main() {
  const token = await getAccessToken();

  // 1. Delete and resubmit sitemap to force re-crawl
  const sitemapUrl = 'https://ytubviral.com/sitemap.xml';
  const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}`;

  console.log('1. Deleting old sitemap submission...');
  try {
    const del = await fetch(`${base}/sitemaps/${encodeURIComponent(sitemapUrl)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`   DELETE status: ${del.status}`);
  } catch (e) {
    console.log(`   Delete failed (ok if not found): ${e.message}`);
  }

  console.log('2. Resubmitting sitemap...');
  const submit = await fetch(`${base}/sitemaps/${encodeURIComponent(sitemapUrl)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`   PUT status: ${submit.status} ${submit.status === 204 ? '✓ OK' : await submit.text()}`);

  // 3. Verify sitemap is submitted
  console.log('3. Verifying sitemap...');
  const verify = await fetch(`${base}/sitemaps/${encodeURIComponent(sitemapUrl)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await verify.json();
  console.log(`   Path: ${data.path}`);
  console.log(`   Last submitted: ${data.lastSubmitted}`);
  console.log(`   Status: ${data.isPending ? 'PENDING' : 'OK'}`);
  if (data.contents) {
    for (const c of data.contents) {
      console.log(`   ${c.type}: submitted=${c.submitted}, indexed=${c.indexed}`);
    }
  }

  console.log('\n✓ Sitemap resubmitted. Google will re-crawl all URLs in the sitemap.');
  console.log('  Typically takes 2-7 days for new pages to be crawled and indexed.');
  console.log('  Feature pages, blog posts, and /gear should be picked up in the next crawl cycle.');
}

main().catch(console.error);
