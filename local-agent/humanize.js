'use strict';

// ── Anti-detection utilities ──
// Makes bot behavior look more human by adding variance, pauses, and randomness.

// Vary a daily limit by ±40% — real humans don't do exactly 10 likes every day
function randomLimit(base) {
  const min = Math.max(1, Math.round(base * 0.6));
  const max = Math.round(base * 1.4);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Skip entire session ~15% of the time — humans have off days
function shouldSkipSession() {
  return Math.random() < 0.15;
}

// Skip an individual post ~25% of the time even if it matches criteria
// (humans don't engage with every post they see)
function shouldSkipPost() {
  return Math.random() < 0.25;
}

// Simulate reading a post (5–15 seconds)
function readingPause() {
  const ms = 5000 + Math.floor(Math.random() * 10000);
  return new Promise(r => setTimeout(r, ms));
}

// Pause between actions (3–8 seconds, longer than typical bot delays)
function actionPause() {
  const ms = 3000 + Math.floor(Math.random() * 5000);
  return new Promise(r => setTimeout(r, ms));
}

// Long pause between comment/reply actions (15–40 seconds)
// Typing a thoughtful reply takes time
function commentPause() {
  const ms = 15000 + Math.floor(Math.random() * 25000);
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
