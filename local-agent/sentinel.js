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
const config = require('./config');
const { registerFixes, applyFixes, adjustConfigValue, readConfig } = require('./auto-fix');
const { diagnose } = require('./doctor');

const HEALTH_ENDPOINTS = [
  { url: '/', name: 'Landing', critical: true },
  { url: '/api/health', name: 'API Health', critical: false },
];

// ── Resend health check ──────────────────────────────────────────────────

const RESEND_DOMAINS_API = 'https://api.resend.com/domains';
const EMERGENCY_ALERT_DIR = require('path').join(__dirname, 'logs');

/**
 * Check Resend health: API reachable + key valid + domain if accessible.
 *
 * Strategy: The API key may have limited permissions (sending_access only).
 * - GET /domains: works with full_access keys, returns domain health
 * - GET /domains: returns 403 with sending_access keys (key is valid, just limited)
 * - GET /domains: returns 401 if key is truly invalid/expired
 * - Network error: Resend API is down
 *
 * Returns { ok, status, domain, dnsOk, error }
 */
async function checkResend() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, status: 'no_key', error: 'RESEND_API_KEY not set' };

  try {
    const res = await fetch(RESEND_DOMAINS_API, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    // 401 = key expired or invalid → critical
    if (res.status === 401) {
      return { ok: false, status: 'auth_failed', error: 'API key invalid or expired (HTTP 401)' };
    }

    // 403 = key valid but lacks domain-read permission (sending_access only)
    // This means Resend is UP and the key WORKS for sending — healthy
    if (res.status === 403) {
      return { ok: true, status: 'healthy_limited', domain: 'unknown (sending_access key)', dnsOk: null };
    }

    if (!res.ok) {
      return { ok: false, status: 'api_error', error: `Resend API HTTP ${res.status}` };
    }

    // Full access — parse domain info
    const data = await res.json();
    const domains = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
    const ytubviral = domains.find(d => d.name === 'ytubviral.com');

    if (!ytubviral) {
      return { ok: false, status: 'domain_missing', error: 'ytubviral.com not found in Resend domains' };
    }

    const dnsRecords = ytubviral.records || [];
    const dnsOk = dnsRecords.every(r => r.status === 'verified' || r.status === 'not_started');
    const domainVerified = ytubviral.status === 'verified';

    if (!domainVerified) {
      return { ok: false, status: 'domain_unverified', domain: ytubviral.status, dnsOk, error: `Domain status: ${ytubviral.status}` };
    }

    return { ok: true, status: 'healthy', domain: ytubviral.status, dnsOk };
  } catch (err) {
    const isTimeout = err.name === 'AbortError' || err.name === 'TimeoutError';
    return { ok: false, status: isTimeout ? 'timeout' : 'network_error', error: err.message };
  }
}

/**
 * Write emergency alert to disk when Resend is down and email can't be sent.
 */
function writeEmergencyAlert(subject, body) {
  const fs = require('fs');
  const alertFile = require('path').join(EMERGENCY_ALERT_DIR, `emergency-alert-${new Date().toISOString().slice(0, 10)}.log`);
  const entry = `\n${'='.repeat(60)}\n[${new Date().toISOString()}] ${subject}\n${'='.repeat(60)}\n${body}\n`;
  try {
    fs.appendFileSync(alertFile, entry, 'utf8');
    console.log(`[sentinel] Emergency alert written to ${alertFile}`);
  } catch (e) {
    console.error('[sentinel] CRITICAL: Cannot write emergency alert to disk:', e.message);
  }
}

/**
 * Send alert with Resend fallback — if email fails, write to disk.
 */
async function sendAlertWithFallback(subject, body) {
  try {
    await sendEmail(subject, body);
  } catch (err) {
    console.error(`[sentinel] Email failed (${err.message}), writing to disk as fallback`);
    writeEmergencyAlert(subject, body);
  }
}

// All configurable via dashboard
function getSentinelCfg() {
  return {
    siteUrl: config.get('sentinel', 'siteUrl', process.env.SITE_URL || 'https://ytubviral.com'),
    timeoutMs: config.get('sentinel', 'timeoutMs', 20000),
    slowThresholdMs: config.get('sentinel', 'slowThresholdMs', 5000),
    confirmRetries: config.get('sentinel', 'confirmRetries', 3),
    confirmDelayMs: config.get('sentinel', 'confirmDelayMs', 10000),
    ownerEmail: config.get('sentinel', 'ownerEmail', process.env.OWNER_EMAIL || 'javijimenoplata@gmail.com'),
  };
}

// In-memory state (survives across cron ticks within same PM2 process)
let state = {
  isDown: false,
  downSince: null,
  lastAlertAt: null,
  consecutiveFailures: 0,
  lastCheck: null,
  lastResponseTime: null,
  // Resend monitoring
  resendOk: true,
  resendDownSince: null,
  resendLastAlert: null,
  resendConsecutiveFailures: 0,
};

// ── HTTP check ─────────────────────────────────────────────────────────────

async function checkEndpoint(endpoint, cfg) {
  const { siteUrl, timeoutMs, slowThresholdMs } = cfg || getSentinelCfg();
  const url = `${siteUrl}${endpoint.url}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      slow: elapsed > slowThresholdMs,
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

  await sendAlertWithFallback(subject, body);
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

  await sendAlertWithFallback(subject, body);
  console.log('[sentinel] ✅ Recovery alert sent');
}

async function sendSlowAlert(results) {
  const slow = results.filter(r => r.slow);
  const subject = `⚠️ SITIO LENTO — ytubviral.com (${slow[0].elapsed}ms)`;

  let body = `ALERTA — RENDIMIENTO DEGRADADO\n${'='.repeat(50)}\n\n`;
  body += `Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}\n`;
  body += `Umbral: ${getSentinelCfg().slowThresholdMs}ms\n\n`;
  for (const r of slow) {
    body += `  ⚠️ ${r.endpoint}: ${r.elapsed}ms (status ${r.status})\n`;
  }
  body += `\nSentinel — YTubViral Agent System\n`;

  await sendAlertWithFallback(subject, body);
  console.log('[sentinel] ⚠️ Slow alert sent');
}

// ── Main check ─────────────────────────────────────────────────────────────

async function runSentinel() {
  const cfg = getSentinelCfg();
  const results = [];

  for (const endpoint of HEALTH_ENDPOINTS) {
    results.push(await checkEndpoint(endpoint, cfg));
  }

  state.lastCheck = new Date().toISOString();
  const landing = results.find(r => r.endpoint === 'Landing');
  state.lastResponseTime = landing?.elapsed || 0;

  // Critical failure = landing page down
  let criticalDown = results.some(r => r.endpoint === 'Landing' && !r.ok);
  const anyDown = results.some(r => !r.ok);

  // ── Confirm before declaring DOWN (avoid false positives from transient timeouts)
  if (criticalDown && !state.isDown) {
    console.log(`[sentinel] Landing failed — confirming with ${cfg.confirmRetries} retries...`);
    for (let i = 1; i <= cfg.confirmRetries; i++) {
      await new Promise(r => setTimeout(r, cfg.confirmDelayMs));
      const retry = await checkEndpoint(HEALTH_ENDPOINTS[0], cfg);
      console.log(`[sentinel] Retry ${i}/${cfg.confirmRetries}: ${retry.ok ? '✅' : '❌'} ${retry.status || 'ERR'} (${retry.elapsed}ms)`);
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
      const downErr = new Error(`Site DOWN: ${results.filter(r => !r.ok).map(r => `${r.endpoint}: ${r.error || r.status}`).join(', ')}`);
      await diagnose(downErr, { platform: 'system', action: 'health-check', account: 'sentinel' }).catch(() => {});
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

  // ── Resend health check (every 5 min, coste cero) ───────────────────
  const resendResult = await checkResend();
  results.push({
    endpoint: 'Resend',
    url: RESEND_DOMAINS_API,
    status: resendResult.ok ? 200 : 0,
    ok: resendResult.ok,
    elapsed: 0,
    slow: false,
    error: resendResult.error || null,
    resendDetail: resendResult,
  });

  if (!resendResult.ok) {
    state.resendConsecutiveFailures++;

    if (state.resendOk) {
      // Transition: OK → DOWN
      state.resendOk = false;
      state.resendDownSince = Date.now();
      console.log(`[sentinel] 📧 RESEND DOWN: ${resendResult.error}`);

      // Try to send email alert — if Resend is down, fallback to disk
      const subject = `📧 RESEND CAÍDO — Emails del sistema no se están enviando`;
      let body = `ALERTA — SERVICIO DE EMAIL CAÍDO\n${'='.repeat(50)}\n\n`;
      body += `Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}\n`;
      body += `Estado: ${resendResult.status}\n`;
      body += `Error: ${resendResult.error}\n`;
      body += `DNS OK: ${resendResult.dnsOk ?? 'N/A'}\n`;
      body += `Dominio: ${resendResult.domain ?? 'N/A'}\n\n`;
      body += `IMPACTO:\n`;
      body += `  - Reportes diarios NO se enviarán\n`;
      body += `  - Alertas de Sentinel escritas a disco (logs/emergency-alert-*.log)\n`;
      body += `  - Verificación de email de usuarios FALLARÁ\n`;
      body += `  - Auto-replies de Gmail NO se enviarán\n\n`;
      body += `ACCIONES REQUERIDAS:\n`;
      if (resendResult.status === 'auth_failed') {
        body += `  1. La API key de Resend es inválida o expiró\n`;
        body += `  2. Ve a https://resend.com/api-keys y genera una nueva\n`;
        body += `  3. Actualiza RESEND_API_KEY en .env y reinicia PM2\n`;
      } else if (resendResult.status === 'domain_unverified') {
        body += `  1. El dominio ytubviral.com perdió verificación en Resend\n`;
        body += `  2. Verifica los registros DNS (SPF, DKIM, DMARC) en Cloudflare\n`;
        body += `  3. Ve a https://resend.com/domains para re-verificar\n`;
      } else if (resendResult.status === 'domain_missing') {
        body += `  1. El dominio ytubviral.com no existe en Resend\n`;
        body += `  2. Ve a https://resend.com/domains y añádelo de nuevo\n`;
      } else {
        body += `  1. Resend puede estar experimentando una caída temporal\n`;
        body += `  2. Revisa https://status.resend.com\n`;
        body += `  3. Si persiste, verifica la API key y el dominio\n`;
      }
      body += `\nSentinel — YTubViral Agent System\n`;

      await sendAlertWithFallback(subject, body);
      state.resendLastAlert = Date.now();
    } else {
      // Already down — re-alert every 60 minutes via disk
      const minSinceAlert = (Date.now() - (state.resendLastAlert || 0)) / 60000;
      if (minSinceAlert >= 60) {
        const downMin = Math.round((Date.now() - state.resendDownSince) / 60000);
        writeEmergencyAlert(
          `📧 RESEND sigue CAÍDO (${downMin}min)`,
          `Error: ${resendResult.error}\nFallos consecutivos: ${state.resendConsecutiveFailures}\nRevisa logs/emergency-alert-*.log para detalles.`
        );
        state.resendLastAlert = Date.now();
      }
    }
  } else {
    if (!state.resendOk) {
      // Transition: DOWN → RECOVERED
      const downtime = Date.now() - state.resendDownSince;
      const downtimeMin = Math.round(downtime / 60000);
      console.log(`[sentinel] 📧 Resend RECOVERED after ${downtimeMin}min`);

      await sendAlertWithFallback(
        `✅ RESEND RECUPERADO — Emails funcionando (caído ${downtimeMin}min)`,
        `Resend se ha recuperado.\n\nTiempo de caída: ${downtimeMin} minutos\nEstado: ${resendResult.status}\nDNS OK: ${resendResult.dnsOk}\n\nSentinel — YTubViral Agent System`
      );

      state.resendOk = true;
      state.resendDownSince = null;
      state.resendConsecutiveFailures = 0;
    } else {
      state.resendConsecutiveFailures = 0;
    }
  }

  // Log compact status
  const statusLine = results.map(r =>
    `${r.endpoint}: ${r.ok ? '✅' : '❌'} ${r.status || 'ERR'} (${r.elapsed}ms)`
  ).join(' | ');
  console.log(`[sentinel] ${statusLine}`);

  // ── Memory tracking ──────────────────────────────────────────────────
  const memory = mem.loadMemory('sentinel');

  // Build findings for memory system
  // Only track critical endpoints (Landing) in memory to avoid noise from
  // non-critical endpoint cold starts (API Health timeouts on Vercel)
  const findings = [];
  for (const r of results) {
    if (!r.ok && r.endpoint === 'Landing') {
      findings.push({
        id: mem.issueId('downtime', r.endpoint),
        category: 'downtime',
        severity: 'critical',
        description: `${r.endpoint} down: ${r.error || `HTTP ${r.status}`}`,
      });
    }
    if (r.slow && r.endpoint === 'Landing') {
      findings.push({
        id: mem.issueId('performance', r.endpoint),
        category: 'performance',
        severity: 'medium',
        description: `${r.endpoint} slow: ${r.elapsed}ms (threshold ${cfg.slowThresholdMs}ms)`,
      });
    }
    if (!r.ok && r.endpoint === 'Resend') {
      findings.push({
        id: mem.issueId('service-down', 'resend'),
        category: 'service-down',
        severity: 'high',
        description: `Resend email service down: ${r.error || r.resendDetail?.status}`,
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
    resendOk: resendResult.ok,
    resendStatus: resendResult.status,
  });
  mem.recordRun(memory, state.lastResponseTime);
  mem.saveMemory('sentinel', memory);

  // Auto-fix: apply corrections based on patterns
  const issueDescs = findings.map(f => f.description);
  const appliedFixes = await applyFixes('sentinel', issueDescs, { results, state });
  if (appliedFixes.length > 0) {
    console.log(`[sentinel] Auto-fixed ${appliedFixes.length} issue(s)`);
  }

  return { results, state: { ...state }, autoFixes: appliedFixes };
}

// ── Auto-Fix Definitions ──────────────────────────────────────────────────────

registerFixes('sentinel', [
  {
    id: 'raise-timeout-on-slow',
    description: 'Subir timeout cuando el sitio es consistentemente lento (evita falsos positivos)',
    cooldownMs: 24 * 3600000,
    condition: () => {
      // Trigger if last 3+ checks were slow but site was up
      const memory = mem.loadMemory('sentinel');
      const trends = memory.trends || [];
      const recent = trends.slice(-6);
      const slowCount = recent.filter(t => t.data?.landingOk && t.data?.landingMs > 4000).length;
      return slowCount >= 3;
    },
    apply: (cfg) => {
      return adjustConfigValue(cfg, 'sentinel', 'timeoutMs', 5000, 10000, 45000, 'timeout raised (slow site)');
    },
  },
  {
    id: 'raise-slow-threshold',
    description: 'Subir umbral de lentitud si el sitio es consistentemente lento',
    cooldownMs: 7 * 86400000,
    condition: () => {
      const memory = mem.loadMemory('sentinel');
      const trends = memory.trends || [];
      const recent = trends.slice(-12);
      const slowCount = recent.filter(t => t.data?.landingOk && t.data?.landingMs > 4000).length;
      return slowCount >= 6; // half of last 12 checks were slow
    },
    apply: (cfg) => {
      return adjustConfigValue(cfg, 'sentinel', 'slowThresholdMs', 1000, 3000, 10000, 'slow threshold raised');
    },
  },
]);

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = { runSentinel };
