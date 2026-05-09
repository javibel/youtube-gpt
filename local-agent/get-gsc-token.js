/**
 * Google Search Console — OAuth token generator
 *
 * Prerequisites:
 *   1. Go to Google Cloud Console → APIs & Services → Library
 *   2. Search "Google Search Console API" and ENABLE it
 *   3. Make sure the OAuth consent screen includes the test user email
 *
 * Usage:
 *   node get-gsc-token.js
 *
 * It will open a browser for OAuth consent. After authorizing,
 * paste the code back here to get the refresh token.
 */

require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { exec } = require('child_process');

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3456/callback';
const SCOPE = 'https://www.googleapis.com/auth/webmasters https://www.googleapis.com/auth/indexing';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env');
  process.exit(1);
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:3456`);
  if (url.pathname !== '/callback') return;

  const code = url.searchParams.get('code');
  if (!code) {
    res.end('No code received');
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const data = await tokenRes.json();

    if (data.refresh_token) {
      console.log('\n✅ Success! Add this to your .env:\n');
      console.log(`GSC_REFRESH_TOKEN=${data.refresh_token}`);
      console.log(`\n(Uses same GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET)`);
      res.end('Success! You can close this tab.');
    } else {
      console.error('No refresh_token in response:', data);
      res.end('Error — check terminal');
    }
  } catch (err) {
    console.error('Token exchange failed:', err);
    res.end('Error — check terminal');
  }

  setTimeout(() => { server.close(); process.exit(0); }, 1000);
});

server.listen(3456, () => {
  console.log('Opening browser for Google authorization...');
  console.log('If it doesn\'t open, visit:\n', authUrl, '\n');
  exec(`start "" "${authUrl}"`);
});
