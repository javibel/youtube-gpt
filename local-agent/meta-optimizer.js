'use strict';

/**
 * META-OPTIMIZER — The brain that improves the entire auto-improvement system.
 *
 * Runs weekly (Sunday). Uses Claude Opus to analyze the effectiveness of ALL
 * fixes across ALL agents and propose system-level improvements.
 *
 * Pipeline:
 *   Phase 1: Analyze effectiveness (no AI, free)
 *   Phase 2: Auto-tune based on rules (no AI, free)
 *   Phase 3: Claude Opus analysis (1 guardedCall)
 *   Phase 4: Execute recommended actions
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { guardedCall } = require('./api-guard');
const mem = require('./agent-memory');
const { loadFixLog, reenableFix, registerFixes, applyFixes } = require('./auto-fix');
const { sendEmail } = require('./reports');
const config = require('./config');

const REPORTS_DIR = path.join(__dirname, 'reports');
const MEMORY_DIR = path.join(__dirname, 'memory');
const PROPOSED_FIXES_FILE = path.join(REPORTS_DIR, 'proposed-fixes.json');
const META_LOG_FILE = path.join(REPORTS_DIR, 'meta-optimizer-log.json');
const TUNING_FILE = path.join(REPORTS_DIR, 'meta-optimizer-tuning.json');

const AGENT_ID = 'meta-optimizer';

// ── Safety bounds ──────────────────────────────────────────────────────────

const SAFETY = {
  maxChangesPerRun: 3,
  minCooldownDays: 1,
  maxCooldownDays: 30,
  enabled: true, // kill switch — overridden by agent-config.json
};

function isEnabled() {
  return config.getModule('meta-optimizer')?.enabled !== false;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureReportsDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadMetaLog() {
  return readJsonSafe(META_LOG_FILE, { runs: [] });
}

function saveMetaLog(log) {
  // Keep last 50 runs
  if (log.runs.length > 50) log.runs = log.runs.slice(-50);
  writeJson(META_LOG_FILE, log);
}

function loadProposedFixes() {
  return readJsonSafe(PROPOSED_FIXES_FILE, { fixes: [] });
}

function saveProposedFixes(data) {
  writeJson(PROPOSED_FIXES_FILE, data);
}

function loadTuning() {
  return readJsonSafe(TUNING_FILE, { overrides: {}, lastUpdated: null });
}

function saveTuning(data) {
  data.lastUpdated = new Date().toISOString();
  writeJson(TUNING_FILE, data);
}

/**
 * Parse JSON from Claude response, handling markdown fences and trailing text.
 */
function parseClaudeJson(text) {
  if (!text) return null;

  // Strip markdown code fences
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract first JSON object
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ── Phase 1: Analyze effectiveness (no AI) ─────────────────────────────────

function analyzeEffectiveness() {
  const fixLog = loadFixLog();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // 1. Fix summary from effectiveness data
  const fixSummary = {};
  for (const [key, eff] of Object.entries(fixLog.effectiveness || {})) {
    fixSummary[key] = {
      total: eff.total,
      successes: eff.successes,
      failures: eff.failures,
      consecutiveFailures: eff.consecutiveFailures,
      successRate: eff.successRate,
      successRatePct: `${Math.round(eff.successRate * 100)}%`,
    };
  }

  // 2. Disabled fixes
  const disabledFixes = { ...(fixLog.disabled || {}) };

  // 3. Persistent issues from all agent memories
  const persistentIssues = [];
  const agentHealth = {};

  const memoryFiles = [];
  try {
    const files = fs.readdirSync(MEMORY_DIR);
    for (const f of files) {
      if (f.endsWith('.json')) memoryFiles.push(f);
    }
  } catch { /* memory dir may not exist */ }

  for (const file of memoryFiles) {
    const agentId = file.replace('.json', '');
    try {
      const memory = mem.loadMemory(agentId);
      const openIssues = (memory.knownIssues || []).filter(i => i.status === 'open');
      const escalated = openIssues.filter(i => i.escalated);

      agentHealth[agentId] = {
        lastRun: memory.meta?.lastRun || null,
        runCount: memory.meta?.runCount || 0,
        issueCount: openIssues.length,
        escalatedCount: escalated.length,
      };

      // Find persistent issues (escalated = open 7+ days)
      for (const issue of escalated) {
        const daysSince = Math.floor(
          (Date.now() - new Date(issue.firstSeen).getTime()) / 86400000
        );
        persistentIssues.push({
          agent: agentId,
          issueId: issue.id,
          description: issue.description,
          severity: issue.severity,
          daysSinceFirstSeen: daysSince,
          occurrences: issue.occurrences,
        });
      }
    } catch { /* skip corrupted memory files */ }
  }

  // 4. Check which agents ran this week (look for reports)
  try {
    const reportFiles = fs.readdirSync(REPORTS_DIR);
    for (const agent of Object.keys(agentHealth)) {
      const hasRecentReport = reportFiles.some(f => {
        const match = f.match(new RegExp(`^${agent}-(\\d{4}-\\d{2}-\\d{2})\\.json$`));
        return match && match[1] >= weekAgo;
      });
      agentHealth[agent].ranThisWeek = hasRecentReport || (
        agentHealth[agent].lastRun && agentHealth[agent].lastRun >= weekAgo
      );
    }
  } catch { /* reports dir might not exist */ }

  // 5. Coverage gaps — persistent issues not addressed by any fix
  const coverageGaps = [];
  const fixKeys = new Set(Object.keys(fixLog.effectiveness || {}));

  for (const issue of persistentIssues) {
    // Check if any fix targets this agent and relates to this issue
    const hasMatchingFix = [...fixKeys].some(key => {
      return key.startsWith(`${issue.agent}:`) &&
        (fixLog.fixes || []).some(f =>
          f.agent === issue.agent &&
          f.targetIssue &&
          (f.targetIssue.includes(issue.description.slice(0, 30)) ||
           issue.description.includes((f.targetIssue || '').slice(0, 30)))
        );
    });

    if (!hasMatchingFix) {
      coverageGaps.push(
        `${issue.agent}: "${issue.description}" has been open ${issue.daysSinceFirstSeen} days but no fix targets it`
      );
    }
  }

  return {
    fixSummary,
    disabledFixes,
    persistentIssues,
    agentHealth,
    coverageGaps,
    analysisDate: today,
  };
}

// ── Phase 2: Auto-tune (rule-based, no AI) ─────────────────────────────────

function autoTune(analysis) {
  const fixLog = loadFixLog();
  const tuning = loadTuning();
  const changes = [];
  let changeCount = 0;

  for (const [key, eff] of Object.entries(analysis.fixSummary)) {
    if (changeCount >= SAFETY.maxChangesPerRun) break;

    // Rule 1: High success rate (>80% over 3+ apps) — reduce cooldown by 20%
    if (eff.successRate > 0.8 && eff.total >= 3) {
      const currentOverride = tuning.overrides[key]?.cooldownMultiplier || 1.0;
      const newMultiplier = Math.max(0.4, currentOverride * 0.8); // floor at 0.4x
      if (newMultiplier < currentOverride) {
        if (!tuning.overrides[key]) tuning.overrides[key] = {};
        tuning.overrides[key].cooldownMultiplier = Math.round(newMultiplier * 100) / 100;
        tuning.overrides[key].reason = `High success rate: ${eff.successRatePct} over ${eff.total} applications`;
        tuning.overrides[key].tunedAt = new Date().toISOString();
        changes.push({
          type: 'reduce_cooldown',
          fixKey: key,
          from: currentOverride,
          to: tuning.overrides[key].cooldownMultiplier,
          reason: `Success rate ${eff.successRatePct} over ${eff.total} apps — cooldown reduced 20%`,
        });
        changeCount++;
      }
    }

    // Rule 2: Low success rate (<30% over 5+ apps) — increase cooldown by 50%
    if (eff.successRate < 0.3 && eff.total >= 5) {
      const currentOverride = tuning.overrides[key]?.cooldownMultiplier || 1.0;
      const newMultiplier = Math.min(3.0, currentOverride * 1.5); // cap at 3x
      if (newMultiplier > currentOverride) {
        if (!tuning.overrides[key]) tuning.overrides[key] = {};
        tuning.overrides[key].cooldownMultiplier = Math.round(newMultiplier * 100) / 100;
        tuning.overrides[key].reason = `Low success rate: ${eff.successRatePct} over ${eff.total} applications`;
        tuning.overrides[key].tunedAt = new Date().toISOString();
        changes.push({
          type: 'increase_cooldown',
          fixKey: key,
          from: currentOverride,
          to: tuning.overrides[key].cooldownMultiplier,
          reason: `Success rate ${eff.successRatePct} over ${eff.total} apps — cooldown increased 50%`,
        });
        changeCount++;
      }
    }
  }

  // Rule 3: Re-enable disabled fixes if original issue hasn't appeared in 14+ days
  for (const [key, info] of Object.entries(analysis.disabledFixes)) {
    if (changeCount >= SAFETY.maxChangesPerRun) break;

    const [agentId] = key.split(':');
    const relatedIssue = analysis.persistentIssues.find(
      p => p.agent === agentId && info.lastDetail &&
        (p.description.includes(info.lastDetail.slice(0, 30)) ||
         info.lastDetail.includes(p.description.slice(0, 30)))
    );

    // If the issue that caused disabling hasn't appeared recently, re-enable
    if (!relatedIssue) {
      const disabledAt = new Date(info.disabledAt || 0).getTime();
      const daysSinceDisabled = Math.floor((Date.now() - disabledAt) / 86400000);

      if (daysSinceDisabled >= 14) {
        const [agent, fixId] = key.split(':');
        const reenabled = reenableFix(agent, fixId);
        if (reenabled) {
          changes.push({
            type: 'reenable_fix',
            fixKey: key,
            reason: `Disabled ${daysSinceDisabled} days ago, original issue not seen in 14+ days`,
          });
          changeCount++;
        }
      }
    }
  }

  if (changes.length > 0) {
    saveTuning(tuning);
  }

  return changes;
}

// ── Phase 3: Claude Opus analysis ──────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el meta-optimizador del sistema multi-agente de YTubViral. Tu trabajo es analizar la EFECTIVIDAD del propio sistema de auto-mejora y proponer mejoras.

DATOS QUE RECIBES:
- Efectividad de cada fix (cuantas veces se aplico, % exito)
- Fixes desactivados y por que
- Issues persistentes que ningun fix resuelve
- Salud de cada agente

PUEDES PROPONER:
1. "tune_cooldown" — ajustar cooldown de un fix (fixKey, newCooldownDays, reason)
2. "reenable_fix" — re-activar un fix desactivado (fixKey, reason)
3. "propose_new_fix" — proponer un NUEVO fix para un issue no cubierto (requiere aprobacion humana)
4. "alert" — escalacion al owner

Para propose_new_fix, especifica:
- agent: en que agente viviria
- trigger: patron regex que matchea en issues
- actionType: "adjust_config" | "send_alert" | "modify_override"
- description: que haria el fix
- reasoning: por que crees que funcionaria

Responde en JSON:
{
  "systemDiagnosis": "evaluacion general del sistema de auto-mejora",
  "actions": [
    { "type": "tune_cooldown", "fixKey": "social-optimizer:claude-unified-diagnosis", "newCooldownDays": 2, "reason": "..." },
    { "type": "reenable_fix", "fixKey": "guardian:npm-audit-fix", "reason": "..." },
    { "type": "propose_new_fix", "agent": "guardian", "trigger": "npm_vuln", "actionType": "send_alert", "description": "...", "reasoning": "..." },
    { "type": "alert", "message": "..." }
  ],
  "reasoning": "analisis general de que funciona y que no"
}

Si no hay acciones necesarias, usa "actions": null.
Responde SOLO con el JSON.`;

async function claudeAnalysis(analysis, autoTuneChanges) {
  const prompt = `Analiza el estado del sistema de auto-mejora de YTubViral.

== FIX EFFECTIVENESS ==
${JSON.stringify(analysis.fixSummary, null, 2)}

== DISABLED FIXES ==
${JSON.stringify(analysis.disabledFixes, null, 2)}

== PERSISTENT ISSUES (escalated, 7+ days) ==
${JSON.stringify(analysis.persistentIssues, null, 2)}

== AGENT HEALTH ==
${JSON.stringify(analysis.agentHealth, null, 2)}

== COVERAGE GAPS (issues with no fix) ==
${JSON.stringify(analysis.coverageGaps, null, 2)}

== AUTO-TUNE CHANGES ALREADY APPLIED THIS RUN ==
${JSON.stringify(autoTuneChanges, null, 2)}

Evalua el sistema y propone mejoras si las hay. Si todo funciona bien, dilo tambien.`;

  const result = await guardedCall(prompt, {
    maxTokens: 2000,
    // model resolved from agent-config.json → meta-optimizer.model
    agentId: AGENT_ID,
    system: SYSTEM_PROMPT,
  });

  return parseClaudeJson(result.text);
}

// ── Phase 4: Execute actions ───────────────────────────────────────────────

async function executeActions(recommendations, analysis) {
  if (!recommendations || !Array.isArray(recommendations.actions)) {
    return { executed: [], skipped: 'No actions recommended' };
  }

  const executed = [];
  const errors = [];
  let changeCount = 0;

  for (const action of recommendations.actions) {
    if (changeCount >= SAFETY.maxChangesPerRun) {
      errors.push({ action, error: 'Max changes per run reached' });
      break;
    }

    try {
      switch (action.type) {
        case 'tune_cooldown': {
          // Validate bounds
          const days = Number(action.newCooldownDays);
          if (isNaN(days) || days < SAFETY.minCooldownDays || days > SAFETY.maxCooldownDays) {
            errors.push({ action, error: `Cooldown ${days}d out of bounds [${SAFETY.minCooldownDays}-${SAFETY.maxCooldownDays}]` });
            break;
          }
          // Save tuning override (auto-fix.js can read this)
          const tuning = loadTuning();
          if (!tuning.overrides[action.fixKey]) tuning.overrides[action.fixKey] = {};
          tuning.overrides[action.fixKey].cooldownDaysOverride = days;
          tuning.overrides[action.fixKey].reason = action.reason || 'Claude recommendation';
          tuning.overrides[action.fixKey].tunedAt = new Date().toISOString();
          tuning.overrides[action.fixKey].source = 'claude-opus';
          saveTuning(tuning);
          executed.push({ type: 'tune_cooldown', fixKey: action.fixKey, newCooldownDays: days });
          changeCount++;
          console.log(`[meta-optimizer] Tuned cooldown: ${action.fixKey} -> ${days}d`);
          break;
        }

        case 'reenable_fix': {
          const [agent, fixId] = (action.fixKey || '').split(':');
          if (!agent || !fixId) {
            errors.push({ action, error: 'Invalid fixKey format (expected agent:fixId)' });
            break;
          }
          const success = reenableFix(agent, fixId);
          if (success) {
            executed.push({ type: 'reenable_fix', fixKey: action.fixKey });
            changeCount++;
            console.log(`[meta-optimizer] Re-enabled fix: ${action.fixKey}`);
          } else {
            errors.push({ action, error: 'Fix was not disabled or key not found' });
          }
          break;
        }

        case 'propose_new_fix': {
          const proposed = loadProposedFixes();
          const newFix = {
            id: `proposed-${Date.now()}`,
            agent: action.agent,
            trigger: action.trigger,
            actionType: action.actionType,
            description: action.description,
            reasoning: action.reasoning,
            status: 'pending_approval',
            proposedAt: new Date().toISOString(),
            proposedBy: 'meta-optimizer-claude-opus',
          };
          proposed.fixes.push(newFix);
          saveProposedFixes(proposed);
          executed.push({ type: 'propose_new_fix', id: newFix.id, agent: action.agent });
          console.log(`[meta-optimizer] Proposed new fix: ${newFix.id} for ${action.agent}`);

          // Email owner about the proposal
          try {
            await sendEmail(
              `[Meta-Optimizer] New fix proposed for ${action.agent}`,
              `The meta-optimizer proposes a new fix:\n\n` +
              `Agent: ${action.agent}\n` +
              `Trigger: ${action.trigger}\n` +
              `Action: ${action.actionType}\n` +
              `Description: ${action.description}\n\n` +
              `Reasoning: ${action.reasoning}\n\n` +
              `Status: PENDING APPROVAL\n` +
              `Review in: ${PROPOSED_FIXES_FILE}\n`
            );
          } catch (emailErr) {
            console.error(`[meta-optimizer] Failed to send proposal email:`, emailErr.message);
          }
          break;
        }

        case 'alert': {
          try {
            await sendEmail(
              `[Meta-Optimizer] Alert`,
              `The meta-optimizer raised an alert:\n\n${action.message}\n\n` +
              `System diagnosis: ${recommendations.systemDiagnosis || 'N/A'}\n`
            );
            executed.push({ type: 'alert', message: (action.message || '').slice(0, 200) });
            console.log(`[meta-optimizer] Alert sent to owner`);
          } catch (emailErr) {
            errors.push({ action, error: `Email failed: ${emailErr.message}` });
          }
          break;
        }

        default:
          errors.push({ action, error: `Unknown action type: ${action.type}` });
      }
    } catch (err) {
      errors.push({ action, error: err.message });
      console.error(`[meta-optimizer] Action failed:`, err.message);
    }
  }

  return { executed, errors: errors.length > 0 ? errors : undefined };
}

// ── Main pipeline ──────────────────────────────────────────────────────────

async function runMetaOptimizer() {
  const startTime = Date.now();
  console.log('[meta-optimizer] Starting weekly meta-optimization...');

  if (!isEnabled()) {
    console.log('[meta-optimizer] Disabled via agent-config.json. Skipping.');
    return { skipped: true, reason: 'disabled' };
  }

  const report = {
    timestamp: new Date().toISOString(),
    phases: {},
    errors: [],
  };

  try {
    // Phase 1: Analyze effectiveness
    console.log('[meta-optimizer] Phase 1: Analyzing fix effectiveness...');
    const analysis = analyzeEffectiveness();
    report.phases.analysis = {
      fixCount: Object.keys(analysis.fixSummary).length,
      disabledCount: Object.keys(analysis.disabledFixes).length,
      persistentIssueCount: analysis.persistentIssues.length,
      agentCount: Object.keys(analysis.agentHealth).length,
      coverageGapCount: analysis.coverageGaps.length,
    };
    console.log(
      `[meta-optimizer] Phase 1 complete: ${report.phases.analysis.fixCount} fixes, ` +
      `${report.phases.analysis.persistentIssueCount} persistent issues, ` +
      `${report.phases.analysis.coverageGapCount} coverage gaps`
    );

    // Phase 2: Auto-tune
    console.log('[meta-optimizer] Phase 2: Auto-tuning based on rules...');
    const autoTuneChanges = autoTune(analysis);
    report.phases.autoTune = {
      changesApplied: autoTuneChanges.length,
      changes: autoTuneChanges,
    };
    if (autoTuneChanges.length > 0) {
      console.log(`[meta-optimizer] Phase 2: Applied ${autoTuneChanges.length} auto-tune changes`);
    } else {
      console.log('[meta-optimizer] Phase 2: No auto-tune changes needed');
    }

    // Phase 3: Claude Opus analysis
    console.log('[meta-optimizer] Phase 3: Requesting Claude Opus analysis...');
    let recommendations = null;
    try {
      recommendations = await claudeAnalysis(analysis, autoTuneChanges);
      report.phases.claudeAnalysis = {
        success: !!recommendations,
        diagnosis: recommendations?.systemDiagnosis || null,
        actionCount: recommendations?.actions?.length || 0,
        reasoning: recommendations?.reasoning || null,
      };
      console.log(
        `[meta-optimizer] Phase 3 complete: ` +
        `${recommendations?.actions?.length || 0} actions recommended`
      );
    } catch (err) {
      report.phases.claudeAnalysis = { success: false, error: err.message };
      report.errors.push({ phase: 'claudeAnalysis', error: err.message });
      console.error(`[meta-optimizer] Phase 3 failed:`, err.message);
    }

    // Phase 4: Execute actions
    console.log('[meta-optimizer] Phase 4: Executing actions...');
    let executionResult = { executed: [], skipped: 'No recommendations' };
    if (recommendations) {
      try {
        executionResult = await executeActions(recommendations, analysis);
      } catch (err) {
        executionResult = { executed: [], errors: [{ error: err.message }] };
        report.errors.push({ phase: 'execution', error: err.message });
        console.error(`[meta-optimizer] Phase 4 failed:`, err.message);
      }
    }
    report.phases.execution = executionResult;
    console.log(
      `[meta-optimizer] Phase 4 complete: ${executionResult.executed.length} actions executed`
    );

    // Save report
    const durationMs = Date.now() - startTime;
    report.durationMs = durationMs;
    report.status = report.errors.length > 0 ? 'completed_with_errors' : 'success';

    const today = new Date().toISOString().slice(0, 10);
    const reportFile = path.join(REPORTS_DIR, `meta-optimizer-${today}.json`);
    writeJson(reportFile, report);

    // Append to meta log
    const metaLog = loadMetaLog();
    metaLog.runs.push({
      date: today,
      durationMs,
      status: report.status,
      fixesAnalyzed: report.phases.analysis.fixCount,
      autoTuneChanges: autoTuneChanges.length,
      claudeActions: recommendations?.actions?.length || 0,
      actionsExecuted: executionResult.executed.length,
    });
    saveMetaLog(metaLog);

    // Record run in agent memory
    try {
      const memory = mem.loadMemory(AGENT_ID);
      mem.recordRun(memory, durationMs);
      mem.recordTrend(memory, {
        fixesAnalyzed: report.phases.analysis.fixCount,
        persistentIssues: report.phases.analysis.persistentIssueCount,
        coverageGaps: report.phases.analysis.coverageGapCount,
        autoTuneChanges: autoTuneChanges.length,
        claudeActions: recommendations?.actions?.length || 0,
      });
      mem.saveMemory(AGENT_ID, memory);
    } catch (memErr) {
      console.error(`[meta-optimizer] Memory save failed:`, memErr.message);
    }

    console.log(`[meta-optimizer] Complete in ${durationMs}ms. Status: ${report.status}`);
    return report;

  } catch (err) {
    const durationMs = Date.now() - startTime;
    report.status = 'failed';
    report.error = err.message;
    report.durationMs = durationMs;

    const today = new Date().toISOString().slice(0, 10);
    writeJson(path.join(REPORTS_DIR, `meta-optimizer-${today}.json`), report);

    console.error(`[meta-optimizer] FAILED after ${durationMs}ms:`, err.message);
    throw err;
  }
}

// ── Auto-fix registration ──────────────────────────────────────────────────

registerFixes(AGENT_ID, [
  {
    id: 'claude-meta-analysis',
    description: 'Weekly meta-optimization: analyze fix effectiveness and propose improvements',
    cooldownMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    condition: () => true, // always runs (scheduled weekly)
    apply: async () => {
      try {
        const result = await runMetaOptimizer();
        const actionsExecuted = result?.phases?.execution?.executed?.length || 0;
        const autoTuneChanges = result?.phases?.autoTune?.changesApplied || 0;
        return {
          changed: actionsExecuted > 0 || autoTuneChanges > 0,
          detail: `Meta-optimization: ${autoTuneChanges} auto-tune, ${actionsExecuted} Claude actions. Status: ${result?.status || 'unknown'}`,
        };
      } catch (err) {
        return {
          changed: false,
          detail: `Meta-optimization failed: ${err.message}`,
        };
      }
    },
  },
]);

// ── Export ──────────────────────────────────────────────────────────────────

module.exports = { runMetaOptimizer };
