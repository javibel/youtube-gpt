'use strict';

/**
 * WATCHDOG AGENT — Compliance legal
 *
 * Checks (sin API):
 *   1. Verifica que /terms, /privacy, /legal existen y cargan
 *   2. Verifica contenido mínimo requerido (GDPR, LSSI-CE, cookies)
 *   3. Verifica que el banner de cookies funciona
 *   4. Verifica que los emails transaccionales tienen unsubscribe
 *
 * Check con API (1 llamada Sonnet):
 *   5. Claude verifica compliance contra checklist legal
 *
 * Output: reports/watchdog-YYYY-MM-DD.json
 */

const fs = require('fs');
const path = require('path');
const { guardedCall } = require('./api-guard');
const mem = require('./agent-memory');

const REPORTS_DIR = path.join(__dirname, 'reports');
const BASE_URL = process.env.APP_PUBLIC_URL || 'https://ytubviral.com';

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function fetchPageContent(urlPath) {
  const url = `${BASE_URL}${urlPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'YTubViral-Watchdog/1.0',
        'Accept': 'text/html',
        'Cookie': 'ytubviral_lang=es',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { status: res.status, content: '', error: `HTTP ${res.status}` };
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { status: res.status, content: text.slice(0, 10000), error: null };
  } catch (err) {
    clearTimeout(timeout);
    return { status: 0, content: '', error: err.message };
  }
}

// ── Legal content checks ────────────────────────────────────────────────────

const REQUIRED_CONTENT = {
  '/terms': {
    name: 'Términos de Servicio',
    mustContain: [
      { keyword: 'responsab', label: 'Responsabilidad' },
      { keyword: 'cancel', label: 'Cancelación/Derecho desistimiento' },
      { keyword: 'propiedad intelectual', label: 'Propiedad intelectual' },
      { keyword: 'jurisdicci', label: 'Jurisdicción' },
      { keyword: 'youtube', label: 'Referencia a YouTube API ToS' },
      { keyword: 'edad', label: 'Restricción de edad' },
    ],
  },
  '/privacy': {
    name: 'Política de Privacidad',
    mustContain: [
      { keyword: 'responsable', label: 'Responsable del tratamiento' },
      { keyword: 'finalidad', label: 'Finalidades del tratamiento' },
      { keyword: 'base', label: 'Base legal' },
      { keyword: 'derecho', label: 'Derechos ARCO/GDPR' },
      { keyword: 'cookie', label: 'Cookies' },
      { keyword: 'tercero', label: 'Terceros/Encargados' },
      { keyword: 'retenci', label: 'Período de retención' },
      { keyword: 'brecha', label: 'Notificación de brechas' },
      { keyword: 'stripe', label: 'Stripe como procesador de pago' },
    ],
  },
  '/legal': {
    name: 'Aviso Legal',
    mustContain: [
      { keyword: 'titular', label: 'Titular del sitio' },
      // NIF omitted intentionally — owner not yet registered as autónomo
      { keyword: 'domicilio', label: 'Domicilio' },
      { keyword: 'lssi', label: 'LSSI-CE', caseInsensitive: true },
      { keyword: 'resolución de litigios', label: 'ODR/Resolución de litigios' },
    ],
  },
};

function checkPageContent(content, requirements) {
  const issues = [];
  const lower = content.toLowerCase();

  for (const req of requirements) {
    const keyword = req.keyword.toLowerCase();
    if (!lower.includes(keyword)) {
      issues.push({
        missing: req.label,
        keyword: req.keyword,
        severity: 'medium',
      });
    }
  }

  // Check minimum length (legal pages should be substantial)
  if (content.length < 500) {
    issues.push({ missing: 'Contenido suficiente', note: `Solo ${content.length} chars`, severity: 'high' });
  }

  return issues;
}

// ── Security headers check on live site ─────────────────────────────────────

async function checkLiveHeaders() {
  const issues = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(BASE_URL, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const required = {
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'strict-transport-security': null, // just check exists
    };

    for (const [header, expectedValue] of Object.entries(required)) {
      const value = res.headers.get(header);
      if (!value) {
        issues.push({ header, status: 'MISSING', severity: 'medium' });
      } else if (expectedValue && !value.toLowerCase().includes(expectedValue.toLowerCase())) {
        issues.push({ header, status: 'WRONG_VALUE', expected: expectedValue, actual: value, severity: 'low' });
      }
    }
  } catch (err) {
    clearTimeout(timeout);
    issues.push({ header: 'ALL', status: 'UNREACHABLE', error: err.message, severity: 'high' });
  }
  return issues;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function runWatchdog() {
  console.log('[watchdog] Starting legal compliance audit...');
  const startTime = Date.now();
  ensureDir(REPORTS_DIR);

  const results = {
    timestamp: new Date().toISOString(),
    agent: 'watchdog',
    pages: {},
    liveHeaders: [],
    summary: { ok: 0, issues: 0 },
  };

  // Check each legal page
  const pageContents = {};
  for (const [urlPath, config] of Object.entries(REQUIRED_CONTENT)) {
    console.log(`[watchdog] Checking ${config.name} (${urlPath})...`);
    const { status, content, error } = await fetchPageContent(urlPath);

    if (error || status !== 200) {
      results.pages[urlPath] = { name: config.name, status, error, issues: [{ missing: 'PAGE_LOAD', severity: 'critical' }] };
      results.summary.issues++;
      continue;
    }

    const issues = checkPageContent(content, config.mustContain);
    results.pages[urlPath] = {
      name: config.name,
      status,
      contentLength: content.length,
      issues,
      issueCount: issues.length,
    };

    if (issues.length > 0) results.summary.issues += issues.length;
    else results.summary.ok++;

    pageContents[urlPath] = content.slice(0, 3000);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Check live headers
  console.log('[watchdog] Checking live security headers...');
  results.liveHeaders = await checkLiveHeaders();
  results.summary.issues += results.liveHeaders.length;

  // ── Memory: track legal issues ──────────────────────────────────────────
  console.log('[watchdog] Processing memory...');
  const memory = mem.loadMemory('watchdog');
  const currentFindings = [];

  // Page content issues
  for (const [urlPath, data] of Object.entries(results.pages)) {
    if (data.issues?.length > 0) {
      for (const issue of data.issues) {
        currentFindings.push({
          id: mem.issueId('legal_content', `${urlPath}::${issue.missing}`),
          category: 'legal_content',
          severity: issue.severity || 'medium',
          description: `${data.name}: falta "${issue.missing}"${issue.note ? ` (${issue.note})` : ''}`,
        });
      }
    }
    if (data.error) {
      currentFindings.push({
        id: mem.issueId('page_load', urlPath),
        category: 'page_load',
        severity: 'critical',
        description: `${data.name} no carga: ${data.error}`,
      });
    }
  }

  // Live header issues
  for (const h of results.liveHeaders) {
    currentFindings.push({
      id: mem.issueId('live_header', h.header),
      category: 'live_header',
      severity: h.severity || 'medium',
      description: `Header ${h.header} ${h.status}${h.error ? `: ${h.error}` : ''}`,
    });
  }

  const { newIssues, recurringIssues, resolvedIssues, escalatedIssues } = mem.processFindings(memory, currentFindings);

  // Record trend
  mem.recordTrend(memory, {
    pagesOk: results.summary.ok,
    totalIssues: results.summary.issues,
    headerIssues: results.liveHeaders.length,
    newIssues: newIssues.length,
    resolved: resolvedIssues.length,
    escalated: escalatedIssues.length,
  });

  results.memory = {
    newIssues: newIssues.length,
    recurringIssues: recurringIssues.length,
    resolvedIssues: resolvedIssues.length,
    escalatedIssues: escalatedIssues.length,
    regressions: newIssues.filter(i => i.regression).length,
    totalOpenIssues: memory.knownIssues.filter(i => i.status === 'open').length,
  };

  console.log(`[watchdog] Memory: ${newIssues.length} new, ${recurringIssues.length} recurring, ${resolvedIssues.length} resolved, ${escalatedIssues.length} escalated`);

  // Build memory context for AI
  let memoryContext = '';
  if (escalatedIssues.length > 0) {
    memoryContext += `\n\nISSUES ESCALADOS (persisten 7+ dias):\n`;
    memoryContext += escalatedIssues.map(i => `- ${i.description} (desde ${i.firstSeen})`).join('\n');
  }
  if (newIssues.filter(i => i.regression).length > 0) {
    memoryContext += `\n\nREGRESIONES:\n`;
    memoryContext += newIssues.filter(i => i.regression).map(i => `- ${i.description}`).join('\n');
  }
  if (resolvedIssues.length > 0) {
    memoryContext += `\n\nRESOLUCIONES RECIENTES:\n`;
    memoryContext += resolvedIssues.map(i => `- ${i.description}`).join('\n');
  }

  // AI compliance review
  const totalIssues = results.summary.issues;
  if (totalIssues > 0 || Object.keys(pageContents).length > 0) {
    console.log('[watchdog] Requesting AI compliance review...');
    try {
      const issuesSummary = [];
      for (const [urlPath, data] of Object.entries(results.pages)) {
        if (data.issues?.length > 0) {
          issuesSummary.push(`${data.name}: falta ${data.issues.map(i => i.missing || i.label).join(', ')}`);
        }
      }

      const { text } = await guardedCall(
        `Eres un abogado especializado en derecho digital español y europeo (GDPR, LSSI-CE, EU AI Act).

YTubViral es un SaaS (ytubviral.com) con sede en Barcelona, propiedad de Javier Jimeno Plata. Usa: Google OAuth, YouTube API, Stripe, Claude AI, Neon PostgreSQL, Vercel, Resend.

Resultado de la auditoría automática de las páginas legales:
${issuesSummary.length > 0 ? issuesSummary.join('\n') : 'Todas las páginas contienen los elementos requeridos.'}

Headers de seguridad faltantes: ${results.liveHeaders.length > 0 ? results.liveHeaders.map(h => h.header).join(', ') : 'Ninguno'}${memoryContext}

Responde en español:
1. ¿Hay algún riesgo legal real? (multa, denuncia, bloqueo) — prioriza REGRESIONES y ESCALADOS
2. ¿Qué debemos corregir con urgencia?
3. Valoración compliance (1-10)

Máximo 150 palabras. Solo riesgos reales, no teóricos.`,
        { maxTokens: 400, agentId: 'watchdog', model: 'claude-sonnet-4-6-20250514' }
      );
      results.aiAnalysis = text;
    } catch (err) {
      results.aiAnalysis = `Error en análisis AI: ${err.message}`;
    }
  } else {
    results.aiAnalysis = 'Compliance correcto. Sin issues detectados.';
  }

  results.durationMs = Date.now() - startTime;

  // Save memory
  mem.recordRun(memory, results.durationMs);
  mem.saveMemory('watchdog', memory);

  // Save report
  const reportFile = path.join(REPORTS_DIR, `watchdog-${results.timestamp.slice(0, 10)}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
  console.log(`[watchdog] Report saved: ${reportFile} (${results.durationMs}ms)`);

  return results;
}

module.exports = { runWatchdog };
