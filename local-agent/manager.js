'use strict';

/**
 * MANAGER AGENT — Coordinador y reporte ejecutivo
 *
 * 1. Lee los reportes JSON de todos los agentes del día
 * 2. Claude sintetiza en un resumen ejecutivo
 * 3. Envía email diario al fundador
 *
 * Output: reports/manager-YYYY-MM-DD.json + email
 */

const fs = require('fs');
const path = require('path');
const { guardedCall, getStats, cleanOldFiles } = require('./api-guard');
const { sendEmail } = require('./reports');
const mem = require('./agent-memory');
const { registerFixes, applyFixes, getRecentFixes, getEffectivenessReport, getDisabledFixes, readConfig, writeConfig } = require('./auto-fix');

const REPORTS_DIR = path.join(__dirname, 'reports');
const ANTHROPIC_CREDIT_TOTAL = 6.00; // USD loaded into Anthropic prepaid credits (remaining: check console)

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readReport(agentName, date) {
  const filePath = path.join(REPORTS_DIR, `${agentName}-${date}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function formatDate(date) {
  return date.toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Europe/Madrid',
  });
}

// ── Build summary from raw reports ──────────────────────────────────────────

function buildRawSummary(date) {
  const sections = [];

  // Guardian
  const guardian = readReport('guardian', date);
  if (guardian) {
    const s = guardian.summary || {};
    sections.push({
      agent: 'Guardian (Seguridad)',
      status: (s.critical + s.high) > 0 ? 'ATENCIÓN' : 'OK',
      data: `Critical: ${s.critical}, High: ${s.high}, Medium: ${s.medium}, Low: ${s.low}`,
      ai: guardian.aiAnalysis || '',
      duration: guardian.durationMs,
    });
  }

  // Scout (puede ser del lunes anterior)
  const scout = readReport('scout', date);
  if (scout) {
    sections.push({
      agent: 'Scout (Competencia)',
      status: scout.totalChanges > 0 ? 'CAMBIOS' : 'SIN CAMBIOS',
      data: `Cambios detectados: ${scout.totalChanges}`,
      ai: scout.aiAnalysis || '',
      duration: scout.durationMs,
    });
  } else {
    // Try to find most recent scout report
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const prevDate = d.toISOString().slice(0, 10);
      const prevScout = readReport('scout', prevDate);
      if (prevScout) {
        sections.push({
          agent: 'Scout (Competencia)',
          status: 'ÚLTIMO REPORTE',
          data: `Último scan: ${prevDate} — Cambios: ${prevScout.totalChanges}`,
          ai: prevScout.aiAnalysis || '',
          duration: prevScout.durationMs,
        });
        break;
      }
    }
  }

  // Watchdog (puede ser del lunes anterior)
  const watchdog = readReport('watchdog', date);
  if (watchdog) {
    sections.push({
      agent: 'Watchdog (Legal)',
      status: watchdog.summary?.issues > 0 ? 'ISSUES' : 'OK',
      data: `Issues: ${watchdog.summary?.issues || 0}, OK: ${watchdog.summary?.ok || 0}`,
      ai: watchdog.aiAnalysis || '',
      duration: watchdog.durationMs,
    });
  } else {
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const prevDate = d.toISOString().slice(0, 10);
      const prevWatchdog = readReport('watchdog', prevDate);
      if (prevWatchdog) {
        sections.push({
          agent: 'Watchdog (Legal)',
          status: 'ÚLTIMO REPORTE',
          data: `Último scan: ${prevDate} — Issues: ${prevWatchdog.summary?.issues || 0}`,
          ai: prevWatchdog.aiAnalysis || '',
          duration: prevWatchdog.durationMs,
        });
        break;
      }
    }
  }

  // Gmail — emails procesados hoy
  const gmailReport = readReport('gmail', date);
  if (gmailReport && Array.isArray(gmailReport) && gmailReport.length > 0) {
    const important = gmailReport.filter(e => e.classification === 'important');
    const autoReplied = gmailReport.filter(e => e.replied);
    const emailSummary = gmailReport.map(e =>
      `[${e.classification.toUpperCase()}] ${e.from}: "${e.subject}"${e.replied ? ' → RESPONDIDO' : ''}`
    ).join('\n');
    // Flag auto-replies to external addresses — these need human review
    const status = autoReplied.length > 0 ? 'REVISAR' : important.length > 0 ? 'ATENCIÓN' : 'OK';
    sections.push({
      agent: 'Gmail (Correo)',
      status,
      data: `Importantes: ${important.length}, Auto-replies: ${autoReplied.length}. Total procesados: ${gmailReport.length}`,
      ai: emailSummary,
      duration: 0,
    });
  }

  // API usage stats
  const apiStats = getStats();
  sections.push({
    agent: 'API Guard (Consumo)',
    status: apiStats.budgetUsedPercent > 80 ? 'ATENCIÓN' : 'OK',
    data: `Llamadas: ${apiStats.callCount}, Tokens: ${apiStats.dailyTokensUsed}/${apiStats.dailyBudget} (${apiStats.budgetUsedPercent}%), Errores: ${apiStats.consecutiveErrors}`,
    ai: '',
    duration: 0,
  });

  // Doctor (auto-diagnosis) summary
  try {
    const { getTodaySummary } = require('./doctor');
    const doctorStats = getTodaySummary();
    if (doctorStats.total > 0) {
      const patternDetails = Object.entries(doctorStats.patterns)
        .map(([id, p]) => `${id}: ${p.count}x (${p.healed} healed, ${p.severity})`)
        .join('; ');
      sections.push({
        agent: 'Doctor (Auto-diagnóstico)',
        status: doctorStats.unhealed > 0 ? 'ATENCIÓN' : 'OK',
        data: `Diagnósticos: ${doctorStats.total}, Curados: ${doctorStats.healed}, Sin resolver: ${doctorStats.unhealed}. ${patternDetails}`,
        ai: '',
        duration: 0,
      });
    }
  } catch (e) { /* doctor.js not available */ }

  // Social Optimizer report
  const socialReport = readReport('social-optimizer', date);
  if (socialReport) {
    const issueCount = socialReport.analysis?.issues?.length || 0;
    const mentionRate = socialReport.analysis?.mentionRate || 0;
    const newUsers = socialReport.metrics?.users?.newThisWeek || 0;
    sections.push({
      agent: 'Social Optimizer',
      status: issueCount > 2 ? 'ATENCIÓN' : issueCount > 0 ? 'REVISAR' : 'OK',
      data: `Issues: ${issueCount}, Mention rate: ${mentionRate}%, Usuarios nuevos (7d): ${newUsers}`,
      ai: socialReport.analysis?.aiAnalysis || (socialReport.analysis?.issues || []).join(' | '),
      duration: 0,
    });
  }

  return sections;
}

// ── Anthropic API balance ─────────────────────────────────────────────────

async function getAnthropicBalance() {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) return null;

  try {
    // Query all costs from account start to now
    let totalCents = 0;
    const now = new Date().toISOString();
    const months = [];
    for (let y = 2025; y <= new Date().getFullYear(); y++) {
      for (let m = 1; m <= 12; m++) {
        const start = `${y}-${String(m).padStart(2, '0')}-01T00:00:00Z`;
        if (start > now) break;
        const endM = m === 12
          ? `${y + 1}-01-01T00:00:00Z`
          : `${y}-${String(m + 1).padStart(2, '0')}-01T00:00:00Z`;
        months.push({ start, end: endM > now ? now : endM });
      }
    }

    for (const { start, end } of months) {
      const url = `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${start}&ending_at=${end}&bucket_width=1d&limit=31`;
      const res = await fetch(url, {
        headers: { 'anthropic-version': '2023-06-01', 'x-api-key': adminKey },
      });
      const data = await res.json();
      if (data.error) continue;
      for (const b of data.data || []) {
        for (const r of b.results || []) totalCents += parseFloat(r.amount || '0');
      }
    }

    const totalSpent = totalCents / 100;
    const balance = ANTHROPIC_CREDIT_TOTAL - totalSpent;
    return { totalCredit: ANTHROPIC_CREDIT_TOTAL, totalSpent: +totalSpent.toFixed(2), balance: +balance.toFixed(2) };
  } catch (err) {
    console.warn('[manager] Anthropic balance check failed:', err.message);
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function runManager() {
  console.log('[manager] Building daily executive report...');
  const startTime = Date.now();
  ensureDir(REPORTS_DIR);

  const today = new Date().toISOString().slice(0, 10);
  const sections = buildRawSummary(today);

  // Anthropic API balance
  console.log('[manager] Checking Anthropic API balance...');
  const anthropicBalance = await getAnthropicBalance();

  // Sync balance to dashboard config for real-time display
  if (anthropicBalance) {
    try {
      const cfgPath = require('path').join(__dirname, 'agent-config.json');
      const cfgFs = require('fs');
      const cfg = cfgFs.existsSync(cfgPath) ? JSON.parse(cfgFs.readFileSync(cfgPath, 'utf8')) : {};
      cfg._anthropicBalance = {
        amount: anthropicBalance.balance,
        currency: 'USD',
        totalCredit: anthropicBalance.totalCredit,
        totalSpent: anthropicBalance.totalSpent,
        lastChecked: new Date().toISOString(),
      };
      cfgFs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
      console.log(`[manager] Dashboard balance synced: $${anthropicBalance.balance.toFixed(2)}`);
    } catch (err) { console.warn('[manager] Failed to sync balance to dashboard:', err.message); }
  }

  // ── Collect memory summaries from all agents ──────────────────────────
  console.log('[manager] Reading agent memories...');
  const agentMemories = {};
  for (const agentId of ['sentinel', 'guardian', 'scout', 'watchdog']) {
    agentMemories[agentId] = mem.getMemorySummary(agentId);
  }

  const results = {
    timestamp: new Date().toISOString(),
    agent: 'manager',
    sections,
    agentMemories,
  };

  // Build memory context for AI
  let memoryBlock = '';
  const allEscalated = [];
  const allRegressions = [];
  for (const [agentId, summary] of Object.entries(agentMemories)) {
    if (summary.runCount === 0) continue;
    memoryBlock += `\n${agentId.toUpperCase()}: ${summary.openIssues} issues abiertos, tendencia ${summary.trendDirection}, ${summary.escalatedIssues} escalados`;
    for (const issue of summary.openIssueSummary) {
      if (issue.escalated) allEscalated.push({ agent: agentId, ...issue });
      if (issue.regression) allRegressions.push({ agent: agentId, ...issue });
    }
  }

  if (allEscalated.length > 0) {
    memoryBlock += `\n\nALERTA — ISSUES ESCALADOS (7+ dias sin resolver):`;
    for (const e of allEscalated) {
      memoryBlock += `\n- [${e.agent}/${e.severity}] ${e.description} (${e.daysSinceFirst} dias, ${e.occurrences} ocurrencias)`;
    }
  }
  if (allRegressions.length > 0) {
    memoryBlock += `\n\nALERTA — REGRESIONES (bugs que volvieron):`;
    for (const r of allRegressions) {
      memoryBlock += `\n- [${r.agent}/${r.severity}] ${r.description}`;
    }
  }

  // Auto-fix: apply manager-level corrections
  const managerIssues = sections
    .filter(s => s.status !== 'OK' && s.status !== 'SIN CAMBIOS')
    .map(s => `${s.agent}: ${s.data} ${s.ai?.slice(0, 100) || ''}`);
  managerIssues._sections = sections;

  const managerFixes = await applyFixes('manager', managerIssues, { anthropicBalance, allEscalated, allRegressions });
  if (managerFixes.length > 0) {
    console.log(`[manager] Auto-fixed ${managerFixes.length} issue(s)`);
    results.managerAutoFixes = managerFixes;
  }

  // Collect all auto-fixes from today (from all agents)
  const todayAutoFixes = getRecentFixes(1);
  results.allAutoFixes = todayAutoFixes;

  // AI synthesis
  let executiveSummary = '';
  const hasReports = sections.some(s => s.agent !== 'API Guard (Consumo)');

  if (hasReports) {
    console.log('[manager] Requesting AI executive summary...');
    try {
      const sectionTexts = sections.map(s =>
        `${s.agent} [${s.status}]: ${s.data}${s.ai ? '\nAnálisis: ' + s.ai.slice(0, 300) : ''}`
      ).join('\n\n');

      const { text } = await guardedCall(
        `Reportes de hoy:\n\n${sectionTexts}\n\nMEMORIA DEL SISTEMA (historial de issues):${memoryBlock || '\nSin historial previo — primera ejecución.'}`,
        {
          maxTokens: 600,
          agentId: 'manager',
          system: `Eres el Manager de un equipo de agentes de IA para YTubViral (SaaS para YouTubers).

Escribe un RESUMEN EJECUTIVO para el CEO (Javier). En español:
1. Estado general del sistema (1 línea)
2. Acciones urgentes si las hay — PRIORIZA regresiones y escalados (máx 3 bullets)
3. Estado de cada agente (1 línea cada uno) + tendencia (mejorando/empeorando/estable)
4. Recomendación del día

Tono: directo, profesional, sin adornos. Máximo 250 palabras.`,
        }
      );
      executiveSummary = text;
    } catch (err) {
      executiveSummary = `Error generando resumen: ${err.message}`;
    }
  } else {
    executiveSummary = 'No hay reportes de agentes disponibles hoy. Los agentes pueden no haber ejecutado aún.';
  }

  results.executiveSummary = executiveSummary;
  results.anthropicBalance = anthropicBalance;
  results.durationMs = Date.now() - startTime;

  // Save report
  const reportFile = path.join(REPORTS_DIR, `manager-${today}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));

  // Build and send email
  const dateStr = formatDate(new Date()).toUpperCase();
  const apiStats = getStats();

  let emailBody = `REPORTE EJECUTIVO DIARIO — ${dateStr}\n${'='.repeat(60)}\n\n`;
  emailBody += `${executiveSummary}\n\n`;
  emailBody += `${'─'.repeat(60)}\nDETALLE POR AGENTE\n${'─'.repeat(60)}\n\n`;

  for (const section of sections) {
    const icon = section.status === 'OK' || section.status === 'SIN CAMBIOS' ? '✅' : section.status === 'ATENCIÓN' || section.status === 'ISSUES' ? '⚠️' : 'ℹ️';
    emailBody += `${icon} ${section.agent} [${section.status}]\n`;
    emailBody += `   ${section.data}\n`;
    if (section.ai) {
      emailBody += `   AI: ${section.ai.slice(0, 200)}${section.ai.length > 200 ? '...' : ''}\n`;
    }
    emailBody += '\n';
  }

  // Memory section in email
  if (allEscalated.length > 0 || allRegressions.length > 0) {
    emailBody += `${'─'.repeat(60)}\n⚠️ ALERTAS DE MEMORIA\n${'─'.repeat(60)}\n\n`;
    if (allRegressions.length > 0) {
      emailBody += `🔴 REGRESIONES (bugs que volvieron):\n`;
      for (const r of allRegressions) emailBody += `   - [${r.agent}] ${r.description}\n`;
      emailBody += '\n';
    }
    if (allEscalated.length > 0) {
      emailBody += `🟠 ESCALADOS (7+ dias sin resolver):\n`;
      for (const e of allEscalated) emailBody += `   - [${e.agent}] ${e.description} (${e.daysSinceFirst}d)\n`;
      emailBody += '\n';
    }
  }

  // Memory trends
  emailBody += `${'─'.repeat(60)}\nTENDENCIAS\n`;
  for (const [agentId, summary] of Object.entries(agentMemories)) {
    if (summary.runCount === 0) continue;
    const arrow = summary.trendDirection === 'mejorando' ? '📈' : summary.trendDirection === 'empeorando' ? '📉' : '➡️';
    emailBody += `   ${arrow} ${agentId}: ${summary.openIssues} issues abiertos — ${summary.trendDirection} (run #${summary.runCount})\n`;
  }

  // Auto-fixes section in email
  if (todayAutoFixes.length > 0) {
    emailBody += `${'─'.repeat(60)}\n🔧 AUTO-FIXES APLICADOS HOY (${todayAutoFixes.length})\n${'─'.repeat(60)}\n\n`;
    for (const fix of todayAutoFixes) {
      const outcomeIcon = fix.outcome === 'effective' ? '✅' : fix.outcome === 'ineffective' ? '❌' : '⏳';
      emailBody += `   ${outcomeIcon} [${fix.agent}] ${fix.description}: ${fix.detail}\n`;
    }
    emailBody += '\n';
  }

  // Effectiveness report
  const effectiveness = getEffectivenessReport();
  const disabledFixes = getDisabledFixes();
  const effEntries = Object.entries(effectiveness).filter(([, e]) => e.total > 0);
  if (effEntries.length > 0 || Object.keys(disabledFixes).length > 0) {
    emailBody += `${'─'.repeat(60)}\n📊 EFECTIVIDAD AUTO-FIX\n${'─'.repeat(60)}\n\n`;
    for (const [key, eff] of effEntries) {
      const icon = eff.disabled ? '🚫' : eff.successRate > 0.7 ? '🟢' : eff.successRate > 0.3 ? '🟡' : '🔴';
      emailBody += `   ${icon} ${key}: ${eff.successRatePct} (${eff.successes}/${eff.total})${eff.disabled ? ' — DESHABILITADO' : ''}\n`;
    }
    if (Object.keys(disabledFixes).length > 0) {
      emailBody += `\n   Fixes deshabilitados: ${Object.keys(disabledFixes).length}\n`;
      for (const [key, info] of Object.entries(disabledFixes)) {
        emailBody += `     🚫 ${key}: ${info.reason}\n`;
      }
    }
    emailBody += '\n';
  }

  // Auto-replies a externos — siempre visibles para revisión humana
  const gmailToday = readReport('gmail', today);
  const autoReplied = (gmailToday && Array.isArray(gmailToday)) ? gmailToday.filter(e => e.replied) : [];
  if (autoReplied.length > 0) {
    emailBody += `${'─'.repeat(60)}\n📧 AUTO-REPLIES ENVIADOS A EXTERNOS (${autoReplied.length})\n${'─'.repeat(60)}\n\n`;
    for (const e of autoReplied) {
      emailBody += `   Para: ${e.from}\n`;
      emailBody += `   Asunto: ${e.subject}\n`;
      emailBody += `   Respuesta: ${(e.replySnippet || '(sin preview)').slice(0, 150)}\n\n`;
    }
  }

  emailBody += `\n${'─'.repeat(60)}\nCONSUMO API\n`;
  emailBody += `   Llamadas hoy: ${apiStats.callCount}\n`;
  emailBody += `   Tokens: ${apiStats.dailyTokensUsed} / ${apiStats.dailyBudget} (${apiStats.budgetUsedPercent}%)\n`;
  emailBody += `   Circuit breaker: ${apiStats.circuitBreakerOpen ? 'ABIERTO ⚠️' : 'Cerrado ✅'}\n`;

  if (anthropicBalance) {
    const balanceIcon = anthropicBalance.balance < 1 ? '🔴' : anthropicBalance.balance < 2 ? '🟡' : '🟢';
    emailBody += `\n${'─'.repeat(60)}\n${balanceIcon} SALDO ANTHROPIC API\n`;
    emailBody += `   Crédito total: $${anthropicBalance.totalCredit.toFixed(2)}\n`;
    emailBody += `   Gastado: $${anthropicBalance.totalSpent.toFixed(2)}\n`;
    emailBody += `   Saldo restante: $${anthropicBalance.balance.toFixed(2)}\n`;
  }

  emailBody += `\n${'='.repeat(60)}\nYTubViral Agent System — Manager v2.0 (con memoria)\n`;

  try {
    await sendEmail(`📋 Reporte Ejecutivo YTubViral — ${today}`, emailBody);
    console.log('[manager] Executive report email sent');
    results.emailSent = true;
  } catch (err) {
    console.error('[manager] Failed to send email:', err.message);
    results.emailSent = false;
    results.emailError = err.message;
  }

  // Save Manager memory
  const managerMemory = mem.loadMemory('manager');
  mem.recordTrend(managerMemory, {
    agentsReporting: sections.filter(s => s.agent !== 'API Guard (Consumo)').length,
    totalEscalated: allEscalated.length,
    totalRegressions: allRegressions.length,
    emailSent: results.emailSent,
    apiCallsToday: apiStats.callCount,
    apiTokensToday: apiStats.dailyTokensUsed,
  });
  mem.recordRun(managerMemory, results.durationMs);
  mem.saveMemory('manager', managerMemory);

  // Clean old reports and logs (retain 30 days)
  try {
    const cleaned = cleanOldFiles();
    results.filesCleaned = cleaned;
  } catch (err) {
    console.warn('[manager] Cleanup error:', err.message);
  }

  console.log(`[manager] Done (${results.durationMs}ms)`);
  return results;
}

// ── Auto-Fix Definitions ──────────────────────────────────────────────────────

const MODEL_FALLBACK_CHAIN = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];

registerFixes('manager', [
  {
    id: 'model-fallback-on-api-error',
    description: 'Cambiar modelo a alternativa más barata cuando un agente falla con error de API',
    cooldownMs: 48 * 3600000, // 2 days between model changes
    condition: (issues) => issues.some(i => /404|API error|model.*not found/i.test(i)),
    apply: (config, issues) => {
      const errorAgents = [];
      for (const section of (issues._sections || [])) {
        if (section.ai && /404|API error|model.*not found/i.test(section.ai)) {
          // Find which agent config module this corresponds to
          const agentMap = { 'Scout': 'scout', 'Watchdog': 'watchdog', 'Guardian': 'guardian', 'Social Optimizer': 'social-optimizer' };
          for (const [name, mod] of Object.entries(agentMap)) {
            if (section.agent?.includes(name) && config[mod]?.model) {
              const currentIdx = MODEL_FALLBACK_CHAIN.indexOf(config[mod].model);
              if (currentIdx >= 0 && currentIdx < MODEL_FALLBACK_CHAIN.length - 1) {
                const prev = config[mod].model;
                config[mod].model = MODEL_FALLBACK_CHAIN[currentIdx + 1];
                errorAgents.push(`${mod}: ${prev} → ${config[mod].model}`);
              }
            }
          }
        }
      }
      if (errorAgents.length === 0) return { changed: false };
      return { changed: true, detail: `Model fallback applied: ${errorAgents.join(', ')}` };
    },
  },
  {
    id: 'budget-downgrade-models',
    description: 'Degradar modelos caros a Haiku cuando el saldo es bajo (<$1)',
    cooldownMs: 7 * 86400000,
    condition: (issues, metrics) => {
      const balance = metrics.anthropicBalance?.balance;
      return balance !== undefined && balance < 1.0;
    },
    apply: (config, issues, metrics) => {
      const downgradeable = ['scout', 'watchdog', 'social-optimizer'];
      const changes = [];
      for (const mod of downgradeable) {
        if (config[mod]?.model && config[mod].model !== 'claude-haiku-4-5-20251001') {
          const prev = config[mod].model;
          config[mod].model = 'claude-haiku-4-5-20251001';
          changes.push(`${mod}: ${prev} → haiku`);
        }
      }
      if (changes.length === 0) return { changed: false };
      return { changed: true, detail: `Budget low ($${metrics.anthropicBalance.balance.toFixed(2)}), downgraded: ${changes.join(', ')}` };
    },
  },
  {
    id: 'escalate-persistent-failures',
    description: 'Enviar alerta crítica cuando un agente lleva 3+ días con errores',
    cooldownMs: 3 * 86400000,
    condition: (issues, metrics) => {
      return (metrics.allEscalated || []).length > 0;
    },
    apply: async (config, issues, metrics) => {
      const escalated = metrics.allEscalated || [];
      await sendEmail(
        '[YTubViral] CRÍTICO: Agentes con errores persistentes',
        `Los siguientes issues llevan 7+ días sin resolverse:\n\n${escalated.map(e => `- [${e.agent}/${e.severity}] ${e.description} (${e.daysSinceFirst} días)`).join('\n')}\n\nSe requiere intervención manual.`
      ).catch(() => {});
      return { changed: false, detail: `Alerta de escalación enviada: ${escalated.length} issues` };
    },
  },
]);

module.exports = { runManager };
