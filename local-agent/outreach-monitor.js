'use strict';

/**
 * Monitor outreach posts for new replies/comments.
 * Checks Reddit posts and X tweet for responses from non-persona accounts.
 * Sends email alert when new replies are detected.
 *
 * Usage: node outreach-monitor.js
 * Recommended: run via PM2 cron or add to daily agent cycle
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { newPage, newPageForProfile, ensureSession, closeBrowserForProfile, closeBrowser } = require('./browser');
const { safeGoto, safeEval } = require('./resilience');
const { sendViaResend } = require('./resend');
const { diagnose } = require('./doctor');

const KNOWN_PERSONAS = ['Javi_Mart', 'AdNearby3690', 'Complex-Specific1379', 'YTubViral'];
const STATE_FILE = path.join(__dirname, 'outreach-monitor-state.json');
const OWNER_EMAIL = 'hello@ytubviral.com';

const REDDIT_POSTS = [
  { name: 'r/alphaandbetausers', url: 'https://www.reddit.com/r/alphaandbetausers/comments/1thw159/' },
  { name: 'r/IMadeThis', url: 'https://www.reddit.com/r/IMadeThis/comments/1thwcbf/' },
  { name: 'r/roastmystartup', url: 'https://www.reddit.com/r/roastmystartup/comments/1thwd9g/' },
  { name: 'r/indiebiz', url: 'https://www.reddit.com/r/indiebiz/comments/1thwp4e/' },
  { name: 'profile post', url: 'https://www.reddit.com/user/Complex-Specific1379/comments/1thvige/' },
];

const TWITTER_TWEET = 'https://x.com/YTubViral/status/2056832037382660247';

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { knownComments: [], lastCheck: null }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function checkRedditPost(page, post, tag) {
  const oldUrl = post.url.replace('www.reddit.com', 'old.reddit.com');
  const ok = await safeGoto(page, oldUrl, { tag, timeout: 45000, profileDir: 'chrome-profiles/persona-alex' });
  if (!ok) return [];

  await new Promise(r => setTimeout(r, 3000));

  const comments = await safeEval(page, (knownPersonas) => {
    const results = [];
    const commentEls = document.querySelectorAll('.comment');
    for (const c of commentEls) {
      const author = c.querySelector('.author')?.textContent?.trim() || '[deleted]';
      if (knownPersonas.includes(author)) continue;
      const text = c.querySelector('.md')?.textContent?.trim() || '';
      const time = c.querySelector('time')?.getAttribute('datetime') || '';
      if (text) {
        results.push({ author, text: text.slice(0, 300), time, platform: 'reddit' });
      }
    }
    return results;
  }, KNOWN_PERSONAS);

  return (comments || []).map(c => ({ ...c, source: post.name, url: post.url }));
}

async function checkTwitterReplies(tag) {
  const page = await newPage();
  try {
    await ensureSession(page, { domain: 'x.com', sessionCookieName: 'auth_token', cookieFile: 'twitter-cookies.json' });
    const ok = await safeGoto(page, TWITTER_TWEET, { tag, timeout: 60000 });
    if (!ok) return [];
    await new Promise(r => setTimeout(r, 4000));

    // Scroll to load replies
    await safeEval(page, () => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, 2000));

    const replies = await safeEval(page, (knownPersonas) => {
      const results = [];
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      // Skip first article (the original tweet)
      for (let i = 1; i < articles.length; i++) {
        const a = articles[i];
        const authorEl = a.querySelector('div[data-testid="User-Name"] a span');
        const author = authorEl?.innerText?.trim() || '';
        if (knownPersonas.some(p => author.includes(p))) continue;
        const text = a.querySelector('div[data-testid="tweetText"]')?.innerText?.trim() || '';
        const time = a.querySelector('time')?.getAttribute('datetime') || '';
        if (text) {
          results.push({ author, text: text.slice(0, 300), time, platform: 'twitter' });
        }
      }
      return results;
    }, KNOWN_PERSONAS);

    return (replies || []).map(r => ({ ...r, source: 'X tweet', url: TWITTER_TWEET }));
  } finally {
    await page.close().catch(() => {});
    await closeBrowser().catch(() => {});
  }
}

/** Quick health check — returns false if the page/browser connection is dead */
async function isPageHealthy(page) {
  try {
    if (page.isClosed()) return false;
    await page.evaluate(() => true);
    return true;
  } catch { return false; }
}

async function main() {
  const tag = 'outreach-monitor';
  const state = loadState();
  const knownKeys = new Set(state.knownComments || []);
  const newReplies = [];

  console.log(`[${tag}] Checking ${REDDIT_POSTS.length} Reddit posts + 1 X tweet...`);

  const PROFILE = 'chrome-profiles/persona-alex';
  const doctorCtx = { platform: 'reddit', account: 'persona-alex', profileDir: PROFILE };

  // Check Reddit (reuse one browser session)
  let page;
  try {
    page = await newPageForProfile(PROFILE);
  } catch (launchErr) {
    console.error(`[${tag}] Browser launch failed: ${launchErr.message}`);
    // Let Doctor diagnose + attempt healing (heuristic patterns → Claude AI fallback)
    const result = await diagnose(launchErr, { ...doctorCtx, action: 'launch' });
    if (result.healed) {
      console.log(`[${tag}] Doctor healed: ${result.action} — retrying launch...`);
      try { page = await newPageForProfile(PROFILE); } catch { page = null; }
    } else {
      page = null;
    }
  }

  if (page) {
    try {
      // Verify Reddit session
      const ok = await safeGoto(page, 'https://old.reddit.com/', { tag, timeout: 60000, profileDir: PROFILE });
      if (!ok) { console.log(`[${tag}] Reddit session failed`); }
      else {
        await new Promise(r => setTimeout(r, 2000));
        for (const post of REDDIT_POSTS) {
          // Health check before each post — detect dead page early
          if (!await isPageHealthy(page)) {
            console.log(`[${tag}] Page died — consulting Doctor...`);
            const deadPageErr = new Error('Page detached — browser frame died mid-session');
            const healResult = await diagnose(deadPageErr, { ...doctorCtx, action: 'navigate' });
            console.log(`[${tag}] Doctor: ${healResult.healed ? 'HEALED' : 'NOT HEALED'} — ${healResult.action}`);

            // Close stale references and attempt relaunch
            await page.close().catch(() => {});
            await closeBrowserForProfile(PROFILE);
            try {
              page = await newPageForProfile(PROFILE);
              const reOk = await safeGoto(page, 'https://old.reddit.com/', { tag, timeout: 60000, profileDir: PROFILE });
              if (!reOk) {
                console.log(`[${tag}] Relaunch failed — skipping remaining Reddit posts`);
                break;
              }
              await new Promise(r => setTimeout(r, 2000));
            } catch (relaunchErr) {
              console.error(`[${tag}] Browser relaunch failed: ${relaunchErr.message}`);
              await diagnose(relaunchErr, { ...doctorCtx, action: 'launch' });
              break;
            }
          }

          try {
            console.log(`[${tag}] Checking ${post.name}...`);
            const comments = await checkRedditPost(page, post, tag);
            for (const c of comments) {
              const key = `${c.platform}:${c.author}:${c.text.slice(0, 50)}`;
              if (!knownKeys.has(key)) {
                newReplies.push(c);
                knownKeys.add(key);
              }
            }
          } catch (err) {
            const errMsg = err.message || String(err);
            console.error(`[${tag}] Failed checking ${post.name}: ${errMsg}`);
            // Feed ALL errors into Doctor (heuristic patterns → Claude AI fallback)
            await diagnose(err, { ...doctorCtx, action: 'check-post' }).catch(() => {});
          }
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    } finally {
      await page.close().catch(() => {});
      await closeBrowserForProfile(PROFILE);
    }
  }

  // Check Twitter
  console.log(`[${tag}] Checking X tweet...`);
  try {
    const twitterReplies = await checkTwitterReplies(tag);
    for (const r of twitterReplies) {
      const key = `${r.platform}:${r.author}:${r.text.slice(0, 50)}`;
      if (!knownKeys.has(key)) {
        newReplies.push(r);
        knownKeys.add(key);
      }
    }
  } catch (err) {
    console.error(`[${tag}] Twitter check failed:`, err.message);
    await diagnose(err, { platform: 'twitter', account: 'brand', action: 'check-replies' }).catch(() => {});
  }

  // Save state
  state.knownComments = [...knownKeys];
  state.lastCheck = new Date().toISOString();
  saveState(state);

  // Report
  if (newReplies.length === 0) {
    console.log(`[${tag}] No new replies found.`);
    return;
  }

  console.log(`[${tag}] 🔔 ${newReplies.length} NEW REPLIES found!\n`);

  let emailBody = `Outreach Monitor — ${newReplies.length} new replies detected\n\n`;

  for (const r of newReplies) {
    console.log(`  [${r.source}] ${r.author}: "${r.text.slice(0, 100)}..."`);
    emailBody += `--- ${r.source} (${r.platform}) ---\n`;
    emailBody += `Author: ${r.author}\n`;
    emailBody += `Text: ${r.text}\n`;
    emailBody += `URL: ${r.url}\n\n`;
  }

  // Send email notification
  try {
    await sendViaResend({
      to: OWNER_EMAIL,
      subject: `🔔 Outreach: ${newReplies.length} new replies to your posts`,
      body: emailBody,
      from: 'agent',
    });
    console.log(`[${tag}] Email notification sent to ${OWNER_EMAIL}`);
  } catch (err) {
    console.error(`[${tag}] Email failed:`, err.message);
  }
}

main().catch(err => {
  console.error('[outreach-monitor] Fatal:', err.message);
  process.exit(1);
});
