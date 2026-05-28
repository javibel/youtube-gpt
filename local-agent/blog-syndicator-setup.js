'use strict';
require('dotenv').config();

/**
 * Blog Syndicator Setup — One-time auth helper
 *
 * Usage:
 *   node blog-syndicator-setup.js wordpress   → Get WordPress.com OAuth token
 *   node blog-syndicator-setup.js blogger      → Get Blogger refresh token + blog ID
 */

const http = require('http');
const { URL } = require('url');

const GMAIL_CLIENT_ID = (process.env.GMAIL_CLIENT_ID || '').trim();
const GMAIL_CLIENT_SECRET = (process.env.GMAIL_CLIENT_SECRET || '').trim();

const PORT = 3847; // Local callback port

// ── WordPress.com OAuth2 ────────────────────────────────────────────────────

async function setupWordPress() {
  console.log('\n=== WordPress.com OAuth2 Setup ===\n');
  console.log('Step 1: Create an app at https://developer.wordpress.com/apps/');
  console.log('   - Redirect URL: http://localhost:' + PORT);
  console.log('   - Type: Web');
  console.log('   - Note your Client ID and Client Secret\n');

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  const clientId = await ask('WordPress.com Client ID: ');
  const clientSecret = await ask('WordPress.com Client Secret: ');

  console.log('\nStep 2: Opening authorization URL...');
  const authUrl = `https://public-api.wordpress.com/oauth2/authorize?client_id=${clientId}&redirect_uri=http://localhost:${PORT}&response_type=code&scope=global`;
  console.log(`\nOpen this URL in your browser:\n${authUrl}\n`);

  // Wait for callback
  const code = await new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const authCode = url.searchParams.get('code');
      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful!</h1><p>You can close this tab.</p>');
        server.close();
        resolve(authCode);
      }
    });
    server.listen(PORT, () => console.log(`Waiting for callback on port ${PORT}...`));
  });

  console.log(`\nReceived authorization code. Exchanging for token...`);

  // Exchange code for token
  const res = await fetch('https://public-api.wordpress.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `http://localhost:${PORT}`,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json();
  if (data.access_token) {
    console.log('\n✓ WordPress.com token obtained!\n');
    console.log('Add these to your .env file:\n');
    console.log(`WP_COM_SITE=${data.blog_url?.replace('https://', '') || 'YOUR_SITE.wordpress.com'}`);
    console.log(`WP_COM_TOKEN=${data.access_token}`);
    console.log(`\nBlog ID: ${data.blog_id}`);
    console.log(`Blog URL: ${data.blog_url}`);
  } else {
    console.error('Error:', JSON.stringify(data, null, 2));
  }

  rl.close();
}

// ── Blogger OAuth2 ──────────────────────────────────────────────────────────

async function setupBlogger() {
  console.log('\n=== Blogger OAuth2 Setup ===\n');

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    console.error('Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env');
    process.exit(1);
  }

  console.log('Using existing Google OAuth client from .env');
  console.log(`Client ID: ${GMAIL_CLIENT_ID.slice(0, 20)}...`);

  // Build auth URL with Blogger scope
  const scopes = 'https://www.googleapis.com/auth/blogger';
  const redirectUri = `http://localhost:${PORT}`;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GMAIL_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;

  console.log(`\nOpen this URL in your browser:\n${authUrl}\n`);

  // Wait for callback
  const code = await new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const authCode = url.searchParams.get('code');
      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Blogger authorization successful!</h1><p>You can close this tab.</p>');
        server.close();
        resolve(authCode);
      }
    });
    server.listen(PORT, () => console.log(`Waiting for callback on port ${PORT}...`));
  });

  console.log(`\nReceived authorization code. Exchanging for tokens...`);

  // Exchange code for tokens
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json();
  if (data.refresh_token) {
    console.log('\n✓ Blogger refresh token obtained!\n');

    // Now get blog ID
    console.log('Fetching your Blogger blogs...');
    const blogsRes = await fetch('https://www.googleapis.com/blogger/v3/users/self/blogs', {
      headers: { 'Authorization': `Bearer ${data.access_token}` },
    });
    const blogsData = await blogsRes.json();

    if (blogsData.items?.length) {
      console.log('\nYour Blogger blogs:');
      for (const blog of blogsData.items) {
        console.log(`  - ${blog.name} (ID: ${blog.id}) → ${blog.url}`);
      }
      console.log('\nAdd these to your .env file:\n');
      console.log(`BLOGGER_REFRESH_TOKEN=${data.refresh_token}`);
      console.log(`BLOGGER_BLOG_ID=${blogsData.items[0].id}`);
    } else {
      console.log('\nNo blogs found. Create one at https://www.blogger.com first.');
      console.log('\nAdd this to your .env file:\n');
      console.log(`BLOGGER_REFRESH_TOKEN=${data.refresh_token}`);
      console.log('BLOGGER_BLOG_ID=<create a blog first, then get the ID>');
    }
  } else {
    console.error('Error:', JSON.stringify(data, null, 2));
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

const cmd = process.argv[2];
if (cmd === 'wordpress') {
  setupWordPress().catch(console.error);
} else if (cmd === 'blogger') {
  setupBlogger().catch(console.error);
} else {
  console.log('Usage:');
  console.log('  node blog-syndicator-setup.js wordpress   → Setup WordPress.com');
  console.log('  node blog-syndicator-setup.js blogger     → Setup Blogger');
}
