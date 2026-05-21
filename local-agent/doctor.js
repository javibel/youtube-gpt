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
const { guardedCall } = require('./api-guard');

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = () => path.join(LOG_DIR, `doctor-${new Date().toISOString().slice(0, 10)}.json`);
const LEARNED_PATTERNS_FILE = path.join(__dirname, 'reports', 'learned-patterns.json');

// Track alerts sent this process (avoid spam)
const alertsSent = new Set();

// ── Claude call limits (anti-loop protection) ────────────────────────────
const CLAUDE_MAX_CALLS_PER_HOUR = 3;     // Max 3 Claude calls per hour
const CLAUDE_MAX_CALLS_PER_DAY = 10;     // Max 10 Claude calls per day
const claudeCallLog = [];                 // timestamps of Claude calls

function canCallClaude() {
  const now = Date.now();
  // Clean entries older than 24h
  while (claudeCallLog.length && claudeCallLog[0] < now - 86400000) claudeCallLog.shift();
  const lastHour = claudeCallLog.filter(t => t > now - 3600000).length;
  const lastDay = claudeCallLog.length;
  if (lastHour >= CLAUDE_MAX_CALLS_PER_HOUR) return { ok: false, reason: `Hourly limit (${CLAUDE_MAX_CALLS_PER_HOUR}/h) reached` };
  if (lastDay >= CLAUDE_MAX_CALLS_PER_DAY) return { ok: false, reason: `Daily limit (${CLAUDE_MAX_CALLS_PER_DAY}/d) reached` };
  return { ok: true };
}

function recordClaudeCall() { claudeCallLog.push(Date.now()); }

// ── Learned Patterns (auto-learned from Claude successes) ────────────────
// Flow: KNOWN_PATTERNS (0 tokens) → LEARNED_PATTERNS (0 tokens) → Claude (tokens)
// When Claude heals a new error, save it as a candidate. Meta-optimizer promotes stable patterns.

function computeErrorSignature(err, ctx) {
  let msg = (err.message || String(err))
    .replace(/https?:\/\/[^\s)]+/g, '<URL>')           // URLs
    .replace(/[A-Z]:\\[^\s)]+/g, '<PATH>')              // Windows paths
    .replace(/\/[^\s)]+\.[a-z]{2,5}/g, '<PATH>')       // Unix paths with extensions
    .replace(/:\d{2,5}/g, ':<PORT>')                    // Ports
    .replace(/\b\d{10,}\b/g, '<ID>')                    // Long numeric IDs
    .replace(/\b[0-9a-f]{8,}\b/gi, '<HEX>')            // Hex hashes
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}[^\s]*/g, '<TIMESTAMP>')  // ISO timestamps
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return `${msg}|${ctx.platform || ''}|${ctx.action || ''}`;
}

function loadLearnedPatterns() {
  try {
    if (!fs.existsSync(LEARNED_PATTERNS_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(LEARNED_PATTERNS_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function saveLearnedPatterns(patterns) {
  try {
    const dir = path.dirname(LEARNED_PATTERNS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LEARNED_PATTERNS_FILE, JSON.stringify(patterns, null, 2), 'utf8');
  } catch (e) {
    console.error(`[doctor] Failed to save learned patterns: ${e.message}`);
  }
}

function saveLearnedPattern(signature, action, details) {
  const patterns = loadLearnedPatterns();
  const existing = patterns.find(p => p.signature === signature);
  if (existing) {
    existing.healCount++;
    existing.lastUsed = new Date().toISOString();
    if (existing.status === 'failed') existing.status = 'candidate'; // Claude healed again, re-candidate
  } else {
    patterns.push({
      signature,
      action,
      details: details || '',
      healCount: 1,
      failCount: 0,
      consecutiveFailures: 0,
      status: 'candidate',
      firstSeen: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    });
  }
  saveLearnedPatterns(patterns);
  console.log(`[doctor] Learned pattern saved: ${signature.slice(0, 80)}... → ${action}`);
}

function findLearnedPattern(signature) {
  const patterns = loadLearnedPatterns();
  return patterns.find(p => p.signature === signature && (p.status === 'candidate' || p.status === 'stable'));
}

function updateLearnedPatternResult(signature, healed) {
  const patterns = loadLearnedPatterns();
  const p = patterns.find(pp => pp.signature === signature);
  if (!p) return;
  p.lastUsed = new Date().toISOString();
  if (healed) {
    p.healCount++;
    p.consecutiveFailures = 0;
  } else {
    p.failCount++;
    p.consecutiveFailures = (p.consecutiveFailures || 0) + 1;
    if (p.consecutiveFailures >= 3) {
      p.status = 'failed';
      console.log(`[doctor] Learned pattern failed 3x consecutively, marked as failed: ${signature.slice(0, 80)}...`);
    }
  }
  saveLearnedPatterns(patterns);
}

// ── Troubleshoot files by area ────────────────────────────────────────────
const TROUBLESHOOT = {
  browser: path.join(__dirname, 'troubleshoot-browser.md'),
  deploy: path.join(__dirname, 'troubleshoot-deploy.md'),
  images: path.join(__dirname, 'troubleshoot-images.md'),
  infra: path.join(__dirname, 'troubleshoot-infra.md'),
  general: path.join(__dirname, 'troubleshoot-general.md'),
};

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Kill orphaned Chrome processes tied to a specific profile directory.
 * Reuses killZombieChromeForProfile from browser.js (PowerShell-based, robust).
 */
async function killOrphanedChrome(absDir) {
  try {
    const { killZombieChromeForProfile } = require('./browser');
    await killZombieChromeForProfile(absDir);
    return true;
  } catch { return false; }
}

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
      const actions = [];

      // Step 1: Kill orphaned Chrome processes holding locks on this profile
      const killed = await killOrphanedChrome(absDir);
      if (killed) actions.push('Killed orphaned Chrome processes');

      // Step 2: Clean ALL lock files (including `lockfile` that Puppeteer creates)
      const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort', 'lockfile'];
      let cleaned = false;
      for (const f of lockFiles) {
        const fp = path.join(absDir, f);
        if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); cleaned = true; } catch {} }
      }
      // Also clean Default/LOCK
      const defaultLock = path.join(absDir, 'Default', 'LOCK');
      if (fs.existsSync(defaultLock)) { try { fs.unlinkSync(defaultLock); cleaned = true; } catch {} }

      if (cleaned || killed) {
        if (cleaned) actions.push('Cleaned stale lock files');
        return { healed: true, action: actions.join('. ') + '. Retry should work.' };
      }
      // Step 3: No locks found and nothing killed — profile may be truly corrupt.
      // Try rename, but if it fails (EPERM = something still holds it), still report
      // healed=true since the locks are already clean. The next launch attempt is the real test.
      try {
        const backup = `${absDir}-corrupt-${new Date().toISOString().slice(0, 10)}`;
        if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
        fs.renameSync(absDir, backup);
        return { healed: true, action: `Renamed corrupted profile to ${path.basename(backup)}. Cookies will be re-seeded on next session.` };
      } catch (renameErr) {
        // Rename failed (EPERM) but locks are clean — let browser.js retry the launch
        return { healed: true, action: `Profile rename failed (${renameErr.code || renameErr.message}) but locks are clean. Browser will retry launch.` };
      }
    },
  },

  {
    id: 'singleton-lock',
    troubleshoot: TROUBLESHOOT.browser,
    match: (err, ctx) =>
      (err.message?.includes('Failed to launch') || err.message?.includes('already running')) &&
      ctx.profileDir &&
      (fs.existsSync(path.join(path.resolve(__dirname, ctx.profileDir), 'SingletonLock')) ||
       fs.existsSync(path.join(path.resolve(__dirname, ctx.profileDir), 'lockfile'))),
    diagnosis: 'Stale lock file — a previous Chrome instance did not shut down cleanly.',
    severity: 'medium',
    fix: async (err, ctx) => {
      const absDir = path.resolve(__dirname, ctx.profileDir);
      const actions = [];
      // Kill orphaned Chrome first
      const killed = await killOrphanedChrome(absDir);
      if (killed) actions.push('Killed orphaned Chrome processes');
      // Remove all lock files
      for (const f of ['SingletonLock', 'lockfile']) {
        const fp = path.join(absDir, f);
        if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); actions.push(`Removed ${f}`); } catch {} }
      }
      return { healed: true, action: actions.join('. ') + '.' };
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
    id: 'detached-frame',
    troubleshoot: TROUBLESHOOT.browser,
    match: (err) =>
      err.message?.includes('detached Frame') || err.message?.includes('Attempted to use detached Frame'),
    diagnosis: 'Browser frame detached — Chrome tab crashed or was navigated away during operation.',
    severity: 'medium',
    fix: async (err, ctx) => {
      // Kill zombie Chrome + clean locks so next launch starts fresh
      if (ctx.profileDir) {
        const absDir = path.resolve(__dirname, ctx.profileDir);
        const actions = [];
        const killed = await killOrphanedChrome(absDir);
        if (killed) actions.push('Killed orphaned Chrome');
        // Close any cached browser instance so it's relaunched fresh
        try {
          const { closeBrowserForProfile } = require('./browser');
          await closeBrowserForProfile(ctx.profileDir);
          actions.push('Closed cached browser instance');
        } catch {}
        const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort', 'lockfile'];
        for (const f of lockFiles) {
          const fp = path.join(absDir, f);
          if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} }
        }
        actions.push('Cleaned lock files');
        return { healed: true, action: actions.join('. ') + '. Browser will relaunch on next use.' };
      }
      return { healed: true, action: 'Frame detached — caller should close page and relaunch browser.' };
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
    fix: async (err, ctx) => {
      // Same recovery as detached-frame: kill zombie + clean locks
      if (ctx.profileDir) {
        const absDir = path.resolve(__dirname, ctx.profileDir);
        await killOrphanedChrome(absDir);
        try {
          const { closeBrowserForProfile } = require('./browser');
          await closeBrowserForProfile(ctx.profileDir);
        } catch {}
        return { healed: true, action: 'Killed zombie Chrome + closed cached browser. Will relaunch on next use.' };
      }
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
    diagnosis: 'File permission error — another process holds the file.',
    severity: 'medium',
    fix: async (err) => {
      // Can't fix permissions automatically in a safe way
      return { healed: false, action: `Permission denied on ${err.path}. May need to stop other processes using the file.` };
    },
  },

  {
    id: 'resend-api-down',
    troubleshoot: TROUBLESHOOT.infra,
    match: (err) =>
      err.message?.includes('[resend]') || err.message?.includes('Resend') ||
      (err.message?.includes('api.resend.com') && !err.message?.includes('200')),
    diagnosis: 'Resend email service is not responding or authentication failed.',
    severity: 'high',
    fix: async (err) => {
      const msg = err.message || '';
      // Auth failure — can't auto-fix, need new API key
      if (msg.includes('401') || msg.includes('403') || msg.includes('auth')) {
        return { healed: false, action: 'Resend API key invalid or expired. Generate a new key at https://resend.com/api-keys and update RESEND_API_KEY in .env' };
      }
      // Domain issue
      if (msg.includes('domain') || msg.includes('unverified')) {
        return { healed: false, action: 'Resend domain verification issue. Check DNS records (SPF/DKIM/DMARC) in Cloudflare and re-verify at https://resend.com/domains' };
      }
      // Transient — will retry
      return { healed: true, action: 'Resend API temporarily unreachable. Sentinel will retry on next check (5min). Alerts written to logs/emergency-alert-*.log as fallback.' };
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

// ── Claude AI Fallback ───────────────────────────────────────────────────

const CLAUDE_ALLOWED_ACTIONS = [
  'kill_chrome_and_clean_locks',  // Kill orphaned Chrome + clean lock files for a profile
  'restart_pm2_service',          // pm2 restart a specific service
  'clean_temp_files',             // Remove stale temp/report files
  'retry_later',                  // Transient issue, retry on next scheduled run
  'escalate',                     // Cannot self-heal, alert human
];

/**
 * Ask Claude to diagnose an unknown error and recommend an action.
 * Claude responds with structured JSON — only actions in the allowlist are executed.
 */
async function claudeDiagnose(err, ctx, tag) {
  const fallback = {
    patternId: 'claude-unknown',
    severity: 'unknown',
    diagnosis: 'Unrecognized error — Claude fallback also failed.',
    healed: false,
    action: 'No automatic fix available.',
  };

  // Check rate limits before calling Claude
  const limit = canCallClaude();
  if (!limit.ok) {
    console.warn(`${tag} Claude call blocked: ${limit.reason}`);
    return { ...fallback, diagnosis: `Unrecognized error (Claude blocked: ${limit.reason})` };
  }

  try {
    recordClaudeCall();
    const knownPatternIds = KNOWN_PATTERNS.map(p => p.id).join(', ');

    // Gather system state for Claude — profiles, PM2 services, recent doctor logs
    const allProfiles = [];
    try {
      allProfiles.push({ name: 'chrome-profile', path: 'chrome-profile', desc: 'default browser (brand Twitter, generic)' });
      const profilesDir = path.join(__dirname, 'chrome-profiles');
      if (fs.existsSync(profilesDir)) {
        for (const d of fs.readdirSync(profilesDir)) {
          if (fs.statSync(path.join(profilesDir, d)).isDirectory()) {
            allProfiles.push({ name: d, path: `chrome-profiles/${d}`, desc: d });
          }
        }
      }
    } catch {}

    // Recent doctor logs for context (last 5 entries today)
    let recentLogs = '';
    try {
      const todayFile = LOG_FILE();
      if (fs.existsSync(todayFile)) {
        const entries = JSON.parse(fs.readFileSync(todayFile, 'utf8'));
        const last5 = entries.slice(-5).map(e => `  ${e.timestamp}: ${e.patternId} → ${e.healed ? 'HEALED' : 'NOT HEALED'}: ${e.action}`);
        recentLogs = last5.join('\n');
      }
    } catch {}

    const prompt = `You are the Doctor agent for YTubViral, a multi-agent automation system running on Windows with PM2, Puppeteer, and Chrome profiles.

An error occurred that didn't match any known pattern. Diagnose it and recommend ONE action.

ERROR: ${err.message || 'Unknown error'}
${err.stack ? `STACK (first 500 chars): ${err.stack.slice(0, 500)}` : ''}
CONTEXT:
- Platform: ${ctx.platform || 'unknown'}
- Account: ${ctx.account || 'unknown'}
- Action: ${ctx.action || 'unknown'}
- Profile dir: ${ctx.profileDir || 'none (not provided by caller)'}

AVAILABLE CHROME PROFILES:
${allProfiles.map(p => `- "${p.path}" — ${p.desc}`).join('\n')}

${recentLogs ? `RECENT DOCTOR ACTIVITY (last 5):\n${recentLogs}\n` : ''}
KNOWN PATTERNS (already checked, none matched): ${knownPatternIds}

ALLOWED ACTIONS (you MUST pick one):
- kill_chrome_and_clean_locks: Kill orphaned Chrome processes for a specific profile + remove lock files. In "details", specify the profile path from the list above (e.g. "chrome-profile" or "chrome-profiles/persona-alex"). If the caller didn't provide a profileDir, INFER which profile is relevant from the platform/account context. If unsure, use "all" to kill ALL Chrome zombies and clean ALL profiles.
- restart_pm2_service: Restart a PM2 service. Specify which service in details (ytubviral-agent, ytubviral-dashboard, ytubviral-tunnel).
- clean_temp_files: Remove stale temp files. Specify relative paths (comma-separated) in details.
- retry_later: Transient issue (network blip, API hiccup). Will resolve on next run.
- escalate: Cannot self-fix (account banned, API key revoked, data corruption).

IMPORTANT: Be smart about inferring context. If platform is "twitter" and account is "brand", the profile is likely "chrome-profile" (the default browser). If account contains "persona-alex", the profile is "chrome-profiles/persona-alex". Don't say "cannot fix" just because the caller forgot to pass profileDir — figure it out.

Respond ONLY with this JSON (no markdown, no explanation):
{"action":"<one of the allowed actions>","severity":"low|medium|high|critical","diagnosis":"<1 sentence>","details":"<specific details for executing the action>"}`;

    const res = await guardedCall(prompt, {
      maxTokens: 200,
      agentId: 'doctor',
      model: 'claude-opus-4-6',
    });

    const parsed = JSON.parse(res.text.trim());

    // Validate action is in allowlist
    if (!CLAUDE_ALLOWED_ACTIONS.includes(parsed.action)) {
      console.warn(`${tag} Claude recommended disallowed action: ${parsed.action} — escalating`);
      return { ...fallback, diagnosis: parsed.diagnosis || fallback.diagnosis };
    }

    // Execute the allowed action
    const execResult = await executeClaudeAction(parsed.action, parsed.details, ctx, tag);

    return {
      patternId: `claude-${parsed.action}`,
      severity: parsed.severity || 'medium',
      diagnosis: parsed.diagnosis || 'Claude-diagnosed issue',
      healed: execResult.healed,
      action: execResult.action,
    };
  } catch (claudeErr) {
    console.error(`${tag} Claude diagnosis failed: ${claudeErr.message}`);
    return fallback;
  }
}

/**
 * Execute a Claude-recommended action (allowlisted).
 */
async function executeClaudeAction(action, details, ctx, tag) {
  const { execSync } = require('child_process');

  switch (action) {
    case 'kill_chrome_and_clean_locks': {
      const lockFileNames = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort', 'lockfile'];

      // Claude can specify profile in details, or we use ctx.profileDir, or we clean ALL
      let profilePaths = [];
      const detailStr = (details || '').trim();

      if (detailStr === 'all') {
        // Kill ALL Chrome zombies and clean ALL profiles
        profilePaths.push(path.resolve(__dirname, 'chrome-profile'));
        const profilesDir = path.join(__dirname, 'chrome-profiles');
        if (fs.existsSync(profilesDir)) {
          for (const d of fs.readdirSync(profilesDir)) {
            const full = path.join(profilesDir, d);
            if (fs.statSync(full).isDirectory()) profilePaths.push(full);
          }
        }
      } else if (detailStr && detailStr !== '') {
        // Claude specified a profile path in details (e.g. "chrome-profile" or "chrome-profiles/persona-alex")
        const resolved = path.resolve(__dirname, detailStr);
        if (fs.existsSync(resolved)) profilePaths.push(resolved);
      }

      // Fallback to ctx.profileDir
      if (!profilePaths.length && ctx.profileDir) {
        profilePaths.push(path.resolve(__dirname, ctx.profileDir));
      }

      // Last resort: clean the default profile
      if (!profilePaths.length) {
        profilePaths.push(path.resolve(__dirname, 'chrome-profile'));
      }

      const cleaned = [];
      for (const profileDir of profilePaths) {
        if (!fs.existsSync(profileDir)) continue;
        await killOrphanedChrome(profileDir);
        for (const f of lockFileNames) {
          const fp = path.join(profileDir, f);
          if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} }
        }
        cleaned.push(path.basename(profileDir));
      }

      // Also close cached browser instances
      try {
        const { closeBrowserForProfile } = require('./browser');
        for (const profileDir of profilePaths) {
          await closeBrowserForProfile(profileDir).catch(() => {});
        }
      } catch {}

      return { healed: cleaned.length > 0, action: `Claude: killed Chrome + cleaned locks for [${cleaned.join(', ')}]. ${details || ''}` };
    }

    case 'restart_pm2_service': {
      // Only allow restarting known services
      const allowed = ['ytubviral-agent', 'ytubviral-dashboard', 'ytubviral-tunnel'];
      const service = (details || '').match(/ytubviral-\w+/)?.[0];
      if (!service || !allowed.includes(service)) {
        return { healed: false, action: `Claude recommended restarting "${details}" but service not in allowlist.` };
      }
      try {
        execSync(`pm2 restart ${service} --update-env`, { timeout: 15000, stdio: 'pipe' });
        return { healed: true, action: `Claude: restarted ${service}. ${details || ''}` };
      } catch (e) {
        return { healed: false, action: `Claude: pm2 restart ${service} failed: ${e.message}` };
      }
    }

    case 'clean_temp_files': {
      // Only allow cleaning within known safe directories
      const safeBase = path.resolve(__dirname);
      const filesToClean = (details || '').split(',').map(f => f.trim()).filter(Boolean);
      let cleaned = 0;
      for (const f of filesToClean) {
        const abs = path.resolve(safeBase, f);
        if (!abs.startsWith(safeBase)) continue; // prevent path traversal
        if (fs.existsSync(abs)) {
          try { fs.unlinkSync(abs); cleaned++; } catch {}
        }
      }
      return { healed: cleaned > 0, action: `Claude: cleaned ${cleaned} temp file(s). ${details || ''}` };
    }

    case 'retry_later':
      return { healed: true, action: `Claude: transient issue, will resolve on next run. ${details || ''}` };

    case 'escalate':
      return { healed: false, action: `Claude: requires manual intervention. ${details || ''}` };

    default:
      return { healed: false, action: `Unknown action: ${action}` };
  }
}

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

  // ── Check learned patterns (0 tokens) ──
  const signature = computeErrorSignature(err, ctx);
  const learned = findLearnedPattern(signature);
  if (learned) {
    console.log(`${tag} Matched learned pattern (${learned.status}): ${learned.action} — ${learned.details || 'no details'}`);
    try {
      const execResult = await executeClaudeAction(learned.action, learned.details, ctx, tag);
      updateLearnedPatternResult(signature, execResult.healed);

      const entry = {
        timestamp: new Date().toISOString(),
        patternId: `learned-${learned.action}`,
        severity: 'medium',
        diagnosis: `Learned pattern match (${learned.status}, healed ${learned.healCount}x before)`,
        healed: execResult.healed,
        action: execResult.action,
        error: err.message,
        context: { platform: ctx.platform, account: ctx.account, action: ctx.action },
      };
      logEntry(entry);
      console.log(`${tag} Learned pattern ${execResult.healed ? 'HEALED' : 'FAILED'}: ${execResult.action}`);

      if (execResult.healed) {
        return { healed: true, diagnosis: entry.diagnosis, action: execResult.action, patternId: entry.patternId };
      }
      // Learned pattern failed — fall through to Claude
      console.log(`${tag} Learned pattern failed — falling through to Claude...`);
    } catch (learnedErr) {
      console.error(`${tag} Learned pattern execution threw: ${learnedErr.message}`);
      updateLearnedPatternResult(signature, false);
    }
  }

  // ── No pattern matched — ask Claude to diagnose and recommend action ──
  console.log(`${tag} No pattern matched — consulting Claude for diagnosis...`);

  const claudeResult = await claudeDiagnose(err, ctx, tag);

  const claudeEntry = {
    timestamp: new Date().toISOString(),
    patternId: claudeResult.patternId,
    severity: claudeResult.severity,
    diagnosis: claudeResult.diagnosis,
    healed: claudeResult.healed,
    action: claudeResult.action,
    error: err.message,
    context: { platform: ctx.platform, account: ctx.account, action: ctx.action },
  };

  logEntry(claudeEntry);
  console.log(`${tag} Claude diagnosis: ${claudeResult.diagnosis}`);
  console.log(`${tag} ${claudeResult.healed ? 'HEALED' : 'NOT HEALED'}: ${claudeResult.action}`);

  // Save successful Claude diagnoses as learned patterns for future use (0 tokens next time)
  if (claudeResult.healed && claudeResult.patternId && claudeResult.patternId !== 'claude-unknown') {
    const actionName = claudeResult.patternId.replace('claude-', '');
    if (CLAUDE_ALLOWED_ACTIONS.includes(actionName)) {
      saveLearnedPattern(signature, actionName, claudeResult.action.replace(/^Claude: /, '').split('.')[0]);
    }
  }

  if (!claudeResult.healed && (claudeResult.severity === 'critical' || claudeResult.severity === 'high')) {
    await alertHuman(claudeEntry, tag);
  }

  return { healed: claudeResult.healed, diagnosis: claudeResult.diagnosis, action: claudeResult.action, patternId: claudeResult.patternId };
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

module.exports = { diagnose, getTodaySummary, loadLearnedPatterns, saveLearnedPatterns };
