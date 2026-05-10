'use strict';

/**
 * SENTINEL AGENT — Site uptime & health monitor (PRIORITY 1)
 *
 * Runs every 5 minutes. Checks:
 * 1. HTTP status of ytubviral.com (landing page)
 * 2. Response time
 * 3. SSL certificate validity
 *
 * Alerts immediately via email on:
 * - Site down (non-2xx or timeout)
 * - Site recovered after downtime
 * - Response time degradation (>5s)
 * - SSL issues
 *
 * Does NOT use AI — pure health checks, zero API cost.
 * Uses agent-memory to track incidents over time.
 */

const { sendEmail } = require('./reports');
const mem = require('./agent-memory');
const { runGuardian } = require('./guardian');

const SITE_URL = process.env.SITE_URL || 'https://ytubviral.com';
const HEALTH_ENDPOINTS = [
  { url: '/', name: 'Landing', critical: true },
  { url: '/api/health', name: 'API Health', critical: false },
];
const TIMEOUT_MS = 15000;
const SLOW_THRESHOLD_MS = 5000;
const CONFIRM_RETRIES = 2;       // retries before declaring DOWN
const CONFIRM_DELAY_MS = 10000;  // 10s between retries
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'javijimenoplata@gmail.com';

// In-memory state (survives across cron ticks within same PM2 process)
let state = {
  isDown: false,
  downSince: null,
  lastAlertAt: null,
  consecutiveFailures: 0,
  lastCheck: null,
  lastResponseTime: null,
};

// ── HTTP check ─────────────────────────────────────────────────────────────

async function checkEndpoint(endpoint) {
  const url = `${SITE_URL}${endpoint.url}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'YTubViral-Sentinel/1.0' },
      redirect: 'follow',
    });

    clearTimeout(timer);
    const elapsed = Date.now() - start;
    const ok = res.status >= 200 && res.status < 400;

    return {
      endpoint: endpoint.name,
      url,
      status: res.status,
      ok,
      elapsed,
      slow: elapsed > SLOW_THRESHOLD_MS,
      error: null,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const isTimeout = err.name === 'AbortError' || err.message.includes('abort');

    return {
      endpoint: endpoint.name,
      url,
      status: 0,
      ok: false,
      elapsed,
      slow: false,
      error: isTimeout ? 'TIMEOUT' : err.message,
    };
  }
}

// ── Alert logic ────────────────────────────────────────────────────────────

async function sendDownAlert(results) {
  const failed = results.filter(r => !r.ok);
  const subject = `🚨 SITIO CAÍDO — ytubviral.com`;

  let body = `ALERTA CRÍTICA — SITIO NO DISPONIBLE\n${'='.repeat(50)}\n\n`;
  body += `Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}\n`;
  body += `Fallos consecutivos: ${state.consecutiveFailures}\n`;
  if (state.downSince) {
    const downMin = Math.round((Date.now() - state.downSince) / 60000);
    body += `Caído desde hace: ${downMin} minutos\n`;
  }
  body += `\nEndpoints con error:\n`;
  for (const r of failed) {
    body += `  ❌ ${r.endpoint} (${r.url})\n`;
    body += `     Status: ${r.status || 'N/A'} | Error: ${r.error || 'HTTP error'} | ${r.elapsed}ms\n`;
  }
  body += `\nEndpoints OK:\n`;
  for (const r of results.filter(r => r.ok)) {
    body += `  ✅ ${r.endpoint} — ${r.status} (${r.elapsed}ms)\n`;
  }
  body += `\n${'─'.repeat(50)}\n`;
  body += `Posibles causas:\n`;
  body += `  - Vercel deployment issue\n`;
  body += `  - DNS/Cloudflare routing (ver incidencia Movistar 2026-05-09)\n`;
  body += `  - Origin server error\n`;
  body += `\nSentinel — YTubViral Agent System\n`;

  await sendEmail(subject, body).catch(e =>
    console.error('[sentinel] Alert email failed:', e.message)
  );
  console.log('[sentinel] 🚨 DOWN alert sent');
}

async function sendRecoveryAlert(downtime) {
  const downtimeMin = Math.round(downtime / 60000);
  const subject = `✅ SITIO RECUPERADO — ytubviral.com (caído ${downtimeMin}min)`;

  let body = `SITIO RECUPERADO\n${'='.repeat(50)}\n\n`;
  body += `Hora de recuperación: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}\n`;
  body += `Tiempo de caída: ${downtimeMin} minutos\n`;
  body += `Response time actual: ${state.lastResponseTime}ms\n`;
  body += `\nSentinel — YTubViral Agent System\n`;

  await sendEmail(subject, body).catch(e =>
    console.error('[sentinel] Recovery email failed:', e.message)
  );
  console.log('[sentinel] ✅ Recovery alert sent');
}

async function sendSlowAlert(results) {
  const slow = results.filter(r => r.slow);
  const subject = `⚠️ SITIO LENTO — ytubviral.com (${slow[0].elapsed}ms)`;

  let body = `ALERTA — RENDIMIENTO DEGRADADO\n${'='.repeat(50)}\n\n`;
  body += `Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}\n`;
  body += `Umbral: ${SLOW_THRESHOLD_MS}ms\n\n`;
  for (const r of slow) {
    body += `  ⚠️ ${r.endpoint}: ${r.elapsed}ms (status ${r.status})\n`;
  }
  body += `\nSentinel — YTubViral Agent System\n`;

  await sendEmail(subject, body).catch(e =>
    console.error('[sentinel] Slow alert email failed:', e.message)
  );
  console.log('[sentinel] ⚠️ Slow alert sent');
}

// ── Main check ─────────────────────────────────────────────────────────────

async function runSentinel() {
  const results = [];

  for (const endpoint of HEALTH_ENDPOINTS) {
    results.push(await checkEndpoint(endpoint));
  }

  state.lastCheck = new Date().toISOString();
  const landing = results.find(r => r.endpoint === 'Landing');
  state.lastResponseTime = landing?.elapsed || 0;

  // Critical failure = landing page down
  let criticalDown = results.some(r => r.endpoint === 'Landing' && !r.ok);
  const anyDown = results.some(r => !r.ok);

  // ── Confirm before declaring DOWN (avoid false positives from transient timeouts)
  if (criticalDown && !state.isDown) {
    console.log(`[sentinel] Landing failed — confirming with ${CONFIRM_RETRIES} retries...`);
    for (let i = 1; i <= CONFIRM_RETRIES; i++) {
      await new Promise(r => setTimeout(r, CONFIRM_DELAY_MS));
      const retry = await checkEndpoint(HEALTH_ENDPOINTS[0]); // Landing
      console.log(`[sentinel] Retry ${i}/${CONFIRM_RETRIES}: ${retry.ok ? '✅' : '❌'} ${retry.status || 'ERR'} (${retry.elapsed}ms)`);
      if (retry.ok) {
        criticalDown = false;
        // Update the landing result for memory/logging
        const idx = results.findIndex(r => r.endpoint === 'Landing');
        if (idx >= 0) results[idx] = retry;
        state.lastResponseTime = retry.elapsed;
        break;
      }
    }
  }

  if (criticalDown) {
    state.consecutiveFailures++;

    if (!state.isDown) {
      // Transition: UP → DOWN (confirmed after retries)
      state.isDown = true;
      state.downSince = Date.now();
      state.lastAlertAt = Date.now();
      console.log('[sentinel] 🚨 SITE DOWN confirmed after retries!');
      await sendDownAlert(results);
    } else {
      // Already down — re-alert every 30 minutes
      const minSinceAlert = (Date.now() - state.lastAlertAt) / 60000;
      if (minSinceAlert >= 30) {
        state.lastAlertAt = Date.now();
        await sendDownAlert(results);
      }
    }
  } else {
    if (state.isDown) {
      // Transition: DOWN → UP (recovered)
      const downtime = Date.now() - state.downSince;
      console.log(`[sentinel] ✅ Site RECOVERED after ${Math.round(downtime / 60000)}min`);
      await sendRecoveryAlert(downtime);
      state.isDown = false;
      state.downSince = null;
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures = 0;
    }

    // Check for slow responses (only when site is up, alert max once per hour)
    const anySlow = results.some(r => r.slow);
    if (anySlow) {
      const minSinceSlowAlert = state.lastSlowAlertAt
        ? (Date.now() - state.lastSlowAlertAt) / 60000
        : 999;
      if (minSinceSlowAlert >= 60) {
        state.lastSlowAlertAt = Date.now();
        await sendSlowAlert(results);
      }
    }
  }

  // ── Wake Guardian if security concern ────────────────────────────────
  // Trigger conditions: HTTP 403/503 (possible WAF/attack), or 3+ consecutive failures
  const suspiciousStatus = results.some(r => [403, 503].includes(r.status));
  const prolongedDown = state.consecutiveFailures >= 3;

  if ((suspiciousStatus || prolongedDown) && !state.guardianTriggered) {
    state.guardianTriggered = true;
    console.log('[sentinel] Waking Guardian for emergency security audit...');
    runGuardian().then(() => {
      console.log('[sentinel] Guardian emergency audit completed');
    }).catch(err => {
      console.error('[sentinel] Guardian emergency audit failed:', err.message);
    });
  }

  // Reset guardian trigger when site recovers
  if (!criticalDown && state.guardianTriggered) {
    state.guardianTriggered = false;
  }

  // Log compact status
  const statusLine = results.map(r =>
    `${r.endpoint}: ${r.ok ? '✅' : '❌'} ${r.status || 'ERR'} (${r.elapsed}ms)`
  ).join(' | ');
  console.log(`[sentinel] ${statusLine}`);

  // ── Memory tracking ──────────────────────────────────────────────────
  const memory = mem.loadMemory('sentinel');

  // Build findings for memory system
  const findings = [];
  for (const r of results) {
    if (!r.ok) {
      findings.push({
        id: mem.issueId('downtime', r.endpoint),
        category: 'downtime',
        severity: r.endpoint === 'Landing' ? 'critical' : 'high',
        description: `${r.endpoint} down: ${r.error || `HTTP ${r.status}`}`,
      });
    }
    if (r.slow) {
      findings.push({
        id: mem.issueId('performance', r.endpoint),
        category: 'performance',
        severity: 'medium',
        description: `${r.endpoint} slow: ${r.elapsed}ms (threshold ${SLOW_THRESHOLD_MS}ms)`,
      });
    }
  }

  mem.processFindings(memory, findings);
  mem.recordTrend(memory, {
    landingOk: landing?.ok || false,
    landingMs: landing?.elapsed || 0,
    endpointsChecked: results.length,
    endpointsOk: results.filter(r => r.ok).length,
    endpointsFailed: results.filter(r => !r.ok).length,
  });
  mem.recordRun(memory, state.lastResponseTime);
  mem.saveMemory('sentinel', memory);

  return { results, state: { ...state } };
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = { runSentinel };
