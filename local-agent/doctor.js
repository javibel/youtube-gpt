'use strict';

/**
 * Doctor — Auto-diagnosis and self-healing for YCML agents.
 *
 * General-purpose error analysis: receives any error + context, matches it
 * against a knowledge base of known patterns, attempts automated fixes,
 * and only escalates to the human when it can't self-heal.
 *
 * Usage:
 *   const { diagnose } = require('./doctor');
 *   try { ... } catch (err) {
 *     const result = await diagnose(err, { platform: 'reddit', account: 'persona-alex', action: 'login' });
 *     if (result.healed) { // retry }
 *   }
 */

const fs = require('fs');
const path = require('path');
const { sendEmail } = require('./reports');

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = () => path.join(LOG_DIR, `doctor-${new Date().toISOString().slice(0, 10)}.json`);

// Track alerts sent this process (avoid spam)
const alertsSent = new Set();

// ── Troubleshoot files by area ────────────────────────────────────────────
const TROUBLESHOOT = {
  browser: path.join(__dirname, 'troubleshoot-browser.md'),
  deploy: path.join(__dirname, 'troubleshoot-deploy.md'),
  images: path.join(__dirname, 'troubleshoot-images.md'),
  infra: path.join(__dirname, 'troubleshoot-infra.md'),
  general: path.join(__dirname, 'troubleshoot-general.md'),
};

// ── Knowledge Base ────────────────────────────────────────────────────────
// Each pattern: { id, match(err, ctx) → bool, diagnose() → string, fix(err, ctx) → Promise<bool>, severity, troubleshoot }
// Patterns are evaluated in order; first match wins.

const KNOWN_PATTERNS = [

  {
    id: 'corrupt-chrome-profile',
    troubleshoot: TROUBLESHOOT.browser,
    match: (err, ctx) =>
      err.message?.includes('Failed to launch the browser process') &&
      ctx.profileDir && fs.existsSync(path.resolve(__dirname, ctx.profileDir)),
    diagnosis: 'Chrome profile directory is corrupted — browser cannot start.',
    severity: 'high',
    fix: async (err, ctx) => {
      const absDir = path.resolve(__dirname, ctx.profileDir);
      // Step 1: Try cleaning stale lock files (most common cause)
      const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort'];
      let cleaned = false;
      for (const f of lockFiles) {
        const fp = path.join(absDir, f);
        if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); cleaned = true; } catch {} }
      }
      // Also clean Default/LOCK
      const defaultLock = path.join(absDir, 'Default', 'LOCK');
      if (fs.existsSync(defaultLock)) { try { fs.unlinkSync(defaultLock); cleaned = true; } catch {} }

      if (cleaned) {
        return { healed: true, action: 'Cleaned stale lock files from Chrome profile. Retry should work.' };
      }
      // Step 2: If no lock files found, profile is truly corrupt — rename it
      const backup = `${absDir}-corrupt-${new Date().toISOString().slice(0, 10)}`;
      if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
      fs.renameSync(absDir, backup);
      return { healed: true, action: `Renamed corrupted profile to ${path.basename(backup)}. Cookies will be re-seeded on next session.` };
    },
  },

  {
    id: 'singleton-lock',
    troubleshoot: TROUBLESHOOT.browser,
    match: (err, ctx) =>
      (err.message?.includes('Failed to launch') || err.message?.includes('already running')) &&
      ctx.profileDir &&
      fs.existsSync(path.join(path.resolve(__dirname, ctx.profileDir), 'SingletonLock')),
    diagnosis: 'Stale SingletonLock file — a previous Chrome instance did not shut down cleanly.',
    severity: 'medium',
    fix: async (err, ctx) => {
      const lockFile = path.join(path.resolve(__dirname, ctx.profileDir), 'SingletonLock');
      fs.unlinkSync(lockFile);
      return { healed: true, action: 'Removed stale SingletonLock file.' };
    },
  },

  {
    id: 'session-expired-cookies-available',
    troubleshoot: TROUBLESHOOT.browser,
    match: (err, ctx) =>
      ctx.action === 'login' && ctx.sessionInvalid === true && ctx.cookieFile &&
      fs.existsSync(path.join(__dirname, ctx.cookieFile)),
    diagnosis: 'Session expired but cookie file exists — can re-seed.',
    severity: 'medium',
    fix: async (err, ctx) => {
      // The actual re-seeding happens via ensureSession() on next browser use.
      // If the profile itself is the problem, corrupt-chrome-profile pattern handles it.
      // Here we just signal that a retry with cookie re-seeding should work.
      return { healed: true, action: 'Cookie file available for re-seeding. Retry will trigger ensureSession().' };
    },
  },

  {
    id: 'navigation-timeout',
    troubleshoot: TROUBLESHOOT.browser,
    match: (err) =>
      err.message?.includes('timeout') || err.message?.includes('Timeout'),
    diagnosis: 'Navigation or operation timed out — likely slow network or heavy page.',
    severity: 'low',
    fix: async () => {
      // Timeouts are transient — signal that a retry is appropriate
      return { healed: true, action: 'Transient timeout. Caller should retry with backoff.' };
    },
  },

  {
    id: 'target-closed',
    troubleshoot: TROUBLESHOOT.browser,
    match: (err) =>
      err.message?.includes('Target closed') || err.message?.includes('Session closed') ||
      err.message?.includes('Execution context was destroyed'),
    diagnosis: 'Browser tab or context was destroyed mid-operation — page crash or navigation race.',
    severity: 'medium',
    fix: async () => {
      return { healed: true, action: 'Page context lost. Caller should close page and open a new one.' };
    },
  },

  {
    id: 'net-error',
    match: (err) =>
      err.message?.includes('net::ERR_') || err.message?.includes('ECONNREFUSED') ||
      err.message?.includes('ENOTFOUND') || err.message?.includes('ETIMEDOUT'),
    diagnosis: 'Network connectivity issue — DNS failure, connection refused, or network timeout.',
    severity: 'medium',
    fix: async () => {
      return { healed: false, action: 'Network error — cannot self-heal. Will retry on next scheduled run.' };
    },
  },

  {
    id: 'permission-denied-file',
    match: (err) =>
      (err.code === 'EACCES' || err.code === 'EPERM') && err.path,
    diagnosis: `File permission error on ${undefined}`,
    severity: 'medium',
    fix: async (err) => {
      // Can't fix permissions automatically in a safe way
      return { healed: false, action: `Permission denied on ${err.path}. May need to stop other processes using the file.` };
    },
  },

  {
    id: 'rate-limited',
    match: (err, ctx) =>
      err.message?.includes('429') || err.message?.includes('rate limit') ||
      err.message?.toLowerCase()?.includes('too many requests'),
    diagnosis: 'Rate limited by the platform.',
    severity: 'low',
    fix: async () => {
      return { healed: false, action: 'Rate limited. Will resume on next scheduled run. No action needed.' };
    },
  },

  {
    id: 'account-suspended',
    match: (err, ctx) =>
      err.message?.includes('suspended') || err.message?.includes('banned') ||
      err.message?.includes('restricted') || err.message?.includes('locked'),
    diagnosis: 'Account may be suspended or restricted by the platform.',
    severity: 'critical',
    fix: async () => {
      return { healed: false, action: 'Account possibly suspended. Requires manual investigation. STOP all automation for this account.' };
    },
  },
];

// ── Core ──────────────────────────────────────────────────────────────────

/**
 * Diagnose an error and attempt automatic recovery.
 *
 * @param {Error} err — the error that occurred
 * @param {object} ctx — context about what was happening
 * @param {string} [ctx.platform] — 'twitter', 'reddit', 'linkedin', etc.
 * @param {string} [ctx.account] — account ID or 'brand'
 * @param {string} [ctx.action] — what was being attempted: 'login', 'navigate', 'comment', etc.
 * @param {string} [ctx.profileDir] — Chrome profile directory (relative to __dirname)
 * @param {string} [ctx.cookieFile] — cookie JSON file path
 * @param {boolean} [ctx.sessionInvalid] — whether session check failed
 * @returns {Promise<{healed: boolean, diagnosis: string, action: string, patternId: string|null}>}
 */
async function diagnose(err, ctx = {}) {
  const tag = `[doctor:${ctx.platform || 'unknown'}${ctx.account ? ':' + ctx.account : ''}]`;

  // Find matching pattern
  for (const pattern of KNOWN_PATTERNS) {
    try {
      if (pattern.match(err, ctx)) {
        console.log(`${tag} Diagnosed: ${pattern.id} — ${pattern.diagnosis}`);

        let result;
        try {
          result = await pattern.fix(err, ctx);
        } catch (fixErr) {
          console.error(`${tag} Fix for ${pattern.id} threw: ${fixErr.message}`);
          result = { healed: false, action: `Fix attempted but failed: ${fixErr.message}` };
        }

        const entry = {
          timestamp: new Date().toISOString(),
          patternId: pattern.id,
          severity: pattern.severity,
          diagnosis: pattern.diagnosis,
          healed: result.healed,
          action: result.action,
          troubleshootFile: pattern.troubleshoot || TROUBLESHOOT.general,
          error: err.message,
          context: { platform: ctx.platform, account: ctx.account, action: ctx.action },
        };

        logEntry(entry);
        console.log(`${tag} ${result.healed ? 'HEALED' : 'NOT HEALED'}: ${result.action}`);

        // Alert human only for unhealed critical/high issues
        if (!result.healed && (pattern.severity === 'critical' || pattern.severity === 'high')) {
          await alertHuman(entry, tag);
        }

        return { healed: result.healed, diagnosis: pattern.diagnosis, action: result.action, patternId: pattern.id };
      }
    } catch (matchErr) {
      // Pattern match itself failed — skip silently
    }
  }

  // No pattern matched — unknown error
  const entry = {
    timestamp: new Date().toISOString(),
    patternId: null,
    severity: 'unknown',
    diagnosis: 'Unrecognized error — no matching pattern in knowledge base.',
    healed: false,
    action: 'No automatic fix available.',
    error: err.message,
    context: { platform: ctx.platform, account: ctx.account, action: ctx.action },
  };

  logEntry(entry);
  console.warn(`${tag} UNKNOWN ERROR: ${err.message} — no matching pattern`);

  return { healed: false, diagnosis: entry.diagnosis, action: entry.action, patternId: null };
}

// ── Logging ───────────────────────────────────────────────────────────────

function logEntry(entry) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = LOG_FILE();
    let entries = [];
    if (fs.existsSync(file)) {
      try { entries = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { entries = []; }
    }
    entries.push(entry);
    fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf8');
  } catch (e) {
    console.error(`[doctor] Failed to write log: ${e.message}`);
  }
}

async function alertHuman(entry, tag) {
  const alertKey = `${entry.patternId}:${entry.context.platform}:${entry.context.account}`;
  if (alertsSent.has(alertKey)) return;
  alertsSent.add(alertKey);

  const subject = `YCML Doctor: ${entry.severity.toUpperCase()} — ${entry.patternId} (${entry.context.platform || 'unknown'})`;
  const body = [
    `Diagnosis: ${entry.diagnosis}`,
    `Error: ${entry.error}`,
    `Platform: ${entry.context.platform || 'N/A'}`,
    `Account: ${entry.context.account || 'brand'}`,
    `Action attempted: ${entry.context.action || 'N/A'}`,
    `Auto-fix result: ${entry.action}`,
    ``,
    `This issue could not be resolved automatically. Manual intervention required.`,
    ``,
    `— YCML Doctor`,
  ].join('\n');

  await sendEmail(subject, body).catch(e => {
    console.error(`${tag} Failed to send alert email: ${e.message}`);
  });
  console.log(`${tag} Alert email sent to human`);
}

// ── Summary for Manager ───────────────────────────────────────────────────

function getTodaySummary() {
  const file = LOG_FILE();
  if (!fs.existsSync(file)) return { total: 0, healed: 0, unhealed: 0, patterns: {} };

  let entries;
  try { entries = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { total: 0, healed: 0, unhealed: 0, patterns: {} }; }

  const patterns = {};
  let healed = 0;
  let unhealed = 0;

  for (const e of entries) {
    const pid = e.patternId || 'unknown';
    if (!patterns[pid]) patterns[pid] = { count: 0, healed: 0, severity: e.severity };
    patterns[pid].count++;
    if (e.healed) { healed++; patterns[pid].healed++; }
    else unhealed++;
  }

  return { total: entries.length, healed, unhealed, patterns };
}

module.exports = { diagnose, getTodaySummary };
