'use strict';

/**
 * Shared resilience utilities for YCML Puppeteer agents.
 * - safeGoto: navigation with automatic retry on timeout
 * - safeEval: page.evaluate that returns null on timeout instead of crashing
 * - alertSessionExpired: one-shot email alert per platform+account per process
 */

const { sendEmail } = require('./reports');

// Track which session alerts have been sent (per process lifetime)
const alertsSent = new Set();

/**
 * Navigate with automatic retry on timeout.
 * @param {import('puppeteer').Page} page
 * @param {string} url
 * @param {object} opts
 * @param {string} [opts.tag='browser'] — log prefix
 * @param {number} [opts.timeout=45000]
 * @param {string} [opts.waitUntil='domcontentloaded']
 * @param {number} [opts.retries=2]
 * @returns {Promise<boolean>} true if navigation succeeded
 */
async function safeGoto(page, url, opts = {}) {
  const tag = opts.tag || 'browser';
  const timeout = opts.timeout || 45000;
  const waitUntil = opts.waitUntil || 'domcontentloaded';
  const maxRetries = opts.retries || 2;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.goto(url, { waitUntil, timeout });
      return true;
    } catch (err) {
      const isTimeout = err.message.includes('timeout') || err.message.includes('Timeout');
      if (attempt < maxRetries && isTimeout) {
        console.log(`[${tag}] Navigation timeout (attempt ${attempt}/${maxRetries}), retrying in ${attempt * 3}s...`);
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }
      // Last attempt or non-timeout error: log and return false (don't throw)
      console.error(`[${tag}] Navigation failed after ${attempt} attempt(s): ${err.message}`);
      return false;
    }
  }
  return false;
}

/**
 * page.evaluate() that returns null on protocol/timeout errors instead of crashing.
 * Use for non-critical operations like clicking a like button.
 * @param {import('puppeteer').Page} page
 * @param {Function} fn
 * @param {...any} args
 * @returns {Promise<any|null>}
 */
async function safeEval(page, fn, ...args) {
  try {
    return await page.evaluate(fn, ...args);
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('timed out') || msg.includes('Execution context') || msg.includes('Target closed') || msg.includes('Session closed')) {
      return null;
    }
    throw err;
  }
}

/**
 * Send a one-shot email alert when a session expires.
 * Only sends once per platform+accountId per process lifetime.
 * @param {string} platform — 'twitter', 'reddit', etc.
 * @param {string|null} accountId — null for brand account
 * @param {string} instructions — recovery steps for the user
 */
async function alertSessionExpired(platform, accountId, instructions) {
  const key = `${platform}:${accountId || 'brand'}`;
  if (alertsSent.has(key)) return;
  alertsSent.add(key);

  const who = accountId ? `persona ${accountId}` : 'cuenta marca';
  const subject = `YCML ${platform}: sesion expirada (${who})`;
  const body = `La sesion de ${platform} para ${who} ha expirado.\n\n${instructions}\n\nAgente YTubViral`;

  await sendEmail(subject, body).catch(e => {
    console.error(`[resilience] Failed to send session alert for ${key}:`, e.message);
  });
  console.log(`[resilience] Session alert sent for ${key}`);
}

module.exports = { safeGoto, safeEval, alertSessionExpired };
