'use strict';

/**
 * Tumblr OAuth1.0a Setup — One-time auth helper
 * Usage: node tumblr-setup.js
 */

const http = require('http');
const { URL } = require('url');
const { OAuth } = require('oauth');

const CONSUMER_KEY = 'alcvkKkSrZppaYQL2ek2JVoGp4SzfkXyIlv2iLC3sdaZ6arS0p';
const CONSUMER_SECRET = 'nxnT610ttHnZbeYnxegphqF8xg9nNJHy2uEC81BWIMcIoPYb6w';
const PORT = 3847;
const CALLBACK_URL = `http://localhost:${PORT}`;

const oauth = new OAuth(
  'https://www.tumblr.com/oauth/request_token',
  'https://www.tumblr.com/oauth/access_token',
  CONSUMER_KEY,
  CONSUMER_SECRET,
  '1.0A',
  CALLBACK_URL,
  'HMAC-SHA1'
);

async function setup() {
  console.log('\n=== Tumblr OAuth1.0a Setup ===\n');

  // Step 1: Get request token
  const { token, tokenSecret } = await new Promise((resolve, reject) => {
    oauth.getOAuthRequestToken((err, token, tokenSecret) => {
      if (err) reject(new Error(`Request token failed: ${JSON.stringify(err)}`));
      else resolve({ token, tokenSecret });
    });
  });

  // Step 2: User authorizes
  const authUrl = `https://www.tumblr.com/oauth/authorize?oauth_token=${token}`;
  console.log(`Open this URL in your browser:\n${authUrl}\n`);

  // Step 3: Wait for callback
  const verifier = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const oauthVerifier = url.searchParams.get('oauth_verifier');
      if (oauthVerifier) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Tumblr authorization successful!</h1><p>You can close this tab.</p>');
        server.close();
        resolve(oauthVerifier);
      }
    });
    server.listen(PORT, () => console.log(`Waiting for callback on port ${PORT}...`));
  });

  console.log('\nExchanging for access token...');

  // Step 4: Get access token
  const { accessToken, accessTokenSecret } = await new Promise((resolve, reject) => {
    oauth.getOAuthAccessToken(token, tokenSecret, verifier, (err, accessToken, accessTokenSecret) => {
      if (err) reject(new Error(`Access token failed: ${JSON.stringify(err)}`));
      else resolve({ accessToken, accessTokenSecret });
    });
  });

  console.log('\n✓ Tumblr access token obtained!\n');
  console.log('Add these to your .env file:\n');
  console.log(`TUMBLR_CONSUMER_KEY=${CONSUMER_KEY}`);
  console.log(`TUMBLR_CONSUMER_SECRET=${CONSUMER_SECRET}`);
  console.log(`TUMBLR_ACCESS_TOKEN=${accessToken}`);
  console.log(`TUMBLR_ACCESS_TOKEN_SECRET=${accessTokenSecret}`);
  console.log(`TUMBLR_BLOG_NAME=ytubviralblog`);
}

setup().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
