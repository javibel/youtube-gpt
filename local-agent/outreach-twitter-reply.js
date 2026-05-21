'use strict';

/**
 * Reply to a specific tweet from a persona's Twitter/X account.
 *
 * Usage: node outreach-twitter-reply.js <persona-id> <tweet-url> "<reply text>"
 */

require('dotenv').config();
const { newPageForProfile, closeBrowserForProfile } = require('./browser');
const { safeGoto, safeEval } = require('./resilience');
const { ensureSession, persistSession } = require('./browser');

const PERSONAS = require('./personas.json');

function delay(min = 1500, max = 3000) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function replyToTweet(personaId, tweetUrl, replyText) {
  const persona = PERSONAS.find(p => p.id === personaId);
  if (!persona) throw new Error(`Persona ${personaId} not found`);

  const profileDir = persona.profileDir;
  const cookieFile = persona.platforms.twitter.cookieFile;
  const tag = `twitter-reply:${personaId}`;

  console.log(`[${tag}] Opening browser...`);
  const page = await newPageForProfile(profileDir);

  try {
    // Seed cookies
    await ensureSession(page, {
      domain: 'x.com',
      sessionCookieName: 'auth_token',
      cookieFile,
    });

    // First verify session
    const ok = await safeGoto(page, 'https://x.com/home', { tag, timeout: 60000 });
    if (!ok) throw new Error('Failed to load Twitter');
    await delay(3000, 4000);

    if (!page.url().includes('/home')) throw new Error(`Session expired — redirected to ${page.url()}`);
    console.log(`[${tag}] Session active`);

    // Navigate to the tweet
    const cleanUrl = tweetUrl.split('?')[0]; // Remove query params
    console.log(`[${tag}] Navigating to tweet: ${cleanUrl}`);
    const tweetOk = await safeGoto(page, cleanUrl, { tag, timeout: 45000 });
    if (!tweetOk) throw new Error('Failed to load tweet');
    await delay(3000, 4000);

    // Click the reply compose box (inside the tweet thread)
    console.log(`[${tag}] Looking for reply box...`);

    // The reply box on a tweet page has data-testid="tweetTextarea_0"
    const replyBox = await page.$('div[data-testid="tweetTextarea_0"]');
    if (!replyBox) throw new Error('Reply compose box not found');

    await replyBox.click();
    await delay(500, 1000);
    await page.keyboard.type(replyText, { delay: 40 });
    await delay(1500, 2500);

    // Click the reply button
    const replyBtn = await page.$('button[data-testid="tweetButtonInline"]');
    if (!replyBtn) throw new Error('Reply button not found');

    await replyBtn.click();
    await delay(3000, 4000);

    // Persist cookies
    await persistSession(page, { domain: 'x.com', cookieFile });

    console.log(`[${tag}] Reply posted successfully!`);
    console.log(`[${tag}] Reply: "${replyText.slice(0, 80)}..."`);

  } finally {
    await page.close().catch(() => {});
    await closeBrowserForProfile(profileDir);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const personaId = args[0];
  const tweetUrl = args[1];
  const replyText = args.slice(2).join(' ');

  if (!personaId || !tweetUrl || !replyText) {
    console.log('Usage: node outreach-twitter-reply.js <persona-id> <tweet-url> "<reply text>"');
    process.exit(1);
  }

  if (replyText.length > 280) {
    console.error(`Reply too long: ${replyText.length}/280 chars`);
    process.exit(1);
  }

  await replyToTweet(personaId, tweetUrl, replyText);
}

main().catch(err => {
  console.error(`[outreach-twitter-reply] Error: ${err.message}`);
  process.exit(1);
});

module.exports = { replyToTweet };
