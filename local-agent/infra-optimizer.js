'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('./db');
const { guardedCall } = require('./api-guard');
const mem = require('./agent-memory');
const { registerFixes, applyFixes } = require('./auto-fix');
const { sendEmail, optimizerAlert } = require('./reports');

const REPORTS_DIR = path.join(__dirname, 'reports');
const LOGS_DIR = path.join(__dirname, 'logs');
const MEMORY_DIR = path.join(__dirname, 'memory');
const AGENT_ID = 'infra-optimizer';

// Agent schedule awareness: maxGapHours = max acceptable hours since last report
// Agents that run AFTER infra-optimizer (02:45) are checked against yesterday's report
// Weekly agents (watchdog=Mon 02:45, scout=Mon 02:30) tolerate up to 168h gap
const EXPECTED_AGENTS = [
  { id: 'guardian',        maxGapHours: 26  }, // runs 02:15 daily — should always be present
  { id: 'social-optimizer',maxGapHours: 32  }, // runs 03:00 daily — check yesterday's
  { id: 'gmail',           maxGapHours: 32  }, // runs 08:00+ daily — check yesterday's
  { id: 'manager',         maxGapHours: 32  }, // runs 03:15 daily — check yesterday's
  { id: 'watchdog',        maxGapHours: 168 }, // runs Mon 02:45 — weekly
  { id: 'scout',           maxGapHours: 168 }, // runs Mon 02:30 — weekly
];

const ALLOWED_PM2_SERVICES = ['ytubviral-agent', 'ytubviral-dashboard', 'ytubviral-tunnel'];

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function safeExec(cmd, timeoutMs = 10000) {
  try {
    const result = execSync(cmd, { timeout: timeoutMs, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    return { ok: true, data: result.trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// ── Metric collectors ───────────────────────────────────────────────────────

function collectSentinelTrend() {
  const sentinelPath = path.join(MEMORY_DIR, 'sentinel.json');
  try {
    const raw = fs.readFileSync(sentinelPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.trends) return { ok: false, error: 'No trends data in sentinel.json' };

    const dates = Object.keys(data.trends).sort().slice(-7);
    const recent = {};
    for (const d of dates) recent[d] = data.trends[d];

    return { ok: true, data: recent, knownIssues: data.knownIssues || [] };
  } catch (err) {
    return { ok: false, error: `Cannot read sentinel.json: ${err.message}` };
  }
}

async function collectDbConnections() {
  try {
    const rows = await db.query(
      'SELECT count(*)::int AS active FROM pg_stat_activity WHERE datname = current_database()'
    );
    const active = rows[0]?.active ?? 0;
    return { ok: true, data: { active, poolMax: 5 } };
  } catch (err) {
    return { ok: false, error: `DB query failed: ${err.message}` };
  }
}

function collectDiskUsage() {
  const result = safeExec(
    'powershell -Command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"'
  );
  if (!result.ok) return { ok: false, error: `Disk check failed: ${result.error}` };

  const parsed = safeJsonParse(result.data);
  if (!parsed) return { ok: false, error: 'Cannot parse disk info JSON' };

  const usedGB = Math.round((parsed.Used / 1073741824) * 100) / 100;
  const freeGB = Math.round((parsed.Free / 1073741824) * 100) / 100;
  const totalGB = usedGB + freeGB;
  const usedPct = totalGB > 0 ? Math.round((usedGB / totalGB) * 100) : 0;

  return { ok: true, data: { usedGB, freeGB, totalGB, usedPct } };
}

function collectPm2Processes() {
  const result = safeExec('pm2 jlist');
  if (!result.ok) return { ok: false, error: `PM2 check failed: ${result.error}` };

  const procs = safeJsonParse(result.data);
  if (!Array.isArray(procs)) return { ok: false, error: 'Cannot parse PM2 JSON output' };

  return {
    ok: true,
    data: procs.map(p => ({
      name: p.name,
      status: p.pm2_env?.status,
      memoryMB: Math.round((p.monit?.memory || 0) / 1048576),
      restarts: p.pm2_env?.restart_time || 0,
      unstableRestarts: p.pm2_env?.unstable_restarts || 0,
      uptime: p.pm2_env?.pm_uptime || 0,
    })),
  };
}

function collectErrorRate() {
  const errorLogPath = path.join(LOGS_DIR, 'error.log');
  try {
    if (!fs.existsSync(errorLogPath)) return { ok: true, data: { count: 0, date: today() } };

    const content = fs.readFileSync(errorLogPath, 'utf-8');
    const todayStr = today();
    const lines = content.split('\n').filter(line => line.includes(todayStr));

    return { ok: true, data: { count: lines.length, date: todayStr } };
  } catch (err) {
    return { ok: false, error: `Cannot read error.log: ${err.message}` };
  }
}

function collectAgentReports() {
  const todayStr = today();
  const now = Date.now();
  const present = [];
  const missing = [];

  for (const agentDef of EXPECTED_AGENTS) {
    const { id, maxGapHours } = agentDef;
    const maxGapMs = maxGapHours * 60 * 60 * 1000;
    let found = false;

    // Scan reports dir for this agent's most recent report
    try {
      const files = fs.readdirSync(REPORTS_DIR)
        .filter(f => f.startsWith(`${id}-`) && f.endsWith('.json'))
        .sort()
        .reverse();

      for (const file of files) {
        const mtime = fs.statSync(path.join(REPORTS_DIR, file)).mtimeMs;
        if (now - mtime <= maxGapMs) {
          found = true;
          break;
        }
      }
    } catch {}

    if (found) {
      present.push(id);
    } else {
      missing.push(id);
    }
  }

  return { ok: true, data: { present, missing, date: todayStr } };
}

// ── Issue detection ─────────────────────────────────────────────────────────

function detectIssues(metrics) {
  const issues = [];

  // Response time trend
  if (metrics.sentinel?.ok && metrics.sentinel.data) {
    const dates = Object.keys(metrics.sentinel.data).sort().slice(-3);
    const avgTimes = [];
    for (const d of dates) {
      const entry = metrics.sentinel.data[d];
      const rt = entry?.avgResponseTime ?? entry?.responseTime ?? entry?.avg_response_time;
      if (typeof rt === 'number') avgTimes.push(rt);
    }
    if (avgTimes.length > 0) {
      const avg = avgTimes.reduce((a, b) => a + b, 0) / avgTimes.length;
      if (avg > 3000) {
        issues.push(`INFRA_RESPONSE_TIME: Average response time ${Math.round(avg)}ms over last ${avgTimes.length} days (threshold: 3000ms)`);
      }
    }
  }

  // DB connections
  if (metrics.dbConnections?.ok) {
    const { active, poolMax } = metrics.dbConnections.data;
    if (active > 4) {
      issues.push(`INFRA_DB_CONNECTIONS: ${active} active DB connections — CRITICAL (pool max is ${poolMax})`);
    } else if (active > 3) {
      issues.push(`INFRA_DB_CONNECTIONS: ${active} active DB connections — WARNING (pool max is ${poolMax})`);
    }
  }

  // Disk usage — NO se reporta como issue (decisión Javier 2026-06-27).
  // El volumen C: lo ocupan archivos PERSONALES del usuario, no el proyecto.
  // Se revisó varias veces: no es crítico para YTubViral. La métrica se sigue
  // recogiendo y mostrando como dato informativo en el reporte (manager.js),
  // pero no genera alertas WARNING/CRITICAL que ensucien el escalado.
  // Si algún día el proyecto vuelve a ser responsable del volumen, reactivar:
  //   if (usedPct > 90) issues.push(`INFRA_DISK: Disk usage ${usedPct}% — CRITICAL`);

  // PM2 memory and restarts
  if (metrics.pm2?.ok) {
    for (const proc of metrics.pm2.data) {
      if (proc.memoryMB > 200) {
        issues.push(`INFRA_MEMORY: Process ${proc.name} using ${proc.memoryMB}MB — WARNING`);
      }
      // Solo es alarma un CRASH LOOP real: PM2 marca unstable_restarts cuando el
      // proceso muere antes de min_uptime y lo resetea a 0 al estabilizarse. Un
      // `pm2 restart` manual (SIGINT) NUNCA lo incrementa. La condición anterior
      // (`restarts > 0 && uptime < 6h`) saltaba cada vez que alguien reiniciaba a
      // mano y el infra-optimizer corría en las siguientes 6h → WARNING diario
      // falso durante las sesiones de mantenimiento (02/09).
      const hoursUp = proc.uptime ? (Date.now() - proc.uptime) / 3600000 : Infinity;
      if (proc.unstableRestarts > 0) {
        issues.push(`INFRA_RESTARTS: Process ${proc.name} en crash loop — ${proc.unstableRestarts} reinicios inestables (uptime ${hoursUp.toFixed(1)}h) — WARNING`);
      }
    }
  }

  // Error rate
  if (metrics.errors?.ok) {
    const { count } = metrics.errors.data;
    if (count > 20) {
      issues.push(`INFRA_ERRORS: ${count} errors today — WARNING`);
    }
  }

  // Missing agent reports
  if (metrics.agentReports?.ok) {
    for (const agent of metrics.agentReports.data.missing) {
      issues.push(`INFRA_AGENT_MISSING: Agent ${agent} did not produce a report today`);
    }
  }

  return issues;
}

// ── Claude Opus analysis ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el analista de infraestructura del sistema de auto-mejora de YTubViral. Correlacionas métricas de salud del sistema para encontrar problemas raíz.

El sistema corre en Windows 11 con PM2. Next.js en Vercel. PostgreSQL en Neon.

PUEDES PROPONER estas acciones:
1. "alert" — email con diagnóstico y prioridad
2. "clean_disk" — borrar reports >7 días y rotar logs
3. "restart_service" — reiniciar un servicio PM2 específico (nombre exacto)
4. "adjust_schedule" — proponer cambio de horario cron (solo propuesta, no aplica)

Responde en JSON:
{
  "diagnosis": "correlación de problemas encontrados",
  "actions": [
    { "type": "clean_disk" },
    { "type": "restart_service", "service": "ytubviral-agent" },
    { "type": "alert", "priority": "high", "message": "..." }
  ] | null,
  "reasoning": "por qué propones cada acción"
}

Responde SOLO con el JSON.`;

async function analyzeWithClaude(metrics, issues) {
  const prompt = `Métricas de infraestructura de hoy (${today()}):

${JSON.stringify(metrics, null, 2)}

Issues detectados automáticamente:
${issues.length > 0 ? issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n') : 'Ninguno — todo OK.'}

Analiza las correlaciones entre métricas y propón acciones si es necesario. Si todo está bien, responde con actions: null.`;

  const response = await guardedCall(prompt, {
    system: SYSTEM_PROMPT,
    agentId: AGENT_ID,
    maxTokens: 1000,
    // model resolved from agent-config.json → infra-optimizer.model
  });

  if (!response) return null;

  // Robust JSON extraction: try raw parse, then extract from markdown code block
  const text = typeof response === 'string' ? response : response.text || response.content || '';
  let parsed = safeJsonParse(text);
  if (!parsed) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) parsed = safeJsonParse(match[1].trim());
  }
  if (!parsed) {
    // Try to find the first { ... } block
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) parsed = safeJsonParse(braceMatch[0]);
  }

  return parsed;
}

// ── Auto-fix actions ────────────────────────────────────────────────────────

function cleanOldReports() {
  const cutoff = Date.now() - 7 * 86400000;
  let deleted = 0;

  try {
    const files = fs.readdirSync(REPORTS_DIR);
    for (const file of files) {
      // Only delete dated report files (agent-YYYY-MM-DD.json)
      if (!/^\w+-\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
      const filePath = path.join(REPORTS_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }
  } catch (err) {
    console.error(`[${AGENT_ID}] Error cleaning reports: ${err.message}`);
  }

  return deleted;
}

function rotateLogs() {
  const MAX_LOG_SIZE = 500 * 1024; // 500KB
  let rotated = 0;

  try {
    if (!fs.existsSync(LOGS_DIR)) return 0;
    const logFiles = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.log'));

    for (const file of logFiles) {
      const filePath = path.join(LOGS_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_LOG_SIZE) {
        // Keep last 200 lines, discard the rest
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const kept = lines.slice(-200).join('\n');
        fs.writeFileSync(filePath, kept, 'utf-8');
        rotated++;
      }
    }
  } catch (err) {
    console.error(`[${AGENT_ID}] Error rotating logs: ${err.message}`);
  }

  return rotated;
}

function restartService(serviceName) {
  if (!ALLOWED_PM2_SERVICES.includes(serviceName)) {
    return { ok: false, error: `Service "${serviceName}" not in allowlist` };
  }
  return safeExec(`pm2 restart ${serviceName}`);
}

// ── Register auto-fixes ─────────────────────────────────────────────────────

registerFixes(AGENT_ID, [
  {
    id: 'claude-infra-diagnosis',
    description: 'Apply infrastructure fixes recommended by Claude analysis',
    cooldownMs: 86400000, // 1 day
    condition: (issues) => issues.length > 0,
    apply: async (config, issues, metrics) => {
      const actions = metrics._claudeActions;
      if (!actions || !Array.isArray(actions)) return 'No Claude actions to apply';

      const results = [];

      for (const action of actions) {
        try {
          switch (action.type) {
            case 'clean_disk': {
              const deleted = cleanOldReports();
              const rotated = rotateLogs();
              results.push(`clean_disk: deleted ${deleted} old reports, rotated ${rotated} logs`);
              break;
            }
            case 'restart_service': {
              const svc = action.service;
              const res = restartService(svc);
              results.push(res.ok
                ? `restart_service: ${svc} restarted`
                : `restart_service: FAILED for ${svc} — ${res.error}`);
              break;
            }
            case 'alert': {
              const priority = action.priority || 'medium';
              const message = action.message || 'Infrastructure issue detected';
              await optimizerAlert(
                `[YTubViral Infra] ${priority.toUpperCase()}: ${message.slice(0, 80)}`,
                `Prioridad: ${priority}\n\n${message}\n\nIssues detectados:\n${issues.join('\n')}`
              );
              results.push(`alert: email sent (priority: ${priority})`);
              break;
            }
            case 'adjust_schedule': {
              const proposal = action.proposal || action.message || JSON.stringify(action);
              await optimizerAlert(
                '[YTubViral Infra] Propuesta de cambio de horario cron',
                `El optimizador de infraestructura propone un cambio de horario:\n\n${proposal}\n\nEsto es solo una propuesta — no se ha aplicado automáticamente.`
              );
              results.push('adjust_schedule: proposal emailed (not auto-applied)');
              break;
            }
            default:
              results.push(`unknown action type: ${action.type}`);
          }
        } catch (err) {
          results.push(`${action.type}: ERROR — ${err.message}`);
        }
      }

      return results.join('; ');
    },
  },
]);

// ── Main runner ─────────────────────────────────────────────────────────────

async function runInfraOptimizer() {
  const startTime = Date.now();
  console.log(`[${AGENT_ID}] Starting infrastructure optimization...`);

  const results = {
    timestamp: new Date().toISOString(),
    metrics: {},
    issues: [],
    analysis: null,
    autoFixes: [],
    durationMs: 0,
  };

  // 1. Collect all metrics
  console.log(`[${AGENT_ID}] Collecting metrics...`);

  results.metrics.sentinel = collectSentinelTrend();
  results.metrics.dbConnections = await collectDbConnections();
  results.metrics.disk = collectDiskUsage();
  results.metrics.pm2 = collectPm2Processes();
  results.metrics.errors = collectErrorRate();
  results.metrics.agentReports = collectAgentReports();

  // 2. Detect issues from thresholds
  results.issues = detectIssues(results.metrics);
  console.log(`[${AGENT_ID}] Detected ${results.issues.length} issue(s)`);

  // 3. Claude Opus analysis (only if there are issues to save API budget)
  if (results.issues.length > 0) {
    console.log(`[${AGENT_ID}] Requesting Claude analysis...`);
    try {
      const analysis = await analyzeWithClaude(results.metrics, results.issues);
      results.analysis = analysis;

      if (analysis?.actions && Array.isArray(analysis.actions)) {
        console.log(`[${AGENT_ID}] Claude proposed ${analysis.actions.length} action(s)`);
      }
    } catch (err) {
      console.error(`[${AGENT_ID}] Claude analysis failed: ${err.message}`);
      results.analysis = { error: err.message };
    }
  } else {
    console.log(`[${AGENT_ID}] No issues detected — skipping Claude analysis`);
  }

  // 4. Apply auto-fixes
  const fixMetrics = {
    ...results.metrics,
    _claudeActions: results.analysis?.actions || null,
  };
  const appliedFixes = await applyFixes(AGENT_ID, results.issues, fixMetrics);
  if (appliedFixes.length > 0) {
    console.log(`[${AGENT_ID}] Auto-fixed ${appliedFixes.length} issue(s)`);
    results.autoFixes = appliedFixes;
  }

  // 5. Update agent memory
  try {
    const memory = mem.loadMemory(AGENT_ID);
    const todayStr = today();

    // Store trend data
    if (!memory.trends) memory.trends = {};
    memory.trends[todayStr] = {
      issueCount: results.issues.length,
      dbConnections: results.metrics.dbConnections?.data?.active ?? null,
      diskUsedPct: results.metrics.disk?.data?.usedPct ?? null,
      errorCount: results.metrics.errors?.data?.count ?? null,
      pm2Processes: results.metrics.pm2?.ok ? results.metrics.pm2.data.length : null,
      agentsMissing: results.metrics.agentReports?.data?.missing?.length ?? null,
      fixesApplied: results.autoFixes.length,
    };

    // Update known issues
    memory.knownIssues = results.issues.map(issue => ({
      id: issue.split(':')[0],
      description: issue,
      status: 'open',
      firstSeen: todayStr,
    }));

    mem.saveMemory(AGENT_ID, memory);
  } catch (err) {
    console.error(`[${AGENT_ID}] Memory update failed: ${err.message}`);
  }

  // 6. Save report
  results.durationMs = Date.now() - startTime;
  mem.markRun(AGENT_ID, results.durationMs);
  ensureDir(REPORTS_DIR);
  const reportFile = path.join(REPORTS_DIR, `${AGENT_ID}-${today()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
  console.log(`[${AGENT_ID}] Report saved: ${reportFile} (${results.durationMs}ms)`);

  return results;
}

module.exports = { runInfraOptimizer };
