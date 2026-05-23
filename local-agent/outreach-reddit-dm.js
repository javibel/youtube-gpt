'use strict';

/**
 * Outreach Reddit DM — Discovers creators posting their YouTube videos
 * in relevant subreddits, then sends them a personalized DM with a free
 * SEO analysis offer via old.reddit.com/message/compose.
 *
 * Uses brand-reddit profile (Javier / YTubViral official account).
 * Max 3 DMs per run to stay under Reddit rate limits and avoid shadowban.
 *
 * Usage:
 *   node outreach-reddit-dm.js [--dry-run]
 *   Cron: 2x/day at 9:15, 17:15 Madrid
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { newPageForProfile, closeBrowserForProfile } = require('./browser');
const { safeGoto, safeEval } = require('./resilience');

const TRACKER_PATH = path.join(__dirname, 'outreach-tracker.json');
const DM_LOG_PATH = path.join(__dirname, 'reports/outreach-reddit-dm-log.json');
const DRY_RUN = process.argv.includes('--dry-run');
const PROFILE = 'chrome-profiles/brand-reddit';
const TAG = 'outreach-reddit-dm';

const MAX_DMS_PER_RUN = 5;
const MIN_DELAY_BETWEEN_DMS = 60000; // 60s between DMs

// Subreddits where creators share their own YouTube videos
const TARGET_SUBREDDITS = [
  'NewTubers',
  'SmallYTChannel',
  'GetMoreViewsYT',
  'YouTubePromotion',
  'PromoteYourMusic',      // music niche
  'PartneredYouTube',
  'youtubers',
  'SmallYoutubers',
  'Sub4Sub',               // desperate creators = high conversion potential
  'YouTubeGaming',
  'letsplay',              // gaming youtubers
  'contentcreator',
  'CreatorsAdvice',
  'promoteyoutube',
  'IndieMusicFeedback',    // music creators
  'YouTube_startups',
  'GrowYourYouTube',
  'YouTubeCreators',
];

// Message templates — personalized with creator's username and post context
const MESSAGES = {
  en: {
    subject: 'Free YouTube SEO analysis for your channel',
    body: (username, postTitle) =>
      `Hey ${username},\n\n` +
      `Saw your post "${postTitle.slice(0, 80)}" — looks like you're putting in solid work on your channel.\n\n` +
      `I built a free YouTube SEO tool (ytubviral.com) that gives you a 0-100 score for any video with specific tips on what to fix — title, tags, description, thumbnail, the works.\n\n` +
      `Would love to get your feedback on it. No signup needed to try the basic analysis.\n\n` +
      `If you want, paste any of your video URLs here and I'll run a detailed analysis for you personally — happy to help.\n\n` +
      `Cheers,\nJavier`,
  },
  es: {
    subject: 'Análisis SEO gratis para tu canal de YouTube',
    body: (username, postTitle) =>
      `Hola ${username},\n\n` +
      `Vi tu post "${postTitle.slice(0, 80)}" — se nota que le estás metiendo trabajo a tu canal.\n\n` +
      `Creé una herramienta gratuita de SEO para YouTube (ytubviral.com) que da una puntuación de 0 a 100 para cualquier vídeo con consejos específicos de qué mejorar — título, tags, descripción, thumbnail, todo.\n\n` +
      `Me encantaría saber tu opinión. No hace falta registro para probar el análisis básico.\n\n` +
      `Si quieres, pégame cualquier URL de tus vídeos y te hago un análisis detallado personalmente.\n\n` +
      `Un saludo,\nJavier`,
  },
};

function delay(min = 2000, max = 4000) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

function loadDmLog() {
  try {
    return JSON.parse(fs.readFileSync(DM_LOG_PATH, 'utf-8'));
  } catch {
    return { dmsSent: [], lastRun: null };
  }
}

function saveDmLog(log) {
  const dir = path.dirname(DM_LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DM_LOG_PATH, JSON.stringify(log, null, 2));
}

// Detect post language from title/flair
function detectLang(title, flair) {
  const text = `${title} ${flair}`.toLowerCase();
  if (/español|spanish|canal|vídeo|suscri/i.test(text)) return 'es';
  return 'en';
}

async function scrapeSubredditPosts(page, subreddit) {
  const url = `https://old.reddit.com/r/${subreddit}/new/`;
  const ok = await safeGoto(page, url, { tag: TAG, timeout: 45000 });
  if (!ok) {
    console.log(`[${TAG}] Failed to load r/${subreddit}`);
    return [];
  }
  await delay(2000, 3000);

  // Extract posts with authors
  const posts = await safeEval(page, () => {
    const items = [];
    const entries = document.querySelectorAll('#siteTable .thing.link');
    for (const entry of entries) {
      const titleEl = entry.querySelector('a.title');
      const authorEl = entry.querySelector('.author');
      const flairEl = entry.querySelector('.linkflairlabel');
      const timeEl = entry.querySelector('time');

      if (!titleEl || !authorEl) continue;
      const author = authorEl.textContent?.trim();
      if (!author || author === '[deleted]') continue;

      items.push({
        title: titleEl.textContent?.trim() || '',
        url: titleEl.href || '',
        author,
        flair: flairEl?.textContent?.trim() || '',
        time: timeEl?.getAttribute('datetime') || '',
      });
    }
    return items;
  });

  return posts || [];
}

async function sendRedditDm(page, toUser, subject, body) {
  const composeUrl = `https://old.reddit.com/message/compose/?to=${encodeURIComponent(toUser)}`;
  const ok = await safeGoto(page, composeUrl, { tag: TAG, timeout: 45000 });
  if (!ok) throw new Error(`Failed to load compose page for ${toUser}`);
  await delay(2000, 3000);

  // Check we're logged in
  const loggedIn = await safeEval(page, () => {
    const userSpan = document.querySelector('.user a');
    return !!userSpan && !userSpan.textContent?.includes('login');
  });
  if (!loggedIn) throw new Error('Not logged in to Reddit');

  // Fill subject
  const subjectInput = await page.$('input[name="subject"]');
  if (!subjectInput) throw new Error('Subject input not found');
  await subjectInput.click();
  await delay(300, 500);
  await page.keyboard.type(subject, { delay: 30 });
  await delay(500, 800);

  // Fill message body
  const bodyInput = await page.$('textarea[name="message"]');
  if (!bodyInput) throw new Error('Message textarea not found');
  await bodyInput.click();
  await delay(300, 500);
  await page.keyboard.type(body, { delay: 20 });
  await delay(1000, 2000);

  // Submit
  const submitBtn = await page.$('button[type="submit"]');
  if (!submitBtn) throw new Error('Submit button not found');
  await submitBtn.click();
  await delay(3000, 5000);

  // Verify — check for error messages
  const hasError = await safeEval(page, () => {
    const errorList = document.querySelector('.error');
    if (errorList && errorList.textContent.trim()) return errorList.textContent.trim();
    return null;
  });

  if (hasError) throw new Error(`Reddit error: ${hasError}`);

  console.log(`[${TAG}] ✉ DM sent to u/${toUser}`);
}

async function runRedditDm() {
  console.log(`[${TAG}] ${DRY_RUN ? 'DRY RUN — ' : ''}Starting Reddit DM outreach...`);

  const dmLog = loadDmLog();
  const sentUsers = new Set(dmLog.dmsSent.map(d => d.user.toLowerCase()));

  // Also check outreach-tracker to avoid DMing people we already emailed
  const tracker = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf-8'));
  const trackerNames = new Set(tracker.contacts.map(c => c.name.toLowerCase()));

  const page = await newPageForProfile(PROFILE);
  let dmsSentThisRun = 0;

  try {
    // Verify session
    const ok = await safeGoto(page, 'https://old.reddit.com/', { tag: TAG, timeout: 60000 });
    if (!ok) throw new Error('Failed to load Reddit');
    await delay(2000, 3000);

    const loggedIn = await safeEval(page, () => {
      const userSpan = document.querySelector('.user a');
      return !!userSpan && !userSpan.textContent?.includes('login');
    });
    if (!loggedIn) throw new Error('brand-reddit session expired');

    const username = await safeEval(page, () => {
      return document.querySelector('.user a')?.textContent?.trim() || 'unknown';
    });
    console.log(`[${TAG}] Logged in as: ${username}`);

    // Shuffle subreddits so we don't always hit the same ones
    const shuffled = [...TARGET_SUBREDDITS].sort(() => Math.random() - 0.5);

    for (const sub of shuffled) {
      if (dmsSentThisRun >= MAX_DMS_PER_RUN) break;

      console.log(`[${TAG}] Scanning r/${sub}...`);
      const posts = await scrapeSubredditPosts(page, sub);

      for (const post of posts) {
        if (dmsSentThisRun >= MAX_DMS_PER_RUN) break;

        // Skip if we already DM'd this user or they're in tracker
        if (sentUsers.has(post.author.toLowerCase())) continue;
        if (trackerNames.has(post.author.toLowerCase())) continue;
        // Skip if the author is one of our accounts
        if (/ytubviral|javier|alex.*sastre|ferran/i.test(post.author)) continue;

        // Only target posts that look like self-promotion (sharing own videos)
        const isVideoPost = /youtube\.com|youtu\.be|my (video|channel|first)|check out my|i made|just uploaded|new video|mi (video|canal)|acabo de subir/i.test(post.title);
        if (!isVideoPost) continue;

        const lang = detectLang(post.title, post.flair);
        const template = MESSAGES[lang];
        const subject = template.subject;
        const body = template.body(post.author, post.title);

        console.log(`[${TAG}] Target: u/${post.author} — "${post.title.slice(0, 60)}..." [${lang}]`);

        if (DRY_RUN) {
          console.log(`[${TAG}] [DRY] Would DM u/${post.author}`);
          dmsSentThisRun++;
          continue;
        }

        try {
          await sendRedditDm(page, post.author, subject, body);
          dmsSentThisRun++;
          sentUsers.add(post.author.toLowerCase());

          // Log the DM
          dmLog.dmsSent.push({
            user: post.author,
            subreddit: sub,
            postTitle: post.title.slice(0, 100),
            lang,
            date: new Date().toISOString(),
          });
          saveDmLog(dmLog);

          // Add to outreach tracker as reddit-dm contact
          const nextId = Math.max(...tracker.contacts.map(c => c.id), 0) + 1;
          tracker.contacts.push({
            id: nextId,
            name: post.author,
            lang,
            niche: 'YouTube Creator',
            source: `reddit.com/u/${post.author}`,
            email: null,
            status: 'reddit-dm-sent',
            dateSent: new Date().toISOString().split('T')[0],
            dateFollowUp: null,
            dateReplied: null,
            dateRegistered: null,
            dateActivated: null,
            notes: `Reddit DM via r/${sub}. Post: "${post.title.slice(0, 60)}"`,
            latestVideo: null,
            seoScore: null,
            seoTips: [],
          });
          fs.writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
          trackerNames.add(post.author.toLowerCase());

          // Wait between DMs to avoid rate limiting
          if (dmsSentThisRun < MAX_DMS_PER_RUN) {
            console.log(`[${TAG}] Waiting ${MIN_DELAY_BETWEEN_DMS / 1000}s before next DM...`);
            await new Promise(r => setTimeout(r, MIN_DELAY_BETWEEN_DMS));
          }
        } catch (err) {
          console.error(`[${TAG}] Failed to DM u/${post.author}: ${err.message}`);
          // Don't retry, move to next
        }
      }
    }
  } finally {
    await page.close().catch(() => {});
    await closeBrowserForProfile(PROFILE);
  }

  dmLog.lastRun = new Date().toISOString();
  saveDmLog(dmLog);

  console.log(`[${TAG}] Done. ${dmsSentThisRun} DMs sent this run.`);
  return { sent: dmsSentThisRun };
}

if (require.main === module) {
  runRedditDm().catch(err => {
    console.error(`[${TAG}] Fatal:`, err);
    process.exit(1);
  });
}

module.exports = { runRedditDm };
