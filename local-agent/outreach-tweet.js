'use strict';

/**
 * Post a tweet from a persona's Twitter/X account.
 *
 * Usage: node outreach-tweet.js <persona-id> "<tweet text>"
 */

require('dotenv').config();
const { newPageForProfile, closeBrowserForProfile } = require('./browser');
const { safeGoto, safeEval } = require('./resilience');
const { ensureSession, persistSession } = require('./browser');

const PERSONAS = require('./personas.json');

function delay(min = 1500, max = 3000) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function postTweet(personaId, tweetText) {
  const persona = PERSONAS.find(p => p.id === personaId);
  if (!persona) throw new Error(`Persona ${personaId} not found`);

  const profileDir = persona.profileDir;
  const cookieFile = persona.platforms.twitter.cookieFile;
  const tag = `tweet:${personaId}`;

  console.log(`[${tag}] Opening browser...`);
  const page = await newPageForProfile(profileDir);

  try {
    // Seed cookies
    await ensureSession(page, {
      domain: 'x.com',
      sessionCookieName: 'auth_token',
      cookieFile,
    });

    const ok = await safeGoto(page, 'https://x.com/home', { tag, timeout: 60000 });
    if (!ok) throw new Error('Failed to load Twitter');
    await delay(3000, 4000);

    if (!page.url().includes('/home')) throw new Error(`Session expired — redirected to ${page.url()}`);

    console.log(`[${tag}] Session active, composing tweet...`);

    // Click on the tweet compose box
    const composeBox = await page.$('div[data-testid="tweetTextarea_0"]');
    if (!composeBox) throw new Error('Tweet compose box not found');

    await composeBox.click();
    await delay(500, 1000);
    await page.keyboard.type(tweetText, { delay: 40 });
    await delay(1500, 2500);

    // Click the tweet/post button
    const postBtn = await page.$('button[data-testid="tweetButtonInline"]');
    if (!postBtn) throw new Error('Post button not found');

    await postBtn.click();
    await delay(3000, 4000);

    // Persist cookies
    await persistSession(page, { domain: 'x.com', cookieFile });

    console.log(`[${tag}] Tweet posted successfully!`);
    console.log(`[${tag}] Tweet: "${tweetText.slice(0, 80)}..."`);

  } finally {
    await page.close().catch(() => {});
    await closeBrowserForProfile(profileDir);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const personaId = args[0];
  const tweetText = args.slice(1).join(' ');

  if (!personaId || !tweetText) {
    console.log('Usage: node outreach-tweet.js <persona-id> "<tweet text>"');
    process.exit(1);
  }

  if (tweetText.length > 280) {
    console.error(`Tweet too long: ${tweetText.length}/280 chars`);
    process.exit(1);
  }

  await postTweet(personaId, tweetText);
}

main().catch(err => {
  console.error(`[outreach-tweet] Error: ${err.message}`);
  process.exit(1);
});

module.exports = { postTweet };
