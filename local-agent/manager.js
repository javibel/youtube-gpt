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
// Balance is managed via the dashboard (PUT /api/balance) — agent-config.json is the source of truth

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

  // SEO Optimizer report
  const seoReport = readReport('seo-optimizer', date);
  if (seoReport) {
    const issueCount = seoReport.analysis?.issues?.length || 0;
    // Bug fijo 2026-07-05: mismo patrón que Funnel Optimizer — leía metrics.current.clicks
    // (no existe) en vez de metrics.current.totals.clicks. Hoy ambos dan 0 por casualidad
    // (ver project_seo.md, 0% indexado), pero con el path viejo nunca reflejaría una mejora real.
    const clicks = seoReport.metrics?.current?.totals?.clicks || 0;
    const ctr = seoReport.metrics?.current?.totals?.ctr || 0;
    sections.push({
      agent: 'SEO Optimizer',
      status: issueCount > 2 ? 'ATENCIÓN' : issueCount > 0 ? 'REVISAR' : 'OK',
      data: `Issues: ${issueCount}, Clicks 7d: ${clicks}, CTR: ${(ctr * 100).toFixed(1)}%`,
      ai: (seoReport.analysis?.issues || []).join(' | '),
      duration: 0,
    });
  }

  // Funnel Optimizer report
  const funnelReport = readReport('funnel-optimizer', date);
  if (funnelReport) {
    const issueCount = funnelReport.analysis?.issues?.length || 0;
    // Bug fijo 2026-07-05: leía metrics.activation.cohortRate (no existe) en vez de
    // metrics.activation.cohort14d.rate (ya viene en % , no en fracción) — desde el
    // 29/06 el email ejecutivo mostraba siempre "0%" aunque la activación real subía.
    const activation = funnelReport.metrics?.activation?.cohort14d?.rate || 0;
    const newUsers = funnelReport.metrics?.users?.newThisWeek || 0;
    sections.push({
      agent: 'Funnel Optimizer',
      status: issueCount > 2 ? 'ATENCIÓN' : issueCount > 0 ? 'REVISAR' : 'OK',
      data: `Issues: ${issueCount}, Activación cohorte: ${activation.toFixed(0)}%, Nuevos 7d: ${newUsers}`,
      ai: (funnelReport.analysis?.issues || []).join(' | '),
      duration: 0,
    });
  }

  // Infra Optimizer report
  const infraReport = readReport('infra-optimizer', date);
  if (infraReport) {
    const issueCount = infraReport.analysis?.issues?.length || 0;
    const diskPct = infraReport.metrics?.disk?.usedPercent || 0;
    sections.push({
      agent: 'Infra Optimizer',
      status: issueCount > 2 ? 'ATENCIÓN' : issueCount > 0 ? 'REVISAR' : 'OK',
      data: `Issues: ${issueCount}, Disco: ${diskPct}%`,
      ai: (infraReport.analysis?.issues || []).join(' | '),
      duration: 0,
    });
  }

  // Meta-Optimizer report (weekly, may not exist today)
  const metaReport = readReport('meta-optimizer', date);
  if (metaReport) {
    // Bug fijo 2026-07-05: mismo patrón — leía metaReport.actionsApplied/fixesAnalyzed/
    // systemDiagnosis (no existen) en vez de metaReport.phases.autoTune.changesApplied,
    // phases.analysis.fixCount y phases.claudeAnalysis.diagnosis. Antes SIEMPRE mostraba
    // "0 acciones aplicadas" aunque el meta-optimizer sí ajustara cooldowns/fixes cada domingo.
    const actionsApplied = metaReport.phases?.autoTune?.changesApplied || 0;
    sections.push({
      agent: 'Meta-Optimizer',
      status: actionsApplied > 0 ? 'AJUSTES' : 'OK',
      data: `Acciones aplicadas: ${actionsApplied}, Fixes analizados: ${metaReport.phases?.analysis?.fixCount || 0}`,
      ai: metaReport.phases?.claudeAnalysis?.diagnosis || '',
      duration: 0,
    });
  }

  // Feature Monitor report (2x/day)
  const featureReport = readReport('feature-monitor', date);
  if (featureReport) {
    const healthPct = featureReport.healthPct || 0;
    const unhealed = featureReport.unhealed || 0;
    const healed = featureReport.healed || 0;
    const total = featureReport.total || 0;
    const passing = featureReport.passing || 0;
    const statusLabel = unhealed > 0 ? 'ATENCIÓN' : healthPct < 100 ? 'REVISAR' : 'OK';
    const unhealedNames = (featureReport.unhealedIssues || []).map(u => u.feature).join(', ');
    sections.push({
      agent: 'Feature Monitor',
      status: statusLabel,
      data: `Health: ${healthPct}% (${passing}/${total}), Healed: ${healed}, Unhealed: ${unhealed}`,
      ai: unhealedNames ? `Unhealed: ${unhealedNames}` : 'All endpoints healthy',
      duration: 0,
    });
  }

  // DMARC Monitor report
  const dmarcReport = readReport('dmarc', date);
  if (dmarcReport) {
    const severity = dmarcReport.severity || 'ok';
    const statusLabel = severity === 'critical' ? 'ALERTA' : severity === 'info' ? 'REVISAR' : 'OK';
    const issueText = (dmarcReport.issues || []).join(' | ');
    sections.push({
      agent: 'DMARC Monitor (Email Auth)',
      status: statusLabel,
      data: `Reportes: ${dmarcReport.reportsAnalyzed || 0}, Emails: ${dmarcReport.totalEmails || 0}, Pass: ${dmarcReport.passRate || 100}%, Fails: ${dmarcReport.totalFails || 0}`,
      ai: issueText || 'Autenticación email OK — sin suplantación detectada',
      duration: 0,
    });
  }

  return sections;
}

// ── Anthropic API balance ─────────────────────────────────────────────────
// Source of truth: agent-config.json._anthropicBalance.amount
// Set via dashboard PUT /api/balance. claude.js deducts per-call costs.
// Manager only READS, never overwrites.

function getAnthropicBalance() {
  try {
    const cfgPath = path.join(__dirname, 'agent-config.json');
    const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
    const bal = cfg._anthropicBalance || {};
    return {
      balance: bal.amount ?? null,
      totalSpent: bal.totalSpent ?? null,
      spentToday: bal.totalSpentToday ?? 0,
      lastChecked: bal.lastChecked ?? null,
    };
  } catch (err) {
    console.warn('[manager] Anthropic balance read failed:', err.message);
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

  // Anthropic API balance — read from agent-config.json (set via dashboard)
  console.log('[manager] Reading Anthropic API balance...');
  const anthropicBalance = getAnthropicBalance();
  if (anthropicBalance?.balance != null) {
    console.log(`[manager] Balance: $${anthropicBalance.balance.toFixed(2)}`);
  }

  // ── Collect memory summaries from all agents ──────────────────────────
  console.log('[manager] Reading agent memories...');
  const agentMemories = {};
  for (const agentId of ['sentinel', 'guardian', 'scout', 'watchdog', 'seo-optimizer', 'funnel-optimizer', 'infra-optimizer', 'meta-optimizer']) {
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
  // 'ÚLTIMO REPORTE' means the agent ran but found nothing new — not an error, exclude from issues
  const NOISE_STATUSES = new Set(['OK', 'SIN CAMBIOS', 'ÚLTIMO REPORTE', 'NO CHANGES', 'SIN DATOS']);
  const managerIssues = sections
    .filter(s => !NOISE_STATUSES.has(s.status))
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
      // ── GROUND TRUTH: compute the ONLY real incidents that may drive "urgent actions" ──
      // Parses structured counts (Critical/High) + memory regressions/escalations. The AI
      // summary must NOT invent urgency beyond this list — kills the recurring false alarms.
      const realIncidents = [];
      for (const s of sections) {
        const d = s.data || '';
        const crit = parseInt((d.match(/Critical:\s*(\d+)/i) || [])[1] || '0', 10);
        const high = parseInt((d.match(/High:\s*(\d+)/i) || [])[1] || '0', 10);
        if (crit > 0 || high > 0) realIncidents.push(`${s.agent}: ${crit} critical, ${high} high`);
      }
      for (const r of (allRegressions || [])) realIncidents.push(`REGRESIÓN [${r.agent}]: ${r.description}`);
      for (const e of (allEscalated || [])) realIncidents.push(`ESCALADO [${e.agent}]: ${e.description} (${e.daysSinceFirst}d)`);
      const incidentsBlock = realIncidents.length
        ? realIncidents.map(i => '- ' + i).join('\n')
        : 'NINGUNA — cero incidencias críticas, altas, escaladas o regresiones hoy.';

      // Section data only (counts/status). The AI prose is given as low-trust context, never as severity.
      const sectionTexts = sections.map(s =>
        `${s.agent} [${s.status}]: ${s.data}${s.ai ? '\n  (contexto, NO determina urgencia): ' + s.ai.slice(0, 140) : ''}`
      ).join('\n\n');

      const todayStr = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' });
      const { text } = await guardedCall(
        `FECHA DE HOY: ${todayStr} (úsala, no inventes otra).\n\nINCIDENCIAS REALES HOY (única fuente válida para "acciones urgentes"):\n${incidentsBlock}\n\nReportes por agente:\n\n${sectionTexts}\n\nMEMORIA DEL SISTEMA (historial):${memoryBlock || '\nSin historial previo.'}`,
        {
          maxTokens: 600,
          agentId: 'manager',
          system: `Eres el Manager de un equipo de agentes de IA para YTubViral (SaaS para YouTubers).

Escribe un RESUMEN EJECUTIVO para el CEO (Javier). En español:
1. Estado general del sistema (1 línea)
2. Acciones urgentes — copia EXACTAMENTE los items del bloque "INCIDENCIAS REALES HOY". Si dice "NINGUNA", escribe literalmente "Sin incidencias críticas hoy." y NADA más en esta sección.
3. Estado de cada agente (1 línea) + tendencia (mejorando/empeorando/estable)
4. Recomendación del día

REGLAS DE PRECISIÓN (obligatorias — el CEO pierde confianza si exageras):
- El bloque "INCIDENCIAS REALES HOY" es la ÚNICA fuente de urgencia. PROHIBIDO marcar como urgente/crítico cualquier cosa que NO esté literalmente en ese bloque.
- La prosa de "contexto" y la memoria NO determinan urgencia. Si la prosa suena alarmante pero la incidencia no está en el bloque, NO es urgente.
- NUNCA subas de nivel un medium/low a crítico. NUNCA repitas un issue que la memoria marca como resuelto o que el agente reporta a 0.
- No inventes cifras. Usa la fecha de HOY.

Tono: directo, profesional, sin dramatismo. Máximo 250 palabras.`,
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

  if (anthropicBalance?.balance != null) {
    const balanceIcon = anthropicBalance.balance < 1 ? '🔴' : anthropicBalance.balance < 5 ? '🟡' : '🟢';
    emailBody += `\n${'─'.repeat(60)}\n${balanceIcon} SALDO ANTHROPIC API\n`;
    emailBody += `   Saldo: $${anthropicBalance.balance.toFixed(2)}\n`;
    if (anthropicBalance.spentToday > 0) {
      emailBody += `   Gasto hoy: $${anthropicBalance.spentToday.toFixed(4)}\n`;
    }
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
