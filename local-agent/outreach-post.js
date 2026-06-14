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
// Reddit blocks submissions from low-standing accounts (forbidden even on r/test). Don't even
// attempt below this — build karma via comments first (I5 Fase 0). Tune as the account grows.
const MIN_KARMA_TO_POST = 50;

function delay(min = 2000, max = 4000) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function submitRedditPost(page, subreddit, title, body) {
  // Use OLD reddit: stable, simple DOM (plain textareas) — same domain/selectors that already
  // work for comments in outreach-reddit-targeted.js. The new-reddit shadow-DOM composer was
  // unreliable (all 11 queued posts failed on "Body input not found" / "still on submit page").
  const submitUrl = `https://old.reddit.com/r/${subreddit}/submit?selftext=true`;
  const ok = await safeGoto(page, submitUrl, { tag: TAG, timeout: 45000, profileDir: PROFILE });
  if (!ok) throw new Error(`Failed to load submit page for r/${subreddit}`);
  await delay(2500, 3500);

  const currentUrl = page.url();
  if (currentUrl.includes('/login')) throw new Error('Not logged in to Reddit');

  // Restriction / not-allowed / must-subscribe checks
  const blocked = await safeEval(page, () => {
    const txt = (document.body.innerText || '').toLowerCase();
    if (txt.includes("you aren't allowed to post") || txt.includes('this community') && txt.includes('restricted')) return 'restricted';
    if (txt.includes('you must be a moderator') || txt.includes("don't have access")) return 'no-access';
    return null;
  });
  if (blocked) throw new Error(`r/${subreddit} blocked: ${blocked}`);

  // CAPTCHA check — old reddit shows one for low-karma/new accounts. If present we can't post
  // programmatically; fail clearly so it's obvious karma-building (I5 Fase 0) is needed first.
  const hasCaptcha = await safeEval(page, () => {
    return !!document.querySelector('.captcha, .g-recaptcha, iframe[src*="recaptcha"], iframe[title*="recaptcha"]');
  });
  if (hasCaptcha) throw new Error('CAPTCHA required (karma too low) — build karma via comments first (I5 Fase 0)');

  // Title — old reddit: textarea[name="title"]
  const titleEl = await page.$('textarea[name="title"], #title-field textarea, input[name="title"]');
  if (!titleEl) throw new Error('Title input not found');
  await titleEl.click();
  await delay(300, 500);
  await page.keyboard.type(title, { delay: 20 });
  await delay(400, 800);

  // Body — old reddit: textarea[name="text"]
  const bodyEl = await page.$('textarea[name="text"]');
  if (!bodyEl) throw new Error('Body input not found');
  await bodyEl.click();
  await delay(300, 500);
  await page.keyboard.type(body, { delay: 8 });
  await delay(800, 1500);

  // Submit — old reddit self-post form submit button
  const submitted = await safeEval(page, () => {
    const form = document.querySelector('form.submit, form#newlink, form[action*="submit"]') || document;
    const btn = form.querySelector('button[type="submit"], button.save-button')
      || Array.from(form.querySelectorAll('button')).find(b => /submit|post/i.test(b.textContent || ''));
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  });
  if (!submitted) throw new Error('Submit button not found or disabled');

  await delay(4000, 7000);

  const finalUrl = page.url();
  if (finalUrl.includes('/submit')) {
    const error = await safeEval(page, () => {
      const el = document.querySelector('.error, .status, [role="alert"]');
      return el?.textContent?.trim() || null;
    });
    throw new Error(`Post submission failed: ${error || 'still on submit page'}`);
  }

  console.log(`[${TAG}] Posted to r/${subreddit}: ${finalUrl}`);
  return finalUrl;
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
    // Verify session on new Reddit
    const ok = await safeGoto(page, 'https://www.reddit.com/', { tag: TAG, timeout: 60000, profileDir: PROFILE });
    if (!ok) throw new Error('Failed to load Reddit');
    await delay(3000, 4000);

    const loggedIn = await safeEval(page, () => {
      // New Reddit: check if logged in by looking for Create button or user avatar
      const createBtn = document.querySelector('a[href*="/submit"], faceplate-tracker[action="click"]');
      const loginBtn = document.querySelector('a[href*="/login"]');
      return !loginBtn || !!createBtn;
    });
    if (!loggedIn) {
      throw new Error('brand-reddit session expired');
    }

    // Read the REAL logged-in user + karma (the old hardcoded 'YTbeViral' was wrong — the
    // brand-reddit profile is actually u/Complex-Specific1379). Karma gate: Reddit returns
    // "forbidden" on submit (even r/test) for low-standing accounts, so attempting just
    // accumulates failures. Skip posting until karma is built via comments (I5 Fase 0).
    const acct = await safeEval(page, () => ({
      user: document.querySelector('.user a')?.textContent?.trim() || 'unknown',
      karma: parseInt((document.querySelector('.userkarma, .karma')?.textContent || '0').replace(/[^0-9]/g, ''), 10) || 0,
    }));
    console.log(`[${TAG}] Logged in as: ${acct.user} (karma ${acct.karma})`);
    if (acct.karma < MIN_KARMA_TO_POST) {
      console.log(`[${TAG}] SKIP: karma ${acct.karma} < ${MIN_KARMA_TO_POST} — Reddit blocks posting from low-standing accounts. Build karma via comments first (I5 Fase 0). Queue left intact (not marked failed).`);
      return { posted: 0, skipped: batch.length, reason: 'karma-too-low' };
    }

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
      body: `Hey everyone,\n\nI've been building YTubViral for the past few months — it's a set of AI-powered tools for YouTube creators: SEO optimizer, keyword research, title/description generator, thumbnail ideas, retention analysis, content calendar, and more.\n\nThe core tools are free, but I'm offering the full Pro plan (normally $10/mo) free for 3 months to anyone willing to test it and give honest feedback.\n\nWhat I'm looking for:\n- You have a YouTube channel (any size)\n- You use it for at least a week\n- You tell me what works, what's broken, and what's missing\n\nNo strings attached. No credit card needed to sign up. If it sucks, tell me it sucks — that's the whole point.\n\nLink: https://ytubviral.com\n\nJust sign up and DM me your email here or comment below. I'll activate Pro on your account.\n\nThanks!`,
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
      body: `I'm Javier, I've been building YTubViral — basically a toolkit that helps with the stuff that takes forever: finding the right keywords, writing SEO-optimized titles and descriptions, analyzing what makes people click away from your videos, generating thumbnail concepts, etc.\n\nLooking for creators who'd be willing to test the Pro plan for free (3 months) and tell me what they think. Any channel size welcome.\n\nWhat's in it:\n- YouTube SEO Optimizer (titles, descriptions, tags)\n- Keyword Research with search volume\n- Content Idea Generator\n- Retention Analyzer\n- Thumbnail Concept Generator\n- Competitor Analysis\n- Upload Schedule Optimizer\n- And a few more tools\n\nSign up at https://ytubviral.com, drop your email in the comments, and I'll upgrade you to Pro.`,
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
      body: `Hola a todos,\n\nLlevo meses desarrollando YTubViral, un conjunto de herramientas con IA para creadores de YouTube: optimizador SEO, investigación de keywords, generador de títulos y descripciones, análisis de retención, ideas de contenido, calendario de subidas, y más.\n\nLas herramientas básicas son gratis, pero estoy ofreciendo el plan Pro completo (normalmente 9,99 EUR/mes) gratis durante 3 meses a quien quiera probarlo y darme feedback honesto.\n\nLo que busco:\n- Tienes un canal de YouTube (cualquier tamaño)\n- Lo usas al menos una semana\n- Me dices qué funciona, qué falla, y qué falta\n\nSin compromiso. Sin tarjeta de crédito. Si no te gusta, dímelo — para eso es el beta.\n\nLink: https://ytubviral.com\n\nRegístrate y comenta aquí con tu email o mándame DM. Yo activo Pro en tu cuenta.\n\nGracias!`,
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
