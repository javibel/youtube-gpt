'use strict';

/**
 * AGENT MEMORY — Sistema de memoria persistente para agentes
 *
 * Cada agente mantiene un archivo JSON en memory/ con:
 *   - knownIssues: problemas detectados con estado (open/resolved/suppressed)
 *   - trends: resumen numérico por día (para comparar evolución)
 *   - changelog: eventos importantes (issue nuevo, resuelto, escalado)
 *   - meta: stats de ejecución del agente
 *
 * Funcionalidades clave:
 *   - Detectar issues NUEVOS vs RECURRENTES vs RESUELTOS
 *   - Escalar issues que persisten más de X días
 *   - Evitar re-reportar issues ya conocidos como si fueran nuevos
 *   - Proveer contexto histórico al Manager para tendencias
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, 'memory');
const MAX_CHANGELOG_ENTRIES = 200;
const MAX_TREND_DAYS = 90;
const ESCALATION_DAYS = 7; // Escalar issues que persisten más de 7 días

// ── Core ───────────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function memoryPath(agentId) {
  return path.join(MEMORY_DIR, `${agentId}.json`);
}

/**
 * Load agent memory from disk. Returns empty structure if not found.
 */
function loadMemory(agentId) {
  ensureDir();
  const filePath = memoryPath(agentId);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return createEmptyMemory(agentId);
  }
}

/**
 * Save agent memory to disk.
 */
function saveMemory(agentId, memory) {
  ensureDir();
  // Trim changelog and trends to prevent unbounded growth
  if (memory.changelog && memory.changelog.length > MAX_CHANGELOG_ENTRIES) {
    memory.changelog = memory.changelog.slice(-MAX_CHANGELOG_ENTRIES);
  }
  if (memory.trends) {
    const dates = Object.keys(memory.trends).sort();
    if (dates.length > MAX_TREND_DAYS) {
      const toRemove = dates.slice(0, dates.length - MAX_TREND_DAYS);
      for (const d of toRemove) delete memory.trends[d];
    }
  }
  memory.lastUpdated = new Date().toISOString();
  fs.writeFileSync(memoryPath(agentId), JSON.stringify(memory, null, 2));
}

function createEmptyMemory(agentId) {
  return {
    agent: agentId,
    created: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    meta: { runCount: 0, lastRun: null, totalDurationMs: 0 },
    knownIssues: [],    // { id, category, severity, description, firstSeen, lastSeen, occurrences, status, resolvedAt }
    trends: {},         // { "2026-05-09": { critical: 0, high: 1, medium: 2, ... agentSpecific } }
    changelog: [],      // { date, type, message }
  };
}

// ── Issue tracking ─────────────────────────────────────────────────────────

/**
 * Generate a stable ID for an issue (for dedup across runs).
 * @param {string} category - Issue category (e.g., "npm_vuln", "missing_header", "dangerous_pattern")
 * @param {string} identifier - Unique identifier within category (e.g., package name, header name, file:line)
 */
function issueId(category, identifier) {
  return `${category}::${identifier}`;
}

/**
 * Process current findings against memory. Returns enriched findings with status.
 *
 * @param {object} memory - Agent memory object
 * @param {Array<{id: string, category: string, severity: string, description: string}>} currentFindings
 * @returns {{ newIssues: Array, recurringIssues: Array, resolvedIssues: Array, escalatedIssues: Array }}
 */
function processFindings(memory, currentFindings) {
  const today = new Date().toISOString().slice(0, 10);
  const knownMap = new Map(memory.knownIssues.map(i => [i.id, i]));
  const currentIds = new Set(currentFindings.map(f => f.id));

  const newIssues = [];
  const recurringIssues = [];
  const escalatedIssues = [];
  const resolvedIssues = [];

  // Process current findings
  for (const finding of currentFindings) {
    const existing = knownMap.get(finding.id);

    if (!existing) {
      // NEW issue — never seen before
      const issue = {
        id: finding.id,
        category: finding.category,
        severity: finding.severity,
        description: finding.description,
        firstSeen: today,
        lastSeen: today,
        occurrences: 1,
        status: 'open',
      };
      memory.knownIssues.push(issue);
      newIssues.push(issue);
      memory.changelog.push({ date: today, type: 'new_issue', message: `[${finding.severity.toUpperCase()}] ${finding.description}` });
    } else {
      // RECURRING — seen before
      existing.lastSeen = today;
      existing.occurrences++;
      if (existing.status === 'resolved') {
        // Was resolved but came back — REGRESSION
        existing.status = 'open';
        existing.regression = true;
        newIssues.push(existing); // Treat regression as new for alerting
        memory.changelog.push({ date: today, type: 'regression', message: `REGRESION: ${finding.description} (resuelto ${existing.resolvedAt}, vuelve a aparecer)` });
      } else {
        recurringIssues.push(existing);

        // Check for escalation (open for too long)
        const daysSinceFirst = Math.floor((new Date(today) - new Date(existing.firstSeen)) / (24 * 60 * 60 * 1000));
        if (daysSinceFirst >= ESCALATION_DAYS && !existing.escalated) {
          existing.escalated = true;
          existing.escalatedAt = today;
          escalatedIssues.push(existing);
          memory.changelog.push({ date: today, type: 'escalation', message: `ESCALADO (${daysSinceFirst} dias): ${finding.description}` });
        }
      }
    }
  }

  // Mark issues that DISAPPEARED as resolved
  for (const [id, known] of knownMap) {
    if (known.status === 'open' && !currentIds.has(id)) {
      known.status = 'resolved';
      known.resolvedAt = today;
      resolvedIssues.push(known);
      memory.changelog.push({ date: today, type: 'resolved', message: `Resuelto: ${known.description}` });
    }
  }

  return { newIssues, recurringIssues, resolvedIssues, escalatedIssues };
}

// ── Trends ─────────────────────────────────────────────────────────────────

/**
 * Record today's trend data point.
 */
function recordTrend(memory, trendData) {
  const today = new Date().toISOString().slice(0, 10);
  memory.trends[today] = { ...trendData, timestamp: new Date().toISOString() };
}

/**
 * Get trend comparison (today vs yesterday, today vs 7 days ago).
 */
function getTrendComparison(memory) {
  const dates = Object.keys(memory.trends).sort().reverse();
  const today = dates[0];
  const yesterday = dates[1];
  const weekAgo = dates.find(d => {
    const diff = Math.abs(new Date(today) - new Date(d));
    return diff >= 6 * 24 * 60 * 60 * 1000;
  });

  return {
    current: memory.trends[today] || null,
    previous: yesterday ? memory.trends[yesterday] : null,
    weekAgo: weekAgo ? memory.trends[weekAgo] : null,
    totalDataPoints: dates.length,
  };
}

// ── Run tracking ───────────────────────────────────────────────────────────

function recordRun(memory, durationMs) {
  memory.meta.runCount++;
  memory.meta.lastRun = new Date().toISOString();
  memory.meta.totalDurationMs += durationMs;
  memory.meta.avgDurationMs = Math.round(memory.meta.totalDurationMs / memory.meta.runCount);
}

// ── Summaries for Manager ──────────────────────────────────────────────────

/**
 * Generate a compact summary of agent memory for Manager consumption.
 */
function getMemorySummary(agentId) {
  const memory = loadMemory(agentId);
  const openIssues = memory.knownIssues.filter(i => i.status === 'open');
  const escalated = openIssues.filter(i => i.escalated);
  const recentChangelog = memory.changelog.slice(-10);
  const comparison = getTrendComparison(memory);

  // Determine trend direction
  let trendDirection = 'stable';
  if (comparison.current && comparison.previous) {
    const currTotal = (comparison.current.critical || 0) + (comparison.current.high || 0) + (comparison.current.medium || 0);
    const prevTotal = (comparison.previous.critical || 0) + (comparison.previous.high || 0) + (comparison.previous.medium || 0);
    if (currTotal > prevTotal) trendDirection = 'empeorando';
    else if (currTotal < prevTotal) trendDirection = 'mejorando';
  }

  return {
    agent: agentId,
    runCount: memory.meta.runCount,
    lastRun: memory.meta.lastRun,
    openIssues: openIssues.length,
    escalatedIssues: escalated.length,
    trendDirection,
    recentChangelog,
    openIssueSummary: openIssues.map(i => ({
      severity: i.severity,
      description: i.description,
      daysSinceFirst: Math.floor((Date.now() - new Date(i.firstSeen).getTime()) / (24 * 60 * 60 * 1000)),
      occurrences: i.occurrences,
      escalated: !!i.escalated,
      regression: !!i.regression,
    })),
  };
}

module.exports = {
  loadMemory,
  saveMemory,
  issueId,
  processFindings,
  recordTrend,
  getTrendComparison,
  recordRun,
  getMemorySummary,
};
