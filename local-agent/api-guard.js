'use strict';

/**
 * API Guard — Protección contra abuso de API de Anthropic
 *
 * Controles implementados:
 * 1. Budget diario de tokens (input + output)
 * 2. Rate limiting (max llamadas por minuto)
 * 3. Timeout por llamada
 * 4. Max tokens por llamada (hard cap)
 * 5. Max input length (truncar prompts enormes)
 * 6. Circuit breaker (parar tras N errores consecutivos)
 * 7. Logging de consumo
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

// ── Config ──────────────────────────────────────────────────────────────────

const HARDCODED_DEFAULTS = {
  maxTokensPerCall: 4500,
  maxInputChars: 15000,
  dailyBudgetTokens: 100000,
  maxCallsPerMinute: 10,
  timeoutMs: 60000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 300000,
};

// Live config with fallback to hardcoded defaults
function getCfg() {
  const mod = config.getModule('api-guard');
  return { ...HARDCODED_DEFAULTS, ...mod };
}

// ── State (in-memory, resets on process restart) ────────────────────────────

const state = {
  dailyTokensUsed: 0,
  dailyDate: new Date().toISOString().slice(0, 10),
  callTimestamps: [],        // timestamps de las últimas llamadas (para rate limit)
  consecutiveErrors: 0,
  circuitOpenUntil: 0,       // timestamp hasta el que el circuit está abierto
  callCount: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheCreationTokens: 0,
  cacheHits: 0,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetDailyIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.dailyDate !== today) {
    // Guardar log del día anterior antes de resetear
    saveDailyLog();
    state.dailyTokensUsed = 0;
    state.dailyDate = today;
    state.callCount = 0;
    state.totalInputTokens = 0;
    state.totalOutputTokens = 0;
    state.totalCacheReadTokens = 0;
    state.totalCacheCreationTokens = 0;
    state.cacheHits = 0;
  }
}

function saveDailyLog() {
  try {
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `api-usage-${state.dailyDate}.json`);

    // Merge with existing log (in case PM2 restarted mid-day)
    let existing = { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, cacheHits: 0 };
    try {
      existing = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    } catch { /* first write of the day */ }

    const log = {
      date: state.dailyDate,
      totalCalls: existing.totalCalls + state.callCount,
      totalInputTokens: existing.totalInputTokens + state.totalInputTokens,
      totalOutputTokens: existing.totalOutputTokens + state.totalOutputTokens,
      totalTokens: existing.totalTokens + state.dailyTokensUsed,
      cacheReadTokens: (existing.cacheReadTokens || 0) + (state.totalCacheReadTokens || 0),
      cacheCreationTokens: (existing.cacheCreationTokens || 0) + (state.totalCacheCreationTokens || 0),
      cacheHits: (existing.cacheHits || 0) + (state.cacheHits || 0),
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
  } catch { /* non-critical */ }
}

/** Save log on every call (not just day boundary) to survive PM2 restarts */
function saveLogIfNeeded() {
  // Save every 5 calls to avoid excessive writes
  if (state.callCount > 0 && state.callCount % 5 === 0) {
    saveDailyLog();
  }
}

function cleanOldCallTimestamps() {
  const oneMinuteAgo = Date.now() - 60000;
  state.callTimestamps = state.callTimestamps.filter(ts => ts > oneMinuteAgo);
}

// ── Guard checks ────────────────────────────────────────────────────────────

function checkGuards(overrides = {}) {
  const cfg = { ...getCfg(), ...overrides };
  resetDailyIfNeeded();

  // 1. Circuit breaker
  if (Date.now() < state.circuitOpenUntil) {
    const waitSec = Math.ceil((state.circuitOpenUntil - Date.now()) / 1000);
    return { ok: false, reason: `Circuit breaker abierto. Reintenta en ${waitSec}s` };
  }

  // 2. Daily budget
  if (state.dailyTokensUsed >= cfg.dailyBudgetTokens) {
    return { ok: false, reason: `Budget diario agotado: ${state.dailyTokensUsed}/${cfg.dailyBudgetTokens} tokens` };
  }

  // 3. Rate limit
  cleanOldCallTimestamps();
  if (state.callTimestamps.length >= cfg.maxCallsPerMinute) {
    return { ok: false, reason: `Rate limit: ${cfg.maxCallsPerMinute} llamadas/min alcanzado` };
  }

  return { ok: true };
}

// ── Guarded Claude call ─────────────────────────────────────────────────────

/**
 * Llamada protegida a Claude API.
 *
 * @param {string} prompt - El prompt a enviar
 * @param {object} options
 * @param {number} options.maxTokens - Max tokens de respuesta (cap por DEFAULTS.maxTokensPerCall)
 * @param {string} options.model - Modelo a usar (default: haiku)
 * @param {string} options.agentId - ID del agente que hace la llamada (para logs)
 * @param {string} options.system - System prompt opcional
 * @returns {Promise<{text: string, inputTokens: number, outputTokens: number}>}
 */
async function guardedCall(prompt, options = {}) {
  const cfg = getCfg();
  const {
    maxTokens = 1000,
    agentId = 'unknown',
    system = undefined,
  } = options;
  // Model priority: explicit option > per-agent config > global claude config > hardcoded default
  const model = options.model
    || config.get(agentId, 'model', null)
    || config.get('claude', 'model', 'claude-haiku-4-5-20251001');

  // Pre-flight checks
  const check = checkGuards();
  if (!check.ok) {
    console.error(`[api-guard] ${agentId}: BLOQUEADO — ${check.reason}`);
    throw new Error(`API Guard: ${check.reason}`);
  }

  // Truncar prompt si es demasiado largo
  let safePrompt = prompt;
  if (prompt.length > cfg.maxInputChars) {
    console.warn(`[api-guard] ${agentId}: Prompt truncado de ${prompt.length} a ${cfg.maxInputChars} chars`);
    safePrompt = prompt.slice(0, cfg.maxInputChars) + '\n\n[... truncado por seguridad ...]';
  }

  // Cap maxTokens
  const safeMaxTokens = Math.min(maxTokens, cfg.maxTokensPerCall);

  // Register call timestamp for rate limiting
  state.callTimestamps.push(Date.now());

  // Build request
  const body = {
    model,
    max_tokens: safeMaxTokens,
    messages: [{ role: 'user', content: safePrompt }],
  };
  // Prompt caching: wrap system prompt with cache_control
  if (system) {
    body.system = [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
    ];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': (process.env.ANTHROPIC_API_KEY || '').trim(),
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'prompt-caching-2024-07-31',
  };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      state.consecutiveErrors++;
      if (state.consecutiveErrors >= cfg.circuitBreakerThreshold) {
        state.circuitOpenUntil = Date.now() + cfg.circuitBreakerResetMs;
        console.error(`[api-guard] ${agentId}: Circuit breaker ABIERTO tras ${state.consecutiveErrors} errores. Pausa ${cfg.circuitBreakerResetMs / 1000}s`);
      }
      throw new Error(`Claude API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // Track usage (including cache tokens)
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    const cacheReadTokens = data.usage?.cache_read_input_tokens || 0;
    const cacheCreationTokens = data.usage?.cache_creation_input_tokens || 0;
    state.dailyTokensUsed += inputTokens + outputTokens;
    state.totalInputTokens += inputTokens;
    state.totalOutputTokens += outputTokens;
    state.totalCacheReadTokens += cacheReadTokens;
    state.totalCacheCreationTokens += cacheCreationTokens;
    if (cacheReadTokens > 0) state.cacheHits++;
    state.callCount++;
    state.consecutiveErrors = 0; // Reset on success

    // Deduct from balance with cache-aware pricing
    try {
      const { deductFromBalance } = require('./claude');
      deductFromBalance(model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);
    } catch {}

    const text = data.content?.[0]?.text?.trim() ?? '';

    const cacheInfo = cacheReadTokens > 0 ? ` [cache read: ${cacheReadTokens}]` : cacheCreationTokens > 0 ? ` [cache write: ${cacheCreationTokens}]` : '';
    console.log(`[api-guard] ${agentId}: OK — ${inputTokens}in/${outputTokens}out tokens${cacheInfo} (dia: ${state.dailyTokensUsed}/${cfg.dailyBudgetTokens})`);

    saveLogIfNeeded();

    return { text, inputTokens, outputTokens };

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      state.consecutiveErrors++;
      console.error(`[api-guard] ${agentId}: TIMEOUT tras ${cfg.timeoutMs}ms`);
      throw new Error(`API Guard: Timeout tras ${cfg.timeoutMs}ms`);
    }
    throw err;
  }
}

// ── Stats for reporting ─────────────────────────────────────────────────────

function getStats() {
  resetDailyIfNeeded();
  return {
    date: state.dailyDate,
    callCount: state.callCount,
    dailyTokensUsed: state.dailyTokensUsed,
    dailyBudget: getCfg().dailyBudgetTokens,
    budgetUsedPercent: Math.round((state.dailyTokensUsed / getCfg().dailyBudgetTokens) * 100),
    totalInputTokens: state.totalInputTokens,
    totalOutputTokens: state.totalOutputTokens,
    consecutiveErrors: state.consecutiveErrors,
    circuitBreakerOpen: Date.now() < state.circuitOpenUntil,
  };
}

// ── Memory cleanup ─────────────────────────────────────────────────────────

const RETENTION_DAYS = 30; // Retain reports/logs for 30 days

/**
 * Clean old reports and logs older than RETENTION_DAYS.
 * Called by Manager agent after daily report is sent.
 */
function cleanOldFiles() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;

  const dirs = [
    path.join(__dirname, 'reports'),
    path.join(__dirname, 'logs'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        // Only clean dated files (pattern: name-YYYY-MM-DD.json)
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})\.json$/);
        if (!dateMatch) continue;

        // Don't delete snapshot files (scout-snapshots.json etc.)
        if (file.includes('snapshot')) continue;

        const fileDate = new Date(dateMatch[1]).getTime();
        if (fileDate < cutoff) {
          try {
            fs.unlinkSync(path.join(dir, file));
            deleted++;
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  if (deleted > 0) {
    console.log(`[api-guard] Cleaned ${deleted} files older than ${RETENTION_DAYS} days`);
  }
  return deleted;
}

module.exports = { guardedCall, checkGuards, getStats, cleanOldFiles, DEFAULTS: HARDCODED_DEFAULTS };
