'use strict';

/**
 * AUTO-RESOLVER — Daily manager report action engine
 *
 * Runs at 09:17 Europe/Madrid (after the 03:15 manager report).
 * Reads today's manager report, applies every fix it can programmatically,
 * and writes reports/pending-for-claude-YYYY-MM-DD.json with the rest.
 *
 * Programmatic fixes:
 *   - Watchdog issues: re-check live endpoint → auto-close if passing
 *   - PM2 services: auto-restart any stopped/errored process
 *   - Chrome lock files: remove stale SingletonLock / Singleton*
 *   - Disk >90%: log warning (can't auto-clean user files)
 *
 * Anything that requires code changes (next.config.ts, layout.tsx, etc.)
 * goes into pending-for-claude.json — Claude reads it on DESPIERTA.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const REPORTS_DIR  = path.join(__dirname, 'reports');
const MEMORY_DIR   = path.join(__dirname, 'memory');
const CHROME_DIR   = path.join(__dirname, 'chrome-profile');

// ── helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[auto-resolver] ${msg}`);
  try {
    fs.appendFileSync(
      path.join(__dirname, 'logs', `auto-resolver-${today()}.log`),
      `${ts} ${msg}\n`
    );
  } catch {}
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/** Fetch a URL and return { ok, status, cacheControl } */
function httpCheck(url, timeoutMs = 8000) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, status: 0, error: 'timeout' }), timeoutMs);
    try {
      const req = https.get(url, { headers: { 'User-Agent': 'YTubViral-AutoResolver/1.0' } }, res => {
        clearTimeout(timer);
        const cc = res.headers['cache-control'] || '';
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          cacheControl: cc,
          isPublic: cc.includes('public') && !cc.includes('private'),
        });
        res.resume();
      });
      req.on('error', err => { clearTimeout(timer); resolve({ ok: false, status: 0, error: err.message }); });
    } catch (err) {
      clearTimeout(timer);
      resolve({ ok: false, status: 0, error: err.message });
    }
  });
}

// ── Fix 1: Watchdog issues — re-check live and auto-close ────────────────────

async function fixWatchdogIssues(resolved, pending) {
  const watchdogFile = path.join(MEMORY_DIR, 'watchdog.json');
  const watchdog = readJson(watchdogFile);
  if (!watchdog) { log('watchdog.json not found — skipping'); return; }

  const openIssues = (watchdog.knownIssues || []).filter(i => i.status === 'open');
  if (openIssues.length === 0) { log('Watchdog: no open issues'); return; }

  for (const issue of openIssues) {
    log(`Watchdog: checking issue "${issue.id}" (${issue.severity})`);

    // Extract URL path from issue id: "legal_content::/legal::NIF/CIF" → /legal
    const match = issue.id.match(/::(\/.+?)::/);
    if (!match) {
      log(`Watchdog: can't extract URL from id "${issue.id}" — leaving for Claude`);
      pending.push({
        type: 'watchdog_unresolvable',
        issue: issue.id,
        description: issue.description,
        severity: issue.severity,
        note: 'Auto-resolver could not extract URL from issue id — manual review needed',
      });
      continue;
    }

    const urlPath = match[1];
    const url = `https://ytubviral.com${urlPath}`;
    const check = await httpCheck(url);

    if (!check.ok) {
      log(`Watchdog: ${url} returned ${check.status} — issue stays open`);
      if (issue.severity === 'high' || issue.severity === 'critical') {
        pending.push({
          type: 'watchdog_page_down',
          issue: issue.id,
          description: issue.description,
          severity: issue.severity,
          url,
          httpStatus: check.status,
        });
      }
      continue;
    }

    // Page is up — close the issue optimistically (watchdog will reopen on next run if still broken)
    issue.status = 'resolved';
    issue.resolvedAt = today();
    issue.resolvedNote = `Auto-resolver: page ${url} responded ${check.status} — issue assumed resolved.`;

    watchdog.changelog = watchdog.changelog || [];
    watchdog.changelog.push({
      date: today(),
      type: 'resolved',
      message: `Auto-resuelto: ${issue.description} — HTTP ${check.status} en ${url}`,
    });

    log(`Watchdog: closed issue "${issue.id}" (HTTP ${check.status})`);
    resolved.push({ type: 'watchdog_closed', issue: issue.id, description: issue.description, url });
  }

  writeJson(watchdogFile, watchdog);
}

// ── Fix 2: PM2 services — restart any stopped process ───────────────────────

async function fixPm2Services(resolved, pending) {
  const EXPECTED = ['ytubviral-agent', 'ytubviral-dashboard', 'ytubviral-tunnel'];
  let pm2Json;
  try {
    const out = execSync('pm2 jlist', { timeout: 10000, stdio: 'pipe', windowsHide: true }).toString();
    pm2Json = JSON.parse(out);
  } catch (err) {
    log(`PM2: failed to read jlist — ${err.message}`);
    return;
  }

  const byName = {};
  for (const proc of pm2Json) byName[proc.name] = proc;

  for (const name of EXPECTED) {
    const proc = byName[name];
    if (!proc) {
      log(`PM2: ${name} not found — adding to pending`);
      pending.push({ type: 'pm2_missing', service: name, note: 'Service not registered in PM2' });
      continue;
    }

    const status = proc.pm2_env?.status;
    if (status !== 'online') {
      log(`PM2: ${name} is ${status} — restarting`);
      try {
        execSync(`pm2 restart ${name} --update-env`, { timeout: 15000, stdio: 'pipe', windowsHide: true });
        log(`PM2: ${name} restarted successfully`);
        resolved.push({ type: 'pm2_restarted', service: name, wasStatus: status });
      } catch (err) {
        log(`PM2: failed to restart ${name} — ${err.message}`);
        pending.push({ type: 'pm2_restart_failed', service: name, error: err.message });
      }
    } else {
      log(`PM2: ${name} is online ✓`);
    }
  }
}

// ── Fix 3: Chrome lock files ─────────────────────────────────────────────────

function fixChromeLocks(resolved) {
  if (!fs.existsSync(CHROME_DIR)) return;

  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const lf of lockFiles) {
    const lockPath = path.join(CHROME_DIR, lf);
    // Recurse into profile subdirs
    const profiles = ['Default', 'Profile 1', 'Profile 2', '.'];
    for (const profile of profiles) {
      const p = profile === '.' ? lockPath : path.join(CHROME_DIR, profile, lf);
      if (fs.existsSync(p)) {
        try {
          fs.rmSync(p, { force: true });
          log(`Chrome: removed lock file ${p}`);
          resolved.push({ type: 'chrome_lock_cleaned', file: p });
        } catch (err) {
          log(`Chrome: failed to remove ${p} — ${err.message}`);
        }
      }
    }
  }
}

// ── Fix 4: SEO cache-control check ──────────────────────────────────────────

async function checkSeoCacheControl(resolved, pending) {
  const check = await httpCheck('https://ytubviral.com/');
  log(`SEO: ytubviral.com/ → HTTP ${check.status} | Cache-Control: ${check.cacheControl || '(none)'}`);

  if (!check.isPublic) {
    pending.push({
      type: 'seo_cache_private',
      severity: 'critical',
      url: 'https://ytubviral.com/',
      cacheControl: check.cacheControl,
      fix: 'Remove cookies() calls from all public page server components in app/. Replace with getServerLang() from lib/server-lang.ts. Ensure next.config.ts has Cache-Control: public headers for public routes.',
    });
    log(`SEO CRITICAL: Cache-Control is not public — added to pending-for-claude`);
  } else {
    log(`SEO: Cache-Control is public ✓ (${check.cacheControl})`);
    resolved.push({ type: 'seo_cache_public', cacheControl: check.cacheControl });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runAutoResolver() {
  const startTime = Date.now();
  log('Starting daily auto-resolve cycle');

  const resolved = [];
  const pending  = [];

  // Read today's manager report
  const reportFile = path.join(REPORTS_DIR, `manager-${today()}.json`);
  const report = readJson(reportFile);

  if (!report) {
    log(`Manager report not found: ${reportFile} — running basic checks only`);
  } else {
    log(`Manager report loaded — executiveSummary length: ${report.executiveSummary?.length || 0} chars`);

    // Scan sections for critical/high issues and add code-level ones to pending
    const sections = report.sections || [];
    for (const section of sections) {
      if (section.status === 'OK' || section.status === 'SIN CAMBIOS') continue;

      const isHigh = ['ALERTA', 'ATENCIÓN', 'CRÍTICO', 'ERROR'].includes(section.status);
      if (!isHigh) continue;

      // Issues that require code changes go straight to pending-for-claude
      const codeIssueKeywords = ['noindex', 'robots', 'cache-control', 'Cache-Control', 'indexación', 'indexacion', 'sitemap'];
      const isCodeIssue = codeIssueKeywords.some(kw =>
        (section.data || '').toLowerCase().includes(kw.toLowerCase()) ||
        (section.ai  || '').toLowerCase().includes(kw.toLowerCase())
      );

      if (isCodeIssue) {
        pending.push({
          type: 'manager_code_issue',
          agent: section.agent,
          status: section.status,
          data: section.data,
          ai: section.ai,
          fix: 'Requires code-level intervention — see next.config.ts / app/ pages',
        });
      }
    }
  }

  // Run all programmatic fixes in sequence
  await fixWatchdogIssues(resolved, pending);
  await fixPm2Services(resolved, pending);
  fixChromeLocks(resolved);
  await checkSeoCacheControl(resolved, pending);

  const duration = Date.now() - startTime;

  // Write results
  const resultFile = path.join(REPORTS_DIR, `auto-resolver-${today()}.json`);
  writeJson(resultFile, {
    date: today(),
    timestamp: new Date().toISOString(),
    durationMs: duration,
    resolved,
    pending,
    managerReportRead: !!report,
  });

  // If there are pending items, write pending-for-claude for DESPIERTA protocol
  if (pending.length > 0) {
    const pendingFile = path.join(REPORTS_DIR, `pending-for-claude-${today()}.json`);
    writeJson(pendingFile, {
      date: today(),
      generatedBy: 'auto-resolver',
      issues: pending,
    });
    log(`Written ${pending.length} pending issue(s) to ${pendingFile}`);
  }

  log(`Done — resolved: ${resolved.length}, pending for Claude: ${pending.length} (${duration}ms)`);
  return { resolved, pending };
}

module.exports = { runAutoResolver };

// Direct execution
if (require.main === module) {
  runAutoResolver()
    .then(r => {
      console.log(`[auto-resolver] Complete — ${r.resolved.length} resolved, ${r.pending.length} pending`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[auto-resolver] Fatal:', err);
      process.exit(1);
    });
}
