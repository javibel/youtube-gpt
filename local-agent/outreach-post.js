'use strict';

/**
 * Outreach Community Post Publisher — publishes beta tester posts
 * on Reddit subreddits using brand-reddit profile.
 *
 * Reads posts from outreach-community-posts.json, publishes pending ones
 * via Puppeteer on old.reddit.com, updates status.
 *
 * Usage:
 *   node outreach-post.js [--dry-run]
 *   Cron: runs once at 11:00 Madrid (after persona morning runs)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { newPageForProfile, closeBrowserForProfile } = require('./browser');
const { safeGoto, safeEval } = require('./resilience');

const POSTS_FILE = path.join(__dirname, 'outreach-community-posts.json');
const DRY_RUN = process.argv.includes('--dry-run');
const PROFILE = 'chrome-profiles/brand-reddit';
const TAG = 'outreach-post';

// Max posts per run to avoid looking spammy
const MAX_POSTS_PER_RUN = 2;

function delay(min = 2000, max = 4000) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function submitRedditPost(page, subreddit, title, body) {
  // Navigate to old reddit submit page
  const submitUrl = `https://old.reddit.com/r/${subreddit}/submit?selftext=true`;
  const ok = await safeGoto(page, submitUrl, { tag: TAG, timeout: 45000, profileDir: PROFILE });
  if (!ok) throw new Error(`Failed to load submit page for r/${subreddit}`);
  await delay(2000, 3000);

  // Check if we're logged in
  const loggedIn = await safeEval(page, () => {
    const userSpan = document.querySelector('.user a');
    return !!userSpan && !userSpan.textContent?.includes('login');
  });
  if (!loggedIn) throw new Error('Not logged in to Reddit');

  // Check for subreddit restrictions (some require flair, approval, etc.)
  const restricted = await safeEval(page, () => {
    const body = document.body.innerText || '';
    if (body.includes('restricted') || body.includes('you aren\'t allowed')) return true;
    return false;
  });
  if (restricted) throw new Error(`r/${subreddit} is restricted — cannot post`);

  // Fill in title
  const titleInput = await page.$('textarea[name="title"], input[name="title"]');
  if (!titleInput) throw new Error('Title input not found');
  await titleInput.click();
  await delay(300, 500);
  await page.keyboard.type(title, { delay: 25 });
  await delay(500, 1000);

  // Click the text tab (should already be selected since we used ?selftext=true)
  // Fill in body
  const bodyInput = await page.$('textarea[name="text"], div.usertext-edit textarea');
  if (!bodyInput) throw new Error('Body textarea not found');
  await bodyInput.click();
  await delay(300, 500);
  await page.keyboard.type(body, { delay: 15 });
  await delay(1000, 2000);

  // Submit
  const submitBtn = await page.$('button[type="submit"], .submit button, #newlink button.btn[type="submit"]');
  if (!submitBtn) throw new Error('Submit button not found');
  await submitBtn.click();
  await delay(4000, 6000);

  // Check if we landed on the post page (success) or still on submit (error)
  const currentUrl = page.url();
  if (currentUrl.includes('/submit')) {
    // Check for error messages
    const error = await safeEval(page, () => {
      const errEl = document.querySelector('.error, .status-msg');
      return errEl?.textContent?.trim() || null;
    });
    throw new Error(`Post submission failed: ${error || 'still on submit page'}`);
  }

  console.log(`[${TAG}] Posted to r/${subreddit}: ${currentUrl}`);
  return currentUrl;
}

async function runOutreachPost() {
  if (!fs.existsSync(POSTS_FILE)) {
    console.log(`[${TAG}] No posts file found. Creating from template...`);
    initPostsFile();
  }

  const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  // Find pending posts scheduled for today or earlier
  const pending = posts.filter(p =>
    p.status === 'pending' &&
    p.platform === 'reddit' &&
    p.scheduledDate <= today
  );

  if (pending.length === 0) {
    console.log(`[${TAG}] No pending Reddit posts due.`);
    return { posted: 0 };
  }

  console.log(`[${TAG}] ${DRY_RUN ? 'DRY RUN — ' : ''}${pending.length} posts due, will post up to ${MAX_POSTS_PER_RUN}`);

  const batch = pending.slice(0, MAX_POSTS_PER_RUN);
  let posted = 0;

  const page = await newPageForProfile(PROFILE);
  try {
    // Verify session first
    const ok = await safeGoto(page, 'https://old.reddit.com/', { tag: TAG, timeout: 60000, profileDir: PROFILE });
    if (!ok) throw new Error('Failed to load Reddit');
    await delay(2000, 3000);

    const username = await safeEval(page, () => {
      const userSpan = document.querySelector('.user a');
      return userSpan?.textContent?.trim() || null;
    });
    if (!username || username === 'login' || username === 'register') {
      throw new Error('brand-reddit session expired');
    }
    console.log(`[${TAG}] Logged in as: ${username}`);

    for (const post of batch) {
      console.log(`[${TAG}] Posting to r/${post.subreddit}: "${post.title.slice(0, 60)}..."`);

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would post to r/${post.subreddit}`);
        continue;
      }

      try {
        const url = await submitRedditPost(page, post.subreddit, post.title, post.body);
        post.status = 'posted';
        post.datePosted = today;
        post.url = url;
        posted++;
        console.log(`  ✓ Posted: ${url}`);
      } catch (err) {
        console.error(`  ✗ Failed: ${err.message}`);
        post.status = 'failed';
        post.notes = (post.notes || '') + ` | Failed ${today}: ${err.message}`;
      }

      await delay(30000, 60000); // 30-60s between posts to avoid rate limits
    }
  } finally {
    await page.close().catch(() => {});
    await closeBrowserForProfile(PROFILE);
  }

  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
  console.log(`[${TAG}] Done. ${posted}/${batch.length} posts published.`);
  return { posted };
}

function initPostsFile() {
  const posts = [
    {
      id: 'newtubers-beta',
      platform: 'reddit',
      subreddit: 'NewTubers',
      title: 'I built a free YouTube growth toolkit with AI — looking for 30 beta testers to try it',
      body: `Hey everyone,\n\nI've been building YTubViral for the past few months — it's a set of AI-powered tools for YouTube creators: SEO optimizer, keyword research, title/description generator, thumbnail ideas, retention analysis, content calendar, and more.\n\nThe core tools are free, but I'm offering the full Pro plan (normally $10/mo) free for 1 month to anyone willing to test it and give honest feedback.\n\nWhat I'm looking for:\n- You have a YouTube channel (any size)\n- You use it for at least a week\n- You tell me what works, what's broken, and what's missing\n\nNo strings attached. No credit card needed to sign up. If it sucks, tell me it sucks — that's the whole point.\n\nLink: https://ytubviral.com\n\nJust sign up and DM me your email here or comment below. I'll activate Pro on your account.\n\nThanks!`,
      lang: 'en',
      scheduledDate: '2026-05-20',
      status: 'pending',
      datePosted: null,
      url: null,
      notes: null
    },
    {
      id: 'smallytchannel-beta',
      platform: 'reddit',
      subreddit: 'SmallYTChannel',
      title: 'Free Pro access to an AI YouTube toolkit — need honest feedback from real creators',
      body: `I'm Javier, I've been building YTubViral — basically a toolkit that helps with the stuff that takes forever: finding the right keywords, writing SEO-optimized titles and descriptions, analyzing what makes people click away from your videos, generating thumbnail concepts, etc.\n\nLooking for creators who'd be willing to test the Pro plan for free (1 month) and tell me what they think. Any channel size welcome.\n\nWhat's in it:\n- YouTube SEO Optimizer (titles, descriptions, tags)\n- Keyword Research with search volume\n- Content Idea Generator\n- Retention Analyzer\n- Thumbnail Concept Generator\n- Competitor Analysis\n- Upload Schedule Optimizer\n- And a few more tools\n\nSign up at https://ytubviral.com, drop your email in the comments, and I'll upgrade you to Pro.`,
      lang: 'en',
      scheduledDate: '2026-05-20',
      status: 'pending',
      datePosted: null,
      url: null,
      notes: null
    },
    {
      id: 'youtubers-retention',
      platform: 'reddit',
      subreddit: 'youtubers',
      title: '[Question] Would you use an AI tool that analyzes your video retention and suggests improvements?',
      body: `Genuine question — I built this as part of a larger YouTube toolkit (YTubViral) and I'm curious if retention analysis is something creators actually find useful, or if it's one of those "sounds cool but never use it" features.\n\nThe way it works: you paste your video URL, it analyzes the retention curve patterns, and suggests specific changes (hook improvements, pacing, where viewers drop off and why).\n\nIf anyone wants to try it, the toolkit is free to sign up and I'm giving Pro access to beta testers this month. https://ytubviral.com\n\nBut mainly I want to know: is retention analysis something you'd actually open weekly? Or is SEO/keywords more where the pain is?`,
      lang: 'en',
      scheduledDate: '2026-05-21',
      status: 'pending',
      datePosted: null,
      url: null,
      notes: null
    },
    {
      id: 'creadores-beta',
      platform: 'reddit',
      subreddit: 'CreadoresdContenido',
      title: 'Herramienta gratuita de crecimiento YouTube con IA — busco 30 testers',
      body: `Hola a todos,\n\nLlevo meses desarrollando YTubViral, un conjunto de herramientas con IA para creadores de YouTube: optimizador SEO, investigación de keywords, generador de títulos y descripciones, análisis de retención, ideas de contenido, calendario de subidas, y más.\n\nLas herramientas básicas son gratis, pero estoy ofreciendo el plan Pro completo (normalmente 9,99 EUR/mes) gratis durante 1 mes a quien quiera probarlo y darme feedback honesto.\n\nLo que busco:\n- Tienes un canal de YouTube (cualquier tamaño)\n- Lo usas al menos una semana\n- Me dices qué funciona, qué falla, y qué falta\n\nSin compromiso. Sin tarjeta de crédito. Si no te gusta, dímelo — para eso es el beta.\n\nLink: https://ytubviral.com\n\nRegístrate y comenta aquí con tu email o mándame DM. Yo activo Pro en tu cuenta.\n\nGracias!`,
      lang: 'es',
      scheduledDate: '2026-05-21',
      status: 'pending',
      datePosted: null,
      url: null,
      notes: null
    },
  ];
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

if (require.main === module) {
  runOutreachPost().catch(err => {
    console.error(`[${TAG}] Fatal:`, err.message);
    process.exit(1);
  });
}

module.exports = { runOutreachPost };
