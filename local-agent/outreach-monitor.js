'use strict';

/**
 * Monitor outreach posts for new replies/comments.
 * Checks the X tweet for responses from non-persona accounts.
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
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? 'ytbeviral@gmail.com';

const TWITTER_TWEET = 'https://x.com/YTubViral/status/2056832037382660247';

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { knownComments: [], lastCheck: null }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function checkTwitterReplies(tag) {
  let page;
  try {
    page = await newPage();
  } catch (launchErr) {
    console.error(`[${tag}] Twitter browser launch failed: ${launchErr.message}`);
    // No profileDir — Doctor/Claude will infer from platform+account context
    const result = await diagnose(launchErr, { platform: 'twitter', account: 'brand', action: 'launch' });
    if (result.healed) {
      console.log(`[${tag}] Doctor healed Twitter launch: ${result.action} — retrying...`);
      try { page = await newPage(); } catch { return []; }
    } else {
      return [];
    }
  }

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
  } catch (err) {
    console.error(`[${tag}] Twitter check error: ${err.message}`);
    await diagnose(err, { platform: 'twitter', account: 'brand', action: 'check-replies' }).catch(() => {});
    return [];
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
