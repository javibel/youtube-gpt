'use strict';

/**
 * Post a tweet from a persona's or brand Twitter/X account.
 *
 * Usage:
 *   node outreach-tweet.js <persona-id> "<tweet text>"
 *   node outreach-tweet.js brand "<tweet text>"
 *   node outreach-tweet.js brand --thread (reads thread from outreach-tweet-queue.json)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { newPage, newPageForProfile, closeBrowserForProfile } = require('./browser');
const { safeGoto, safeEval } = require('./resilience');
const { ensureSession, persistSession } = require('./browser');

const PERSONAS = require('./personas.json');
const THREAD_QUEUE = path.join(__dirname, 'outreach-tweet-queue.json');

// Brand account config
const BRAND_PROFILE = 'chrome-profile';
const BRAND_COOKIE = 'twitter-cookies.json';

function delay(min = 1500, max = 3000) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function openTwitterSession(personaId) {
  const isBrand = personaId === 'brand';
  const tag = `tweet:${personaId}`;

  let profileDir, cookieFile;
  if (isBrand) {
    profileDir = BRAND_PROFILE;
    cookieFile = BRAND_COOKIE;
  } else {
    const persona = PERSONAS.find(p => p.id === personaId);
    if (!persona) throw new Error(`Persona ${personaId} not found`);
    profileDir = persona.profileDir;
    cookieFile = persona.platforms.twitter.cookieFile;
  }

  console.log(`[${tag}] Opening browser...`);
  const page = await newPageForProfile(profileDir);

  await ensureSession(page, {
    domain: 'x.com',
    sessionCookieName: 'auth_token',
    cookieFile,
  });

  const ok = await safeGoto(page, 'https://x.com/home', { tag, timeout: 60000 });
  if (!ok) {
    await page.close().catch(() => {});
    throw new Error('Failed to load Twitter');
  }
  await delay(3000, 4000);

  if (!page.url().includes('/home')) {
    await page.close().catch(() => {});
    throw new Error(`Session expired — redirected to ${page.url()}`);
  }

  console.log(`[${tag}] Session active`);
  await persistSession(page, { domain: 'x.com', cookieFile });
  return { page, profileDir, cookieFile, tag };
}

async function postTweet(personaId, tweetText) {
  const { page, profileDir, cookieFile, tag } = await openTwitterSession(personaId);

  try {
    console.log(`[${tag}] Composing tweet...`);

    const composeBox = await page.$('div[data-testid="tweetTextarea_0"]');
    if (!composeBox) throw new Error('Tweet compose box not found');

    await composeBox.click();
    await delay(500, 1000);
    await page.keyboard.type(tweetText, { delay: 40 });
    await delay(1500, 2500);

    const postBtn = await page.$('button[data-testid="tweetButtonInline"]');
    if (!postBtn) throw new Error('Post button not found');

    await postBtn.click();
    await delay(3000, 4000);

    await persistSession(page, { domain: 'x.com', cookieFile });

    console.log(`[${tag}] Tweet posted successfully!`);
    console.log(`[${tag}] Tweet: "${tweetText.slice(0, 80)}..."`);

  } finally {
    await page.close().catch(() => {});
    await closeBrowserForProfile(profileDir);
  }
}

/**
 * Post a thread (array of tweets). Each tweet replies to the previous one.
 */
async function postThread(personaId, tweets) {
  const { page, profileDir, cookieFile, tag } = await openTwitterSession(personaId);

  try {
    for (let i = 0; i < tweets.length; i++) {
      const text = tweets[i];
      console.log(`[${tag}] Thread ${i + 1}/${tweets.length}: "${text.slice(0, 50)}..."`);

      if (i === 0) {
        // First tweet: use the compose box on home
        const composeBox = await page.$('div[data-testid="tweetTextarea_0"]');
        if (!composeBox) throw new Error('Tweet compose box not found');
        await composeBox.click();
        await delay(500, 1000);
        await page.keyboard.type(text, { delay: 35 });
        await delay(1500, 2500);

        const postBtn = await page.$('button[data-testid="tweetButtonInline"]');
        if (!postBtn) throw new Error('Post button not found');
        await postBtn.click();
        await delay(4000, 6000);

        // Navigate to our profile to find the tweet we just posted
        const profileLink = await safeEval(page, () => {
          const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
          return link?.href || null;
        });

        if (!profileLink) throw new Error('Profile link not found — cannot thread');
        const navOk = await safeGoto(page, profileLink, { tag, timeout: 30000 });
        if (!navOk) throw new Error('Failed to navigate to profile');
        await delay(2000, 3000);

        // Click on the first tweet to open it
        const tweetLink = await safeEval(page, () => {
          const articles = document.querySelectorAll('article[data-testid="tweet"]');
          if (articles.length === 0) return null;
          const timeLink = articles[0].querySelector('time')?.closest('a');
          return timeLink?.href || null;
        });

        if (!tweetLink) throw new Error('Could not find posted tweet on profile');
        const tweetNavOk = await safeGoto(page, tweetLink, { tag, timeout: 30000 });
        if (!tweetNavOk) throw new Error('Failed to navigate to posted tweet');
        await delay(2000, 3000);

      } else {
        // Subsequent tweets: reply to the current tweet
        // The reply box should be visible on the tweet page
        const replyBox = await page.$('div[data-testid="tweetTextarea_0"]');
        if (!replyBox) {
          // Try clicking the reply button first
          const replyBtn = await page.$('button[data-testid="reply"]');
          if (replyBtn) {
            await replyBtn.click();
            await delay(1500, 2000);
          }
        }

        const textArea = await page.$('div[data-testid="tweetTextarea_0"]');
        if (!textArea) throw new Error(`Reply box not found for tweet ${i + 1}`);

        await textArea.click();
        await delay(500, 1000);
        await page.keyboard.type(text, { delay: 35 });
        await delay(1500, 2500);

        // Submit reply
        const submitBtn = await page.$('button[data-testid="tweetButtonInline"]');
        if (!submitBtn) throw new Error(`Submit button not found for tweet ${i + 1}`);
        await submitBtn.click();
        await delay(4000, 6000);

        // The page should now show our reply — next iteration replies to this one
        // Scroll down to find our latest reply and click into it
        await safeEval(page, () => window.scrollBy(0, 500));
        await delay(1000, 2000);

        // Find and click our latest reply (last tweet in the thread)
        const latestReply = await safeEval(page, () => {
          const articles = document.querySelectorAll('article[data-testid="tweet"]');
          if (articles.length === 0) return null;
          const last = articles[articles.length - 1];
          const timeLink = last.querySelector('time')?.closest('a');
          return timeLink?.href || null;
        });

        if (latestReply && i < tweets.length - 1) {
          // Only navigate into the reply if there are more tweets to add
          const replyNavOk = await safeGoto(page, latestReply, { tag, timeout: 30000 });
          if (!replyNavOk) throw new Error(`Failed to navigate to reply ${i + 1}`);
          await delay(2000, 3000);
        }
      }

      console.log(`[${tag}] ✓ Tweet ${i + 1} posted`);
    }

    await persistSession(page, { domain: 'x.com', cookieFile });
    console.log(`[${tag}] Thread complete! ${tweets.length} tweets posted.`);

  } finally {
    await page.close().catch(() => {});
    await closeBrowserForProfile(profileDir);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const personaId = args[0];

  if (!personaId) {
    console.log('Usage:');
    console.log('  node outreach-tweet.js <persona-id|brand> "<tweet text>"');
    console.log('  node outreach-tweet.js <persona-id|brand> --thread');
    console.log('  (--thread reads from outreach-tweet-queue.json)');
    process.exit(1);
  }

  if (args.includes('--thread')) {
    // Read thread from queue file
    if (!fs.existsSync(THREAD_QUEUE)) {
      console.error(`Thread queue not found: ${THREAD_QUEUE}`);
      process.exit(1);
    }
    const queue = JSON.parse(fs.readFileSync(THREAD_QUEUE, 'utf-8'));
    const pending = queue.threads?.find(t => t.status === 'pending');
    if (!pending) {
      console.log('No pending threads in queue.');
      process.exit(0);
    }

    await postThread(personaId, pending.tweets);
    pending.status = 'posted';
    pending.datePosted = new Date().toISOString().split('T')[0];
    fs.writeFileSync(THREAD_QUEUE, JSON.stringify(queue, null, 2));
    return;
  }

  const tweetText = args.slice(1).join(' ');
  if (!tweetText) {
    console.log('No tweet text provided.');
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

module.exports = { postTweet, postThread };
