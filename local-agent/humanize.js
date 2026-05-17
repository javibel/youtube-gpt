'use strict';

const config = require('./config');

// ── Anti-detection utilities ──
// Makes bot behavior look more human by adding variance, pauses, and randomness.
// All values configurable via dashboard (module: 'humanize')

function hCfg(key, def) { return config.get('humanize', key, def); }

// Vary a daily limit by ±variance% — real humans don't do exactly 10 likes every day
function randomLimit(base) {
  const variance = hCfg('dailyLimitVariance', 40) / 100;
  const min = Math.max(1, Math.round(base * (1 - variance)));
  const max = Math.round(base * (1 + variance));
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Skip entire session ~15% of the time — humans have off days
function shouldSkipSession() {
  return Math.random() < hCfg('skipSessionProbability', 0.15);
}

// Skip an individual post ~25% of the time even if it matches criteria
function shouldSkipPost() {
  return Math.random() < hCfg('skipPostProbability', 0.25);
}

// Simulate reading a post (5–15 seconds)
function readingPause() {
  const min = hCfg('readingPauseMin', 5) * 1000;
  const max = hCfg('readingPauseMax', 15) * 1000;
  const ms = min + Math.floor(Math.random() * (max - min));
  return new Promise(r => setTimeout(r, ms));
}

// Pause between actions (3–8 seconds)
function actionPause() {
  const min = hCfg('actionPauseMin', 3) * 1000;
  const max = hCfg('actionPauseMax', 8) * 1000;
  const ms = min + Math.floor(Math.random() * (max - min));
  return new Promise(r => setTimeout(r, ms));
}

// Long pause between comment/reply actions (15–40 seconds)
function commentPause() {
  const min = hCfg('commentPauseMin', 15) * 1000;
  const max = hCfg('commentPauseMax', 40) * 1000;
  const ms = min + Math.floor(Math.random() * (max - min));
  return new Promise(r => setTimeout(r, ms));
}

// Warmup: scroll the page slowly to simulate passive browsing before engaging
// Returns after 15–35 seconds of scrolling
async function warmupScroll(page, tag = '') {
  const scrolls = 3 + Math.floor(Math.random() * 4); // 3-6 scrolls
  if (tag) console.log(`[${tag}] Browsing feed for a bit...`);
  for (let i = 0; i < scrolls; i++) {
    const distance = 300 + Math.floor(Math.random() * 500);
    await page.evaluate((d) => window.scrollBy(0, d), distance);
    const pause = 3000 + Math.floor(Math.random() * 5000);
    await new Promise(r => setTimeout(r, pause));
  }
  // Scroll back to top sometimes (50% chance)
  if (Math.random() < 0.5) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
  }
}

// Day-of-week activity modifier: weekends are quieter (~70% activity)
function weekendFactor() {
  const day = new Date().getDay();
  return (day === 0 || day === 6) ? 0.7 : 1.0;
}

// Apply weekend factor to a limit
function adjustedLimit(base) {
  return Math.max(1, Math.round(randomLimit(base) * weekendFactor()));
}

module.exports = {
  randomLimit,
  adjustedLimit,
  shouldSkipSession,
  shouldSkipPost,
  readingPause,
  actionPause,
  commentPause,
  warmupScroll,
  weekendFactor,
};
