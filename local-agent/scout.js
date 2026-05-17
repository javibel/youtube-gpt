'use strict';

/**
 * SCOUT AGENT — Análisis de competencia
 *
 * Checks (sin API):
 *   1. Fetch páginas públicas de competidores (pricing, features)
 *   2. Comparar con snapshot anterior (detectar cambios)
 *   3. Extraer precios, features, planes
 *
 * Check con API (1 llamada Sonnet):
 *   4. Claude analiza cambios y genera recomendaciones
 *
 * Output: reports/scout-YYYY-MM-DD.json
 * Snapshots: reports/scout-snapshots.json
 */

const fs = require('fs');
const path = require('path');
const { guardedCall } = require('./api-guard');
const mem = require('./agent-memory');

const REPORTS_DIR = path.join(__dirname, 'reports');
const SNAPSHOTS_FILE = path.join(REPORTS_DIR, 'scout-snapshots.json');

// ── Competitors to monitor ──────────────────────────────────────────────────

const COMPETITORS = [
  {
    name: 'VidIQ',
    urls: [
      { label: 'pricing', url: 'https://vidiq.com/pricing/' },
      { label: 'features', url: 'https://vidiq.com/features/' },
    ],
  },
  {
    name: 'TubeBuddy',
    urls: [
      { label: 'pricing', url: 'https://www.tubebuddy.com/pricing' },
    ],
  },
  {
    name: 'ViewStats',
    urls: [
      { label: 'home', url: 'https://www.viewstats.com/' },
    ],
  },
  {
    name: 'OutlierKit',
    urls: [
      { label: 'home', url: 'https://www.outlierkit.com/' },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSnapshots() {
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOTS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSnapshots(data) {
  ensureDir(REPORTS_DIR);
  fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify(data, null, 2));
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { error: `HTTP ${res.status}`, content: '' };
    const html = await res.text();
    // Extract text content (strip HTML tags, scripts, styles)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000); // Cap to avoid huge snapshots
    return { error: null, content: text };
  } catch (err) {
    clearTimeout(timeout);
    return { error: err.message, content: '' };
  }
}

function extractPricing(text) {
  // Try to find price patterns like $9.99, €19, $49/month
  const prices = text.match(/[\$€£]\d+[\.,]?\d*(?:\s*\/\s*(?:mo|month|mes|year|año))?/gi) || [];
  return [...new Set(prices)].slice(0, 10);
}

function computeChanges(oldSnapshot, newSnapshot) {
  if (!oldSnapshot) return { isNew: true, changes: ['First scan — no previous data'] };

  const changes = [];

  // Check if content changed significantly
  const oldLen = (oldSnapshot.content || '').length;
  const newLen = (newSnapshot.content || '').length;
  const lenDiff = Math.abs(newLen - oldLen);
  if (lenDiff > 500) {
    changes.push(`Content length changed by ${lenDiff} chars (${oldLen} → ${newLen})`);
  }

  // Check pricing changes
  const oldPrices = (oldSnapshot.prices || []).join(', ');
  const newPrices = (newSnapshot.prices || []).join(', ');
  if (oldPrices !== newPrices && newPrices) {
    changes.push(`Pricing changed: [${oldPrices || 'none'}] → [${newPrices}]`);
  }

  return { isNew: false, changes };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function runScout() {
  console.log('[scout] Starting competitor analysis...');
  const startTime = Date.now();
  ensureDir(REPORTS_DIR);

  const oldSnapshots = loadSnapshots();
  const newSnapshots = {};
  const allChanges = [];
  const results = {
    timestamp: new Date().toISOString(),
    agent: 'scout',
    competitors: {},
  };

  for (const competitor of COMPETITORS) {
    console.log(`[scout] Scanning ${competitor.name}...`);
    const competitorData = { pages: {}, changes: [] };

    for (const { label, url } of competitor.urls) {
      const key = `${competitor.name}::${label}`;
      const { error, content } = await fetchPage(url);

      if (error) {
        competitorData.pages[label] = { error, url };
        continue;
      }

      const prices = extractPricing(content);
      const newSnap = { content: content.slice(0, 4000), prices, fetchedAt: new Date().toISOString() };
      newSnapshots[key] = newSnap;

      const { isNew, changes } = computeChanges(oldSnapshots[key], newSnap);
      if (changes.length > 0) {
        for (const change of changes) {
          competitorData.changes.push({ page: label, change });
          allChanges.push(`${competitor.name} (${label}): ${change}`);
        }
      }

      competitorData.pages[label] = {
        url,
        prices,
        contentLength: content.length,
        isNew,
        changesDetected: changes.length,
      };

      // Small delay between requests to be polite
      await new Promise(r => setTimeout(r, 2000));
    }

    results.competitors[competitor.name] = competitorData;
  }

  // Save new snapshots
  saveSnapshots({ ...oldSnapshots, ...newSnapshots });

  // ── Memory: track changes as findings ───────────────────────────────────
  console.log('[scout] Processing memory...');
  const memory = mem.loadMemory('scout');
  const currentFindings = [];

  for (const change of allChanges) {
    // Parse "CompetitorName (page): description"
    const match = change.match(/^(.+?)\s*\((.+?)\):\s*(.+)$/);
    if (match) {
      const [, competitor, page, description] = match;
      const isPricing = description.toLowerCase().includes('pricing');
      currentFindings.push({
        id: mem.issueId('competitor_change', `${competitor}::${page}::${new Date().toISOString().slice(0, 10)}`),
        category: isPricing ? 'pricing_change' : 'content_change',
        severity: isPricing ? 'high' : 'medium',
        description: `${competitor} (${page}): ${description}`,
      });
    }
  }

  const { newIssues, resolvedIssues } = mem.processFindings(memory, currentFindings);

  // Record trend
  mem.recordTrend(memory, {
    totalChanges: allChanges.length,
    competitorsScanned: COMPETITORS.length,
    pricingChanges: currentFindings.filter(f => f.category === 'pricing_change').length,
    contentChanges: currentFindings.filter(f => f.category === 'content_change').length,
  });

  results.memory = {
    newChanges: newIssues.length,
    totalTrackedChanges: memory.knownIssues.length,
    recentResolutions: resolvedIssues.length,
  };

  // Build historical context for AI
  const comparison = mem.getTrendComparison(memory);
  let historyContext = '';
  if (comparison.previous) {
    historyContext = `\n\nHistorial: semana anterior detectamos ${comparison.previous.totalChanges || 0} cambios.`;
  }
  if (comparison.totalDataPoints > 4) {
    const recentTrends = Object.entries(memory.trends).sort().slice(-4).map(([d, t]) => `${d}: ${t.totalChanges} cambios`);
    historyContext += `\nÚltimas ejecuciones: ${recentTrends.join(', ')}`;
  }

  // AI analysis (solo si hay cambios)
  if (allChanges.length > 0) {
    console.log('[scout] Requesting AI analysis of changes...');
    try {
      const { text } = await guardedCall(
        `Eres un analista de competencia para YTubViral, una herramienta SaaS de IA para YouTubers (€9.99/mes Pro, €29.99/mes Business).

Competidores principales: VidIQ ($19/mo), TubeBuddy ($49/mo Legend), ViewStats, OutlierKit.

Se han detectado estos cambios en las webs de los competidores:

${allChanges.join('\n')}${historyContext}

Responde en español con:
1. ¿Hay algún cambio que sea una amenaza o una oportunidad para YTubViral?
2. ¿Debemos reaccionar de alguna forma? (cambio de pricing, nueva feature, marketing)
3. Estado general: ¿mantenemos ventaja competitiva?

Sé directo y conciso. Máximo 200 palabras.`,
        { maxTokens: 500, agentId: 'scout' }
      );
      results.aiAnalysis = text;
    } catch (err) {
      results.aiAnalysis = `Error en análisis AI: ${err.message}`;
    }
  } else {
    results.aiAnalysis = 'Sin cambios detectados en los competidores esta semana.';
  }

  results.totalChanges = allChanges.length;
  results.durationMs = Date.now() - startTime;

  // Save memory
  mem.recordRun(memory, results.durationMs);
  mem.saveMemory('scout', memory);

  // Save report
  const reportFile = path.join(REPORTS_DIR, `scout-${results.timestamp.slice(0, 10)}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
  console.log(`[scout] Report saved: ${reportFile} (${results.durationMs}ms)`);

  return results;
}

module.exports = { runScout };
