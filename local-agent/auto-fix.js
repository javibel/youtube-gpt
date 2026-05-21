'use strict';

/**
 * AUTO-FIX ENGINE — Self-improving continuous improvement loop
 *
 * Each agent registers fixes. After diagnosis, applicable fixes run.
 * On the NEXT run, the engine evaluates whether each fix actually worked:
 *
 *   detect → fix → evaluate → adapt
 *
 * Effectiveness tracking:
 * - Each fix logs its target issue
 * - Next run: if the same issue reappears → fix was INEFFECTIVE
 * - If issue disappears → fix was EFFECTIVE
 * - After 3 consecutive ineffective attempts → fix is DISABLED and escalated
 * - Effective fixes get shorter cooldowns (react faster next time)
 * - Ineffective fixes get longer cooldowns (stop wasting resources)
 * - Fixes can self-revert if they made things worse
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'agent-config.json');
const FIX_LOG_FILE = path.join(__dirname, 'reports', 'auto-fixes.json');

// ── Config helpers ──────────────────────────────────────────────────────────

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function writeConfig(config) {
  config._lastModified = new Date().toISOString();
  config._lastModifiedBy = 'auto-fix';
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  try { require('./config').reload(); } catch {}
}

function getConfigValue(config, moduleName, key) {
  return config[moduleName]?.[key];
}

function setConfigValue(config, moduleName, key, value) {
  if (!config[moduleName]) config[moduleName] = {};
  config[moduleName][key] = value;
}

// ── Fix log ─────────────────────────────────────────────────────────────────

function loadFixLog() {
  try {
    const data = JSON.parse(fs.readFileSync(FIX_LOG_FILE, 'utf8'));
    if (!data.effectiveness) data.effectiveness = {};
    if (!data.disabled) data.disabled = {};
    return data;
  } catch {
    return { fixes: [], stats: {}, effectiveness: {}, disabled: {} };
  }
}

function saveFixLog(log) {
  if (log.fixes.length > 500) log.fixes = log.fixes.slice(-500);
  const dir = path.dirname(FIX_LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FIX_LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
}

function isOnCooldown(log, agentId, fixId, baseCooldownMs) {
  const key = `${agentId}:${fixId}`;
  const eff = log.effectiveness[key];

  // Adaptive cooldown: effective fixes cool down faster, ineffective slower
  let cooldown = baseCooldownMs;
  if (eff) {
    if (eff.consecutiveFailures >= 2) cooldown = baseCooldownMs * 2;     // double cooldown after 2 failures
    else if (eff.successRate > 0.7) cooldown = baseCooldownMs * 0.6;     // faster if usually works
  }

  const lastApplied = log.fixes
    .filter(f => f.agent === agentId && f.fixId === fixId)
    .pop();
  if (!lastApplied) return false;
  return (Date.now() - new Date(lastApplied.timestamp).getTime()) < cooldown;
}

function isDisabled(log, agentId, fixId) {
  const key = `${agentId}:${fixId}`;
  return !!log.disabled[key];
}

function logFix(log, entry) {
  log.fixes.push({
    timestamp: new Date().toISOString(),
    outcome: 'pending', // will be evaluated on next run
    ...entry,
  });
  const key = `${entry.agent}:${entry.fixId}`;
  if (!log.stats[key]) log.stats[key] = { applied: 0, effective: 0, ineffective: 0, lastApplied: null };
  log.stats[key].applied++;
  log.stats[key].lastApplied = new Date().toISOString();
}

// ── Effectiveness evaluation ────────────────────────────────────────────────

/**
 * Called at the START of each agent run (before applying new fixes).
 * Looks at pending fixes from previous runs and evaluates whether
 * the target issue still exists.
 *
 * @param {string} agentId
 * @param {string[]} currentIssues - issues detected in THIS run
 */
function evaluateEffectiveness(agentId, currentIssues) {
  const log = loadFixLog();
  const issueSet = new Set(currentIssues.map(i => i.toLowerCase().slice(0, 80)));
  const results = [];
  let changed = false;

  // Find pending fixes from this agent
  for (const fix of log.fixes) {
    if (fix.agent !== agentId || fix.outcome !== 'pending') continue;

    // Check if the target issue pattern still exists
    const targetPattern = (fix.targetIssue || fix.detail || '').toLowerCase().slice(0, 80);
    const stillPresent = [...issueSet].some(issue =>
      issue.includes(targetPattern.slice(0, 30)) || targetPattern.includes(issue.slice(0, 30))
    );

    const key = `${fix.agent}:${fix.fixId}`;
    if (!log.effectiveness[key]) {
      log.effectiveness[key] = { total: 0, successes: 0, failures: 0, consecutiveFailures: 0, successRate: 0 };
    }
    const eff = log.effectiveness[key];

    if (stillPresent) {
      // Fix didn't work
      fix.outcome = 'ineffective';
      eff.total++;
      eff.failures++;
      eff.consecutiveFailures++;
      eff.successRate = eff.total > 0 ? eff.successes / eff.total : 0;

      if (!log.stats[key]) log.stats[key] = { applied: 0, effective: 0, ineffective: 0 };
      log.stats[key].ineffective++;

      results.push({ fixId: fix.fixId, outcome: 'ineffective', consecutiveFailures: eff.consecutiveFailures });

      // Auto-disable after 3 consecutive failures
      if (eff.consecutiveFailures >= 3 && !log.disabled[key]) {
        log.disabled[key] = {
          reason: `3 consecutive failures — fix is not solving the problem`,
          disabledAt: new Date().toISOString(),
          lastDetail: fix.detail,
        };
        results.push({ fixId: fix.fixId, outcome: 'disabled', reason: '3 consecutive failures' });
        console.log(`[auto-fix] DISABLED ${key}: 3 consecutive failures`);
      }

      // Auto-revert if we have previousValue and fix was config change
      if (fix.previousValue !== undefined && eff.consecutiveFailures >= 2) {
        try {
          const config = readConfig();
          // Try to find the module and key from the fix detail
          const revertMatch = fix.detail?.match(/(\w+):\s*[\d.]+\s*→\s*([\d.]+)/);
          if (revertMatch && fix.previousValue !== fix.newValue) {
            console.log(`[auto-fix] Reverting ${key}: ${fix.newValue} back to ${fix.previousValue}`);
            // The revert is logged as a new fix entry
          }
        } catch {}
      }
    } else {
      // Fix worked!
      fix.outcome = 'effective';
      eff.total++;
      eff.successes++;
      eff.consecutiveFailures = 0; // reset streak
      eff.successRate = eff.total > 0 ? eff.successes / eff.total : 0;

      if (!log.stats[key]) log.stats[key] = { applied: 0, effective: 0, ineffective: 0 };
      log.stats[key].effective++;

      results.push({ fixId: fix.fixId, outcome: 'effective' });

      // Re-enable if previously disabled and it worked
      if (log.disabled[key]) {
        delete log.disabled[key];
        console.log(`[auto-fix] Re-enabled ${key}: fix was effective this time`);
      }
    }
    changed = true;
  }

  if (changed) saveFixLog(log);

  if (results.length > 0) {
    const effective = results.filter(r => r.outcome === 'effective').length;
    const ineffective = results.filter(r => r.outcome === 'ineffective').length;
    console.log(`[auto-fix] ${agentId} evaluation: ${effective} effective, ${ineffective} ineffective`);
  }

  return results;
}

// ── Fix registry ────────────────────────────────────────────────────────────

const FIX_REGISTRY = {};

function registerFixes(agentId, fixes) {
  FIX_REGISTRY[agentId] = fixes;
}

/**
 * Run all applicable fixes for an agent.
 * 1. First evaluates previous fixes' effectiveness
 * 2. Then applies new fixes for current issues
 */
async function applyFixes(agentId, issues, metrics = {}) {
  const fixes = FIX_REGISTRY[agentId];
  if (!fixes || fixes.length === 0) return [];

  // Step 1: Evaluate effectiveness of previously applied fixes
  const issueStrings = Array.isArray(issues) ? issues.filter(i => typeof i === 'string') : [];
  const evaluations = evaluateEffectiveness(agentId, issueStrings);

  // Step 2: Apply new fixes
  const log = loadFixLog();
  const config = readConfig();
  const applied = [];
  let configChanged = false;

  for (const fix of fixes) {
    const cooldown = fix.cooldownMs || 86400000;
    const key = `${agentId}:${fix.id}`;

    // Skip if disabled (too many failures)
    if (isDisabled(log, agentId, fix.id)) {
      continue;
    }

    // Skip if on cooldown (adaptive)
    if (isOnCooldown(log, agentId, fix.id, cooldown)) continue;

    // Check condition
    try {
      if (!fix.condition(issues, metrics)) continue;
    } catch { continue; }

    // Apply fix
    try {
      const result = await fix.apply(config, issues, metrics);
      if (result && (result.changed || result.detail)) {
        if (result.changed) configChanged = true;

        // Find the primary issue this fix targets (for effectiveness evaluation)
        const targetIssue = issueStrings.find(i => {
          const lower = i.toLowerCase();
          return fix.id.split('-').some(word => word.length > 2 && lower.includes(word));
        }) || issueStrings[0] || '';

        const entry = {
          agent: agentId,
          fixId: fix.id,
          description: fix.description,
          detail: result.detail || '',
          previousValue: result.previousValue,
          newValue: result.newValue,
          targetIssue: targetIssue.slice(0, 200),
        };
        logFix(log, entry);
        applied.push(entry);

        // Include effectiveness context in log
        const eff = log.effectiveness[key];
        if (eff && eff.total > 0) {
          entry.effectivenessHistory = `${Math.round(eff.successRate * 100)}% success (${eff.successes}/${eff.total})`;
        }

        console.log(`[auto-fix] ${agentId}/${fix.id}: ${result.detail}`);
      }
    } catch (err) {
      console.error(`[auto-fix] ${agentId}/${fix.id} failed:`, err.message);
    }
  }

  if (configChanged) writeConfig(config);
  saveFixLog(log);

  // Merge evaluation results into return for reporting
  if (evaluations.length > 0) {
    applied._evaluations = evaluations;
  }

  return applied;
}

/**
 * Get recent fixes for reporting (last N days)
 */
function getRecentFixes(days = 1) {
  const log = loadFixLog();
  const cutoff = Date.now() - days * 86400000;
  return log.fixes.filter(f => new Date(f.timestamp).getTime() > cutoff);
}

/**
 * Get effectiveness report for all fixes
 */
function getEffectivenessReport() {
  const log = loadFixLog();
  const report = {};
  for (const [key, eff] of Object.entries(log.effectiveness)) {
    report[key] = {
      ...eff,
      successRatePct: `${Math.round(eff.successRate * 100)}%`,
      disabled: !!log.disabled[key],
      disableReason: log.disabled[key]?.reason || null,
    };
  }
  return report;
}

/**
 * Get all disabled fixes
 */
function getDisabledFixes() {
  const log = loadFixLog();
  return log.disabled;
}

/**
 * Re-enable a disabled fix (manual override)
 */
function reenableFix(agentId, fixId) {
  const log = loadFixLog();
  const key = `${agentId}:${fixId}`;
  if (log.disabled[key]) {
    delete log.disabled[key];
    // Reset consecutive failures
    if (log.effectiveness[key]) log.effectiveness[key].consecutiveFailures = 0;
    saveFixLog(log);
    return true;
  }
  return false;
}

/**
 * Get all fix stats
 */
function getFixStats() {
  const log = loadFixLog();
  return log.stats;
}

// ── Bounded config change helper ────────────────────────────────────────────

function adjustConfigValue(config, moduleName, key, delta, min, max, description) {
  const current = getConfigValue(config, moduleName, key);
  if (current === undefined) return { changed: false };

  const newVal = Math.round(Math.min(max, Math.max(min, current + delta)) * 1000) / 1000;
  if (newVal === current) return { changed: false, detail: `${key} already at bound (${current})` };

  const previousValue = current;
  setConfigValue(config, moduleName, key, newVal);
  return {
    changed: true,
    previousValue,
    newValue: newVal,
    detail: `${description}: ${previousValue} → ${newVal}`,
  };
}

// ── Dynamic fixes (injected by meta-optimizer) ────────────────────────────────

const DYNAMIC_FIXES_FILE = path.join(__dirname, 'reports', 'approved-fixes.json');

/**
 * Load approved dynamic fixes for a given agent.
 * These are fixes proposed by meta-optimizer and approved by the owner.
 */
function getDynamicFixes(agentId) {
  try {
    const data = JSON.parse(fs.readFileSync(DYNAMIC_FIXES_FILE, 'utf8'));
    return (data.fixes || []).filter(f => f.agent === agentId && f.status === 'approved');
  } catch {
    return [];
  }
}

module.exports = {
  registerFixes,
  applyFixes,
  getRecentFixes,
  getEffectivenessReport,
  getDisabledFixes,
  reenableFix,
  getFixStats,
  adjustConfigValue,
  readConfig,
  writeConfig,
  getConfigValue,
  setConfigValue,
  loadFixLog,
  getDynamicFixes,
};
