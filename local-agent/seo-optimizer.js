'use strict';

/**
 * SEO OPTIMIZER AGENT — Daily Google Search Console analysis
 *
 * Runs daily. Collects GSC metrics (search analytics, sitemaps, URL inspection),
 * detects anomalies via thresholds, then sends to Claude Opus for diagnosis
 * and actionable fixes.
 *
 * Tasks:
 * 1. Collect 7d search analytics (queries + pages) with previous 7d comparison
 * 2. Check sitemap status (submitted vs indexed)
 * 3. URL inspection for key pages
 * 4. Detect anomalies (CTR drop, position loss, click drop, index gaps)
 * 5. Claude Opus analysis with auto-fix actions
 * 6. Save report + email alert if issues found
 *
 * Output: reports/seo-optimizer-YYYY-MM-DD.json + email alert if issues found
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { guardedCall } = require('./api-guard');
const { sendEmail } = require('./reports');
const mem = require('./agent-memory');
const { registerFixes, applyFixes } = require('./auto-fix');

const REPORTS_DIR = path.join(__dirname, 'reports');

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GSC_REFRESH_TOKEN;
const SITE_URL = 'sc-domain:ytubviral.com';

const KEY_PAGES = [
  'https://ytubviral.com/',
  'https://ytubviral.com/blog',
  'https://ytubviral.com/features/seo-score',
  'https://ytubviral.com/pricing',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function dateStr(offsetDays = 0) {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().split('T')[0];
}

// ── GSC Auth & Fetch ──────────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('GSC token failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function gscFetch(token, endpoint, body = null) {
  const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}`;
  const opts = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
  const res = await fetch(`${base}${endpoint}`, opts);
  if (!res.ok) throw new Error(`GSC API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function requestIndexing(token, url) {
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  });
  return { status: res.status, data: await res.json() };
}

async function inspectUrl(token, url) {
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL }),
  });
  if (!res.ok) throw new Error(`URL Inspection ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Metrics Collection ────────────────────────────────────────────────────────

async function collectSeoMetrics(token) {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('GSC credentials not configured (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GSC_REFRESH_TOKEN)');
  }

  const metrics = {};

  // Date ranges: current 7d and previous 7d (GSC data has ~2 day lag)
  const current7dEnd = dateStr(1);   // yesterday
  const current7dStart = dateStr(8);
  const prev7dEnd = dateStr(8);
  const prev7dStart = dateStr(15);

  // 1. Search analytics — current + previous 7d (queries and pages)
  const [currentByQuery, currentByPage, prevByQuery, prevByPage] = await Promise.all([
    gscFetch(token, '/searchAnalytics/query', {
      startDate: current7dStart, endDate: current7dEnd,
      dimensions: ['query'], rowLimit: 50,
    }),
    gscFetch(token, '/searchAnalytics/query', {
      startDate: current7dStart, endDate: current7dEnd,
      dimensions: ['page'], rowLimit: 50,
    }),
    gscFetch(token, '/searchAnalytics/query', {
      startDate: prev7dStart, endDate: prev7dEnd,
      dimensions: ['query'], rowLimit: 50,
    }),
    gscFetch(token, '/searchAnalytics/query', {
      startDate: prev7dStart, endDate: prev7dEnd,
      dimensions: ['page'], rowLimit: 50,
    }),
  ]);

  // Aggregate totals from rows (impression-weighted averages)
  function aggregateRows(data) {
    const rows = data.rows || [];
    let clicks = 0, impressions = 0, ctrSum = 0, posSum = 0;
    for (const r of rows) {
      clicks += r.clicks;
      impressions += r.impressions;
      ctrSum += r.ctr * r.impressions;
      posSum += r.position * r.impressions;
    }
    return {
      clicks,
      impressions,
      ctr: impressions > 0 ? ctrSum / impressions : 0,
      position: impressions > 0 ? posSum / impressions : 0,
    };
  }

  metrics.current = {
    period: `${current7dStart} to ${current7dEnd}`,
    totals: aggregateRows(currentByQuery),
    topQueries: (currentByQuery.rows || []).slice(0, 20).map(r => ({
      query: r.keys[0], clicks: r.clicks, impressions: r.impressions,
      ctr: r.ctr, position: r.position,
    })),
    topPages: (currentByPage.rows || []).slice(0, 20).map(r => ({
      page: r.keys[0].replace('https://ytubviral.com', ''), clicks: r.clicks,
      impressions: r.impressions, ctr: r.ctr, position: r.position,
    })),
  };

  metrics.previous = {
    period: `${prev7dStart} to ${prev7dEnd}`,
    totals: aggregateRows(prevByQuery),
    topQueries: (prevByQuery.rows || []).slice(0, 20).map(r => ({
      query: r.keys[0], clicks: r.clicks, impressions: r.impressions,
      ctr: r.ctr, position: r.position,
    })),
  };

  // 2. Sitemap status
  try {
    const sitemaps = await gscFetch(token, '/sitemaps');
    metrics.sitemaps = [];
    if (sitemaps.sitemap) {
      for (const s of sitemaps.sitemap) {
        const entry = { path: s.path, errors: s.errors, warnings: s.warnings, contents: [] };
        if (s.contents) {
          for (const c of s.contents) {
            entry.contents.push({ type: c.type, submitted: c.submitted, indexed: c.indexed });
          }
        }
        metrics.sitemaps.push(entry);
      }
    }
  } catch (e) {
    metrics.sitemaps = [{ error: e.message }];
  }

  // 3. URL inspection for key pages
  metrics.keyPages = [];
  for (const url of KEY_PAGES) {
    try {
      const data = await inspectUrl(token, url);
      const result = data.inspectionResult?.indexStatusResult;
      metrics.keyPages.push({
        url: url.replace('https://ytubviral.com', '') || '/',
        verdict: result?.verdict ?? 'unknown',
        coverageState: result?.coverageState ?? 'unknown',
        lastCrawl: result?.lastCrawlTime ?? 'never',
        pageFetchState: result?.pageFetchState ?? 'unknown',
        indexed: result?.verdict === 'PASS',
      });
    } catch (e) {
      metrics.keyPages.push({
        url: url.replace('https://ytubviral.com', '') || '/',
        error: e.message, indexed: false,
      });
    }
  }

  return metrics;
}

// ── Anomaly Detection ─────────────────────────────────────────────────────────

function detectAnomalies(metrics) {
  const issues = [];
  const curTotals = metrics.current.totals;
  const prevTotals = metrics.previous.totals;

  // CTR dropped >20% week-over-week
  if (prevTotals.ctr > 0) {
    const ctrChange = (curTotals.ctr - prevTotals.ctr) / prevTotals.ctr;
    if (ctrChange < -0.20) {
      issues.push(`SEO_CTR: CTR dropped ${Math.abs(ctrChange * 100).toFixed(0)}% (${(prevTotals.ctr * 100).toFixed(2)}% -> ${(curTotals.ctr * 100).toFixed(2)}%)`);
    }
  }

  // Average position worsened by >2 spots (higher number = worse)
  if (prevTotals.position > 0) {
    const posDelta = curTotals.position - prevTotals.position;
    if (posDelta > 2) {
      issues.push(`SEO_POSITION: avg position worsened by ${posDelta.toFixed(1)} (${prevTotals.position.toFixed(1)} -> ${curTotals.position.toFixed(1)})`);
    }
  }

  // Clicks dropped >30% week-over-week
  if (prevTotals.clicks > 0) {
    const clickChange = (curTotals.clicks - prevTotals.clicks) / prevTotals.clicks;
    if (clickChange < -0.30) {
      issues.push(`SEO_CLICKS: Clicks dropped ${Math.abs(clickChange * 100).toFixed(0)}% (${prevTotals.clicks} -> ${curTotals.clicks})`);
    }
  }

  // Indexed pages < 80% of submitted
  let totalSubmitted = 0, totalIndexed = 0;
  for (const sitemap of metrics.sitemaps) {
    if (sitemap.error) continue;
    for (const c of sitemap.contents || []) {
      totalSubmitted += parseInt(c.submitted) || 0;
      totalIndexed += parseInt(c.indexed) || 0;
    }
  }
  if (totalSubmitted > 0) {
    const indexRate = totalIndexed / totalSubmitted;
    if (indexRate < 0.80) {
      issues.push(`SEO_INDEXING: Only ${(indexRate * 100).toFixed(1)}% indexed (${totalIndexed}/${totalSubmitted} pages)`);
    }
  }

  // Key pages not indexed
  for (const page of metrics.keyPages) {
    if (!page.indexed && !page.error) {
      issues.push(`SEO_NOINDEX: ${page.url} not indexed — verdict: ${page.verdict}, coverage: ${page.coverageState}`);
    }
  }

  return issues;
}

// ── Robust JSON Parsing (same pattern as social-optimizer) ────────────────────

function parseClaudeJson(raw) {
  // Strip markdown fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) raw = fenceMatch[1].trim();

  // Try direct parse of JSON object
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }

  // Repair truncated JSON (more open braces than close)
  const openBraces = (raw.match(/\{/g) || []).length;
  const closeBraces = (raw.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    let patched = raw.replace(/,\s*"[^"]*"?\s*:?\s*[^,}]*$/, '');
    patched += '}'.repeat(openBraces - closeBraces);
    const patchedMatch = patched.match(/\{[\s\S]*\}/);
    if (patchedMatch) {
      try { return JSON.parse(patchedMatch[0]); } catch {}
    }
  }

  throw new Error('No valid JSON found in Claude response');
}

// ── Auto-Fix Registration ─────────────────────────────────────────────────────

registerFixes('seo-optimizer', [
  {
    id: 'claude-seo-diagnosis',
    description: 'Claude Opus analiza tendencias SEO y propone acciones correctivas',
    cooldownMs: 86400000, // 1 day — faster retry on persistent issues
    condition: (issues) => issues.length > 0,
    apply: async (config, issues, metrics) => {
      const { loadFixLog } = require('./auto-fix');
      const fixLog = loadFixLog();
      const recentFixes = fixLog.fixes
        .filter(f => f.agent === 'seo-optimizer')
        .slice(-5)
        .map(f => ({ fix: f.fixId, detail: f.detail, outcome: f.outcome, date: f.timestamp?.slice(0, 10) }));

      const curTotals = metrics.current?.totals || {};
      const prevTotals = metrics.previous?.totals || {};

      const userPrompt = `PROBLEMAS SEO DETECTADOS:
${issues.join('\n')}

METRICAS ACTUALES (${metrics.current?.period || '7d'}):
- Clicks: ${curTotals.clicks || 0}
- Impressions: ${curTotals.impressions || 0}
- CTR: ${((curTotals.ctr || 0) * 100).toFixed(2)}%
- Avg Position: ${(curTotals.position || 0).toFixed(1)}

PERIODO ANTERIOR (${metrics.previous?.period || '7d prev'}):
- Clicks: ${prevTotals.clicks || 0}
- Impressions: ${prevTotals.impressions || 0}
- CTR: ${((prevTotals.ctr || 0) * 100).toFixed(2)}%
- Avg Position: ${(prevTotals.position || 0).toFixed(1)}

TOP QUERIES:
${JSON.stringify((metrics.current?.topQueries || []).slice(0, 10), null, 2)}

TOP PAGES:
${JSON.stringify((metrics.current?.topPages || []).slice(0, 10), null, 2)}

SITEMAPS:
${JSON.stringify(metrics.sitemaps || [], null, 2)}

KEY PAGES:
${JSON.stringify(metrics.keyPages || [], null, 2)}

HISTORIAL FIXES RECIENTES:
${JSON.stringify(recentFixes, null, 2)}`;

      const diagnosisResult = await guardedCall(userPrompt, {
        maxTokens: 2500,
        agentId: 'seo-optimizer',
        system: `Eres el analista SEO del sistema de auto-mejora de YTubViral (ytubviral.com). Analizas metricas de Google Search Console y diagnosticas problemas con razonamiento profundo.

CONTEXTO: YTubViral es una herramienta IA para YouTubers. El sitio tiene landing, blog (16+ articulos), paginas de features, pricing. Desplegado en Vercel.

PUEDES PROPONER estas acciones:
1. "resubmit_urls" — URLs a re-enviar para indexacion via Google Indexing API (array de strings, URLs completas)
2. "alert" — alerta por email con diagnostico y prioridad ("high"/"medium"/"low")

REGLAS:
- Analiza la CAUSA raiz, no solo el sintoma
- Si CTR baja pero impressions suben, puede ser buena senal (mas queries de cola larga)
- Si position empeora para queries principales, es serio
- Solo propon resubmit para URLs que realmente necesitan re-indexacion
- No alarmes por fluctuaciones normales (<10%)

Responde en JSON:
{
  "diagnosis": "resumen del estado SEO en 2-3 frases",
  "actions": [
    { "type": "resubmit_urls", "urls": ["https://ytubviral.com/blog/..."] },
    { "type": "alert", "priority": "high", "message": "..." }
  ] | null,
  "reasoning": "por que propones cada accion"
}

Responde SOLO con el JSON.`,
      });

      if (!diagnosisResult?.text) {
        return { changed: false, detail: 'Claude SEO diagnosis: no response' };
      }

      let claudeResponse;
      try {
        claudeResponse = parseClaudeJson(diagnosisResult.text);
      } catch (e) {
        console.warn(`[seo-optimizer] JSON parse failed: ${e.message}. Raw: ${diagnosisResult.text.slice(0, 200)}`);
        return { changed: false, detail: `Claude SEO diagnosis: parse error — ${e.message}` };
      }

      if (!claudeResponse.actions || claudeResponse.actions.length === 0) {
        return { changed: false, detail: `Claude SEO diagnosis: ${claudeResponse.diagnosis} — no actions needed` };
      }

      // Get a fresh token for API calls
      let token;
      try { token = await getAccessToken(); } catch (e) {
        return { changed: false, detail: `Claude SEO diagnosis: token refresh failed — ${e.message}` };
      }

      const applied = [];
      for (const action of claudeResponse.actions) {
        if (action.type === 'resubmit_urls' && Array.isArray(action.urls)) {
          const validUrls = action.urls.filter(u => u.startsWith('https://ytubviral.com'));
          let resubmitted = 0;
          for (const url of validUrls.slice(0, 10)) { // max 10 URLs per run
            const { status } = await requestIndexing(token, url);
            if (status === 200) resubmitted++;
          }
          applied.push(`Resubmitted ${resubmitted}/${validUrls.length} URLs for indexing`);
        } else if (action.type === 'alert' && action.message) {
          const priority = action.priority || 'medium';
          await sendEmail(
            `[YTubViral SEO] ${priority.toUpperCase()}: ${(claudeResponse.diagnosis || '').slice(0, 60)}`,
            `DIAGNOSTICO SEO (Claude Opus):\n\n${claudeResponse.diagnosis}\n\n${action.message}\n\nRAZONAMIENTO: ${claudeResponse.reasoning}`
          ).catch(e => console.warn(`[seo-optimizer] Email failed: ${e.message}`));
          applied.push(`Alert sent (${priority})`);
        }
      }

      return {
        changed: applied.length > 0,
        detail: `Claude SEO: ${claudeResponse.diagnosis}. ${applied.join('; ')}`,
      };
    },
  },
]);

// ── Main Orchestrator ─────────────────────────────────────────────────────────

async function runSeoOptimizer() {
  console.log('[seo-optimizer] Starting daily SEO analysis...');
  ensureDir(REPORTS_DIR);

  try {
    await db.initDb();

    // 1. Get GSC access token
    const token = await getAccessToken();

    // 2. Collect all SEO metrics
    const metrics = await collectSeoMetrics(token);
    console.log(`[seo-optimizer] Metrics collected: ${metrics.current.totals.clicks} clicks, ${metrics.current.totals.impressions} impressions`);

    // 3. Detect anomalies
    const issues = detectAnomalies(metrics);
    console.log(`[seo-optimizer] ${issues.length} anomalies detected`);

    // 4. Apply auto-fixes + self-improvement (always run, even with 0 issues)
    let appliedFixes = await applyFixes('seo-optimizer', issues, metrics);
    if (appliedFixes.length > 0) {
      console.log(`[seo-optimizer] Auto-fixed ${appliedFixes.length} issue(s)`);
    }

    // 5. Build and save report
    const today = new Date().toISOString().slice(0, 10);
    const report = {
      date: today,
      metrics: {
        current: metrics.current,
        previous: metrics.previous,
        sitemaps: metrics.sitemaps,
        keyPages: metrics.keyPages,
      },
      analysis: {
        issues,
        anomalyCount: issues.length,
      },
    };
    if (appliedFixes.length > 0) report.autoFixes = appliedFixes;

    const reportFile = path.join(REPORTS_DIR, `seo-optimizer-${today}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`[seo-optimizer] Report saved: ${reportFile}`);

    // 6. Update agent memory
    try {
      const findings = issues.map(i => ({
        id: mem.issueId(i.slice(0, 50)),
        description: i,
        severity: i.includes('NOINDEX') || i.includes('CLICKS') ? 'high' : 'medium',
      }));
      mem.processFindings('seo-optimizer', findings);
    } catch (e) { /* memory not critical */ }

    // 7. Send summary email if there are issues
    if (issues.length > 0) {
      const curT = metrics.current.totals;
      const prevT = metrics.previous.totals;
      const emailBody = [
        '=== SEO OPTIMIZER — Daily analysis ===',
        `Date: ${today}`,
        '',
        '-- ANOMALIES DETECTED --',
        ...issues.map(i => `  * ${i}`),
        '',
        `-- CURRENT PERIOD (${metrics.current.period}) --`,
        `Clicks: ${curT.clicks}`,
        `Impressions: ${curT.impressions}`,
        `CTR: ${(curT.ctr * 100).toFixed(2)}%`,
        `Avg Position: ${curT.position.toFixed(1)}`,
        '',
        `-- PREVIOUS PERIOD (${metrics.previous.period}) --`,
        `Clicks: ${prevT.clicks}`,
        `Impressions: ${prevT.impressions}`,
        `CTR: ${(prevT.ctr * 100).toFixed(2)}%`,
        `Avg Position: ${prevT.position.toFixed(1)}`,
        '',
        '-- KEY PAGES --',
        ...metrics.keyPages.map(p => `  ${p.url}: ${p.indexed ? 'INDEXED' : 'NOT INDEXED'} (${p.verdict})`),
        '',
        appliedFixes.length > 0
          ? `-- AUTO-FIXES APPLIED --\n${appliedFixes.map(f => `  ${typeof f === 'string' ? f : f.detail || JSON.stringify(f)}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n');

      await sendEmail('[YTubViral] SEO Optimizer — Daily report', emailBody);
    }

    console.log(`[seo-optimizer] Analysis complete: ${issues.length} issues found`);
    return report;
  } catch (err) {
    console.error('[seo-optimizer] Error:', err.message);
    return null;
  }
}

module.exports = { runSeoOptimizer };
