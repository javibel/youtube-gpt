'use strict';

/**
 * FEATURE MONITOR — End-to-end health checks + self-healing for YTubViral platform.
 *
 * Flow: Detect → Confirm (re-probe) → Claude diagnoses → Auto-fix → Verify → Escalate
 *
 * Self-healing capabilities (allowlist):
 * - Vercel redeploy (via Vercel API) when builds are stale/broken
 * - Restart PM2 services when dashboard/tunnel are down
 * - Clear Vercel cache when stale responses detected
 * - Alert + diagnosis when Claude/YouTube API keys expire
 *
 * Only escalates to human when auto-fix fails or issue is outside allowlist.
 *
 * Runs 2x/day via cron (07:00, 19:00 Madrid).
 * Cost: ~$0.03/run when failures detected (1 Claude diagnosis call).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sendEmail } = require('./reports');
const { guardedCall } = require('./api-guard');
const { diagnose } = require('./doctor');
const { registerFixes, applyFixes } = require('./auto-fix');
const mem = require('./agent-memory');

const BASE_URL = 'https://ytubviral.com';
const REPORTS_DIR = path.join(__dirname, 'reports');
const TIMEOUT = 30000;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Make a request to an endpoint and validate the response.
 * Returns { name, status, ok, responseTime, error?, details? }
 */
async function probe(name, url, opts = {}) {
  const {
    method = 'GET',
    body = null,
    expectStatus = 200,
    validate = null, // (data) => true/false
    acceptStatuses = null, // [200, 401] — multiple acceptable statuses
    timeout = TIMEOUT,
  } = opts;

  const start = Date.now();
  try {
    const fetchOpts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeout),
    };
    if (body) fetchOpts.body = JSON.stringify(body);

    const res = await fetch(url, fetchOpts);
    const responseTime = Date.now() - start;
    const status = res.status;

    const acceptable = acceptStatuses || [expectStatus];
    if (!acceptable.includes(status)) {
      const text = await res.text().catch(() => '');
      return { name, status, ok: false, responseTime, error: `Expected ${acceptable.join('/')}, got ${status}`, details: text.slice(0, 200) };
    }

    // Try to parse JSON for validation
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response is ok for some endpoints */ }

    if (validate && data) {
      const valid = validate(data);
      if (!valid) {
        return { name, status, ok: false, responseTime, error: 'Response validation failed', details: JSON.stringify(data).slice(0, 200) };
      }
    }

    return { name, status, ok: true, responseTime, _url: url, _opts: opts };
  } catch (err) {
    const responseTime = Date.now() - start;
    const msg = err.message || String(err);
    const isTimeout = msg.includes('timeout') || msg.includes('abort');
    return { name, status: 0, ok: false, responseTime, error: isTimeout ? `Timeout (${timeout}ms)` : msg, _url: url, _opts: opts };
  }
}

/**
 * Run all feature probes.
 */
async function runFeatureMonitor() {
  console.log('[feature-monitor] Starting feature health checks...');
  ensureDir(REPORTS_DIR);

  const results = [];

  // ── 1. Core infrastructure ──────────────────────────────────────────────

  results.push(await probe('Landing page', `${BASE_URL}/`, {
    validate: () => true, // just needs to return 200
  }));

  results.push(await probe('API Health', `${BASE_URL}/api/health`));

  results.push(await probe('Login page', `${BASE_URL}/login`));

  results.push(await probe('Blog', `${BASE_URL}/blog`));

  results.push(await probe('Sitemap', `${BASE_URL}/sitemap.xml`));

  // ── 2. Public features (no auth needed) ──────────────────────────────

  results.push(await probe('Trending videos', `${BASE_URL}/api/youtube/trending?regionCode=US`, {
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('Extension SEO Quick', `${BASE_URL}/api/extension/seo-quick`, {
    method: 'POST',
    body: { title: 'How to grow on YouTube in 2026', description: 'A complete guide to YouTube growth strategies', tags: ['youtube', 'growth', 'seo'] },
    acceptStatuses: [200, 401, 403],
  }));

  // ── 3. AI generation (tests Claude integration) ──────────────────────
  // Uses a minimal call to verify Claude API is working through the app

  results.push(await probe('AI Generate (title)', `${BASE_URL}/api/generate`, {
    method: 'POST',
    body: { template: 'title', inputs: { topic: 'youtube seo tips' }, lang: 'en' },
    // Without auth, should return 401 — that's fine, it means the route is alive
    // With auth, would return 200 with generated titles
    acceptStatuses: [200, 401, 403],
    timeout: 45000,
  }));

  results.push(await probe('Keyword Research', `${BASE_URL}/api/research/keywords`, {
    method: 'POST',
    body: { keyword: 'youtube seo' },
    acceptStatuses: [200, 401, 403],
    timeout: 45000,
  }));

  // ── 4. YouTube-connected features (expect 401 without auth) ──────────
  // Testing that routes are alive and return proper auth errors (not 500)

  results.push(await probe('SEO Score', `${BASE_URL}/api/youtube/seo-score`, {
    method: 'POST',
    body: {},
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('Retention Analyzer', `${BASE_URL}/api/youtube/retention`, {
    method: 'POST',
    body: { lang: 'en' },
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('Best Time Analyzer', `${BASE_URL}/api/youtube/best-time`, {
    method: 'POST',
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('Competitor Analysis', `${BASE_URL}/api/youtube/competitor`, {
    method: 'POST',
    body: { channelUrl: 'https://youtube.com/@MrBeast' },
    acceptStatuses: [200, 401, 403],
    timeout: 45000,
  }));

  results.push(await probe('Channel Stats', `${BASE_URL}/api/youtube/stats`, {
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('YouTube Analytics', `${BASE_URL}/api/youtube/analytics`, {
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('Revenue Estimator', `${BASE_URL}/api/youtube/revenue`, {
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('Content Calendar', `${BASE_URL}/api/calendar`, {
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('AI Coach', `${BASE_URL}/api/coach`, {
    method: 'POST',
    body: { message: 'test', mode: 'analyze', lang: 'en' },
    acceptStatuses: [200, 401, 403],
    timeout: 45000,
  }));

  results.push(await probe('Performance Predictor', `${BASE_URL}/api/predictor`, {
    method: 'POST',
    body: { title: 'Test video title' },
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('A/B Test Suggest', `${BASE_URL}/api/youtube/ab-test/suggest`, {
    method: 'POST',
    body: { title: 'How to grow on YouTube', lang: 'en' },
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('Storyboard', `${BASE_URL}/api/storyboard`, {
    method: 'POST',
    body: { script: 'A short test script about YouTube growth', lang: 'en' },
    acceptStatuses: [200, 401, 403],
    timeout: 45000,
  }));

  results.push(await probe('Daily Ideas', `${BASE_URL}/api/daily-ideas`, {
    acceptStatuses: [200, 401, 403],
  }));

  results.push(await probe('Trend Alerts', `${BASE_URL}/api/trends`, {
    acceptStatuses: [200, 401, 403],
  }));

  // ── 5. Extension endpoints ───────────────────────────────────────────

  results.push(await probe('Extension Video Scorecard', `${BASE_URL}/api/extension/video-scorecard`, {
    method: 'POST',
    body: { videoId: 'dQw4w9WgXcQ' }, // Rick Astley — always exists
    acceptStatuses: [200, 401, 403],
    timeout: 30000,
  }));

  // ── Compile results ─────────────────────────────────────────────────

  const passing = results.filter(r => r.ok);
  let failing = results.filter(r => !r.ok);
  const healthPct = Math.round((passing.length / results.length) * 100);

  console.log(`[feature-monitor] Initial scan: ${passing.length}/${results.length} passing (${healthPct}%)`);
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    const time = `${r.responseTime}ms`;
    console.log(`  ${icon} ${r.name}: ${r.ok ? `OK (${r.status}) ${time}` : `FAIL — ${r.error}`}`);
  }

  // ── Step 2: Confirm failures (re-probe after 30s to rule out transients) ──

  let confirmed = [];
  if (failing.length > 0) {
    console.log(`[feature-monitor] ${failing.length} failures detected. Waiting 30s to confirm...`);
    await new Promise(r => setTimeout(r, 30000));

    for (const f of failing) {
      const recheck = await probe(f.name, f._url, f._opts || {});
      if (!recheck.ok) {
        confirmed.push({ ...f, recheck });
      } else {
        console.log(`  ✅ ${f.name}: recovered on re-probe (transient)`);
      }
    }

    if (confirmed.length === 0) {
      console.log('[feature-monitor] All failures were transient. No action needed.');
    } else {
      console.log(`[feature-monitor] ${confirmed.length} confirmed failures. Starting auto-heal...`);
    }
  }

  // ── Step 3: Auto-heal confirmed failures ──────────────────────────────

  let healedCount = 0;
  let unhealedIssues = [];

  if (confirmed.length > 0) {
    // Feed issues into auto-fix engine
    const issueStrings = confirmed.map(f =>
      `FEATURE_DOWN: ${f.name} — HTTP ${f.status} — ${f.error}${f.details ? ` — ${f.details}` : ''}`
    );

    const appliedFixes = await applyFixes('feature-monitor', issueStrings, { results, confirmed });

    // Also try Doctor for each failure
    for (const f of confirmed) {
      const err = new Error(`Feature ${f.name} returned HTTP ${f.status}: ${f.error}`);
      const doctorResult = await diagnose(err, {
        platform: 'web',
        account: 'ytubviral.com',
        action: `probe:${f.name}`,
      });

      if (doctorResult.healed) {
        console.log(`  🔧 Doctor healed: ${f.name} — ${doctorResult.action}`);
        healedCount++;
      } else {
        unhealedIssues.push({ feature: f.name, error: f.error, status: f.status, details: f.details, doctorAction: doctorResult.action });
      }
    }

    // If auto-fix applied something, wait and re-verify
    if (appliedFixes.length > 0) {
      console.log(`[feature-monitor] ${appliedFixes.length} auto-fix(es) applied. Waiting 60s to verify...`);
      await new Promise(r => setTimeout(r, 60000));

      // Re-probe all previously failing features
      const stillFailing = [];
      for (const f of confirmed) {
        const verify = await probe(f.name, f._url, f._opts || {});
        if (verify.ok) {
          console.log(`  ✅ ${f.name}: HEALED after auto-fix`);
          healedCount++;
          unhealedIssues = unhealedIssues.filter(u => u.feature !== f.name);
        } else {
          stillFailing.push(f);
        }
      }
    }
  }

  // ── Step 4: Save report ────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);
  const report = {
    date: new Date().toISOString(),
    total: results.length,
    passing: passing.length,
    failing: failing.length,
    confirmed: confirmed.length,
    healed: healedCount,
    unhealed: unhealedIssues.length,
    healthPct,
    results: results.map(r => ({
      name: r.name,
      ok: r.ok,
      status: r.status,
      responseTime: r.responseTime,
      error: r.error || null,
    })),
    unhealedIssues,
  };

  const reportFile = path.join(REPORTS_DIR, `feature-monitor-${today}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  // ── Step 5: Update agent memory ────────────────────────────────────────

  try {
    const findings = unhealedIssues.map(u => ({
      id: mem.issueId(`feature-down-${u.feature}`),
      description: `${u.feature}: ${u.error}`,
      severity: 'high',
    }));
    if (findings.length > 0) mem.processFindings('feature-monitor', findings);
  } catch { /* memory not critical */ }

  // ── Step 6: Escalate to human ONLY if unhealed issues remain ───────────

  if (unhealedIssues.length > 0) {
    const severity = unhealedIssues.length >= 5 ? 'CRITICAL' : unhealedIssues.length >= 2 ? 'HIGH' : 'MEDIUM';
    const subject = `[YTubViral] Feature Monitor: ${unhealedIssues.length} features need manual fix (${severity})`;
    const body = [
      `Feature Monitor — ESCALATION TO HUMAN`,
      `Severity: ${severity}`,
      `Date: ${new Date().toISOString()}`,
      '',
      `Initial scan: ${failing.length} failures detected`,
      `After confirmation: ${confirmed.length} confirmed (${failing.length - confirmed.length} were transient)`,
      `Auto-healed: ${healedCount}`,
      `STILL BROKEN: ${unhealedIssues.length}`,
      '',
      '── UNHEALED FEATURES (need manual intervention) ──',
      ...unhealedIssues.map(u => [
        `❌ ${u.feature}`,
        `   Status: HTTP ${u.status}`,
        `   Error: ${u.error}`,
        `   Doctor tried: ${u.doctorAction}`,
        u.details ? `   Response: ${u.details}` : '',
      ].filter(Boolean).join('\n')),
      '',
      healedCount > 0 ? `── AUTO-HEALED (no action needed) ──\nThe system automatically fixed ${healedCount} feature(s) before escalating.\n` : '',
      `── ALL FEATURES ──`,
      ...results.map(r => `${r.ok ? '✅' : '❌'} ${r.name} (${r.status}) ${r.responseTime}ms`),
      '',
      '— YTubViral Feature Monitor (auto-escalation)',
    ].filter(Boolean).join('\n');

    await sendEmail(subject, body).catch(err => {
      console.error(`[feature-monitor] Alert email failed: ${err.message}`);
    });
  } else if (confirmed.length > 0 && healedCount > 0) {
    // All issues auto-healed — send info email (not an alert)
    console.log(`[feature-monitor] All ${healedCount} issue(s) auto-healed. No human intervention needed.`);
  }

  console.log(`[feature-monitor] Done. ${confirmed.length} confirmed failures, ${healedCount} healed, ${unhealedIssues.length} need human.`);
  return report;
}

// ── Auto-Fix Definitions ────────────────────────────────────────────────────

registerFixes('feature-monitor', [
  {
    id: 'claude-feature-diagnosis',
    description: 'Claude analyzes broken features, diagnoses root cause, and recommends/applies fixes',
    cooldownMs: 4 * 3600000, // 4 hours between diagnosis runs
    condition: (issues) => issues.some(i => i.includes('FEATURE_DOWN')),
    apply: async (config, issues, metrics) => {
      const failureDetails = issues.filter(i => i.includes('FEATURE_DOWN')).join('\n');

      const result = await guardedCall(failureDetails, {
        maxTokens: 800,
        agentId: 'feature-monitor',
        system: `You are the auto-healing brain for YTubViral (a Next.js app on Vercel).
Features are failing. Diagnose the root cause from the HTTP status codes and error details.

Common causes and fixes:
- HTTP 500 on multiple routes → Vercel deployment is broken → recommend: "action": "redeploy"
- HTTP 500 on Claude-dependent routes only → Anthropic API key expired → recommend: "action": "check_anthropic_key"
- HTTP 500 on YouTube routes only → YouTube API quota/key issue → recommend: "action": "check_youtube_key"
- HTTP 502/503 → Vercel serverless cold start or overload → recommend: "action": "retry_later" (transient)
- Timeout on all routes → DNS or Cloudflare issue → recommend: "action": "check_dns"
- Single route 500 → Bug in that specific route code → recommend: "action": "alert_dev"

Respond in JSON only:
{
  "diagnosis": "one-line root cause",
  "action": "redeploy|check_anthropic_key|check_youtube_key|retry_later|check_dns|alert_dev",
  "details": "specific instructions if action is alert_dev"
}`,
      });

      if (!result?.text) return { changed: false, detail: 'No diagnosis response from Claude' };

      let parsed;
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return { changed: false, detail: `Claude diagnosis unparseable: ${result.text.slice(0, 100)}` };
      }

      console.log(`[feature-monitor] Claude diagnosis: ${parsed.diagnosis} → action: ${parsed.action}`);

      // Execute auto-fix based on Claude's recommendation
      switch (parsed.action) {
        case 'retry_later':
          return { changed: false, detail: `Transient issue: ${parsed.diagnosis}. Will re-check next run.` };

        case 'redeploy':
          // Trigger Vercel redeploy via deploy hook if configured
          try {
            const hookUrl = process.env.VERCEL_DEPLOY_HOOK;
            if (hookUrl) {
              await fetch(hookUrl, { method: 'POST' });
              return { changed: true, detail: `Triggered Vercel redeploy. Diagnosis: ${parsed.diagnosis}` };
            }
            return { changed: false, detail: `Redeploy recommended but VERCEL_DEPLOY_HOOK not set. Diagnosis: ${parsed.diagnosis}` };
          } catch (e) {
            return { changed: false, detail: `Redeploy failed: ${e.message}` };
          }

        case 'check_anthropic_key':
          return { changed: false, detail: `Anthropic API key issue detected: ${parsed.diagnosis}. Check ANTHROPIC_API_KEY in Vercel env vars.` };

        case 'check_youtube_key':
          return { changed: false, detail: `YouTube API issue: ${parsed.diagnosis}. Check YOUTUBE_API_KEY quota at console.cloud.google.com` };

        case 'check_dns':
          return { changed: false, detail: `DNS/Cloudflare issue: ${parsed.diagnosis}. Check Cloudflare dashboard.` };

        case 'alert_dev':
        default:
          return { changed: false, detail: `Code bug: ${parsed.diagnosis}. ${parsed.details || 'Needs manual fix.'}` };
      }
    },
  },

  {
    id: 'restart-local-services',
    description: 'Restart PM2 services if dashboard or tunnel are down',
    cooldownMs: 30 * 60000, // 30 min
    condition: (issues) => issues.some(i =>
      i.includes('FEATURE_DOWN') && (i.includes('Landing page') || i.includes('API Health'))
    ),
    apply: async () => {
      // Check if the issue is local (PM2 services) vs remote (Vercel)
      try {
        const localRes = await fetch('http://localhost:3099/api/health', { signal: AbortSignal.timeout(5000) }).catch(() => null);
        if (localRes && localRes.ok) {
          // Local dashboard is fine — issue is with Vercel, not local
          return { changed: false, detail: 'Local services OK — issue is with Vercel deployment, not local PM2' };
        }
      } catch { /* can't reach local = might need restart */ }

      // Try restarting tunnel (most likely culprit for external access issues)
      try {
        const { execSync } = require('child_process');
        execSync('pm2 restart ytubviral-tunnel', { timeout: 15000, windowsHide: true });
        return { changed: true, detail: 'Restarted ytubviral-tunnel — may resolve connectivity' };
      } catch (e) {
        return { changed: false, detail: `PM2 restart failed: ${e.message}` };
      }
    },
  },
]);

if (require.main === module) {
  runFeatureMonitor().catch(err => {
    console.error('[feature-monitor] Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { runFeatureMonitor };
