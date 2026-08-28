'use strict';

/**
 * FUNNEL OPTIMIZER AGENT — Conversion funnel analysis and auto-improvement
 *
 * Runs daily. Queries PostgreSQL for user metrics across the full funnel
 * (acquisition -> activation -> retention -> conversion -> feedback),
 * detects issues using thresholds, and uses Claude Opus to analyze patterns
 * and propose corrective actions.
 *
 * Actions Claude can propose:
 * 1. alert — email al owner con diagnóstico y prioridad
 * 2. adjust_social_mention — ajustar mention rates en social-overrides.json
 * 3. trigger_activation_email — enviar email a usuarios inactivos
 *
 * Output: reports/funnel-optimizer-YYYY-MM-DD.json + email alerts
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { guardedCall } = require('./api-guard');
const mem = require('./agent-memory');
const { registerFixes, applyFixes } = require('./auto-fix');
const { sendEmail, optimizerAlert } = require('./reports');
const { sendViaResend } = require('./resend');

const REPORTS_DIR = path.join(__dirname, 'reports');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Metric Collection ────────────────────────────────────────────────────────

async function collectFunnelMetrics() {
  const metrics = {};

  // 1. Users: total, new this week, new this month
  const usersRes = await db.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN "createdAt" >= NOW() - INTERVAL '7 days' THEN 1 END) AS new_week,
      COUNT(CASE WHEN "createdAt" >= NOW() - INTERVAL '30 days' THEN 1 END) AS new_month
    FROM users
  `);
  metrics.users = {
    total: +usersRes[0]?.total || 0,
    newThisWeek: +usersRes[0]?.new_week || 0,
    newThisMonth: +usersRes[0]?.new_month || 0,
  };

  // Cualquier uso real del producto — web O extensión. Antes solo se miraba
  // `generations`, que ignora la extensión (~50-74% de las altas), el chat, los
  // SEO scores, los previews y las optimizaciones. Mismo criterio que briefing-watch.
  const ACTIVITY = `
    SELECT "userId", "createdAt" AS ts FROM generations
    UNION ALL SELECT "userId", "createdAt" FROM chat_messages
    UNION ALL SELECT "userId", "analyzedAt" FROM video_seo_scores
    UNION ALL SELECT "userId", "createdAt" FROM video_previews
    UNION ALL SELECT "userId", "createdAt" FROM optimize_history
    UNION ALL SELECT "userId", "createdAt" FROM extension_events
  `;

  // 2. Activation: % of users who did ANYTHING real (web or extension)
  const activationAllRes = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(DISTINCT "userId") FROM (${ACTIVITY}) act) AS activated_users
  `);
  const totalUsers = +activationAllRes[0]?.total_users || 0;
  const activatedUsers = +activationAllRes[0]?.activated_users || 0;
  metrics.activation = {
    allTime: {
      totalUsers,
      activatedUsers,
      rate: totalUsers > 0 ? Math.round(activatedUsers / totalUsers * 1000) / 10 : 0,
    },
  };

  // Cohort: users created in last 14 days
  const cohortRes = await db.query(`
    SELECT
      COUNT(DISTINCT u.id) AS cohort_total,
      COUNT(DISTINCT a."userId") AS cohort_activated
    FROM users u
    LEFT JOIN (${ACTIVITY}) a ON a."userId" = u.id
    WHERE u."createdAt" >= NOW() - INTERVAL '14 days'
  `);
  const cohortTotal = +cohortRes[0]?.cohort_total || 0;
  const cohortActivated = +cohortRes[0]?.cohort_activated || 0;
  metrics.activation.cohort14d = {
    totalUsers: cohortTotal,
    activatedUsers: cohortActivated,
    rate: cohortTotal > 0 ? Math.round(cohortActivated / cohortTotal * 1000) / 10 : 0,
  };

  // 3. Retention: users active (web or extension) in last 7d vs previous 7d
  const retentionRes = await db.query(`
    SELECT
      (SELECT COUNT(DISTINCT "userId") FROM (${ACTIVITY}) a WHERE a.ts >= NOW() - INTERVAL '7 days') AS active_this_week,
      (SELECT COUNT(DISTINCT "userId") FROM (${ACTIVITY}) a WHERE a.ts >= NOW() - INTERVAL '14 days' AND a.ts < NOW() - INTERVAL '7 days') AS active_prev_week
  `);
  const activeThisWeek = +retentionRes[0]?.active_this_week || 0;
  const activePrevWeek = +retentionRes[0]?.active_prev_week || 0;
  const retentionChange = activePrevWeek > 0
    ? Math.round((activeThisWeek - activePrevWeek) / activePrevWeek * 1000) / 10
    : 0;

  // Desglose por superficie (7d) — para ver si la extensión sostiene retención
  // que la web no ve. Excluye daily_ideas a propósito (las genera el cron, no el usuario).
  const surfaceRes = await db.query(`
    SELECT
      (SELECT COUNT(DISTINCT "userId") FROM generations WHERE "createdAt" >= NOW() - INTERVAL '7 days') AS web_7d,
      (SELECT COUNT(DISTINCT "userId") FROM extension_events WHERE "createdAt" >= NOW() - INTERVAL '7 days') AS ext_7d
  `);
  metrics.retention = {
    activeThisWeek,
    activePrevWeek,
    changePercent: retentionChange,
    webActive7d: +surfaceRes[0]?.web_7d || 0,
    extensionActive7d: +surfaceRes[0]?.ext_7d || 0,
  };

  // 4. Subscriptions: active paid, trials en curso (feature 06/07), new this week, churn (canceled this week)
  const subsRes = await db.query(`
    SELECT
      COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_paid,
      COUNT(CASE WHEN status = 'trialing' THEN 1 END) AS trialing,
      COUNT(CASE WHEN status = 'trialing' AND "createdAt" >= NOW() - INTERVAL '7 days' THEN 1 END) AS trials_started_this_week,
      COUNT(CASE WHEN status = 'active' AND "createdAt" >= NOW() - INTERVAL '7 days' THEN 1 END) AS new_this_week,
      COUNT(CASE WHEN status = 'canceled' AND "currentPeriodEnd" >= NOW() - INTERVAL '7 days' THEN 1 END) AS canceled_this_week
    FROM subscriptions
  `);
  metrics.subscriptions = {
    activePaid: +subsRes[0]?.active_paid || 0,
    trialing: +subsRes[0]?.trialing || 0,
    trialsStartedThisWeek: +subsRes[0]?.trials_started_this_week || 0,
    newThisWeek: +subsRes[0]?.new_this_week || 0,
    canceledThisWeek: +subsRes[0]?.canceled_this_week || 0,
  };

  // 5. Feature adoption: top 5 templates by usage in last 30 days
  const templateRes = await db.query(`
    SELECT template, COUNT(*) AS usage_count
    FROM generations
    WHERE "createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY template
    ORDER BY usage_count DESC
    LIMIT 5
  `);
  metrics.featureAdoption = templateRes.map(r => ({
    template: r.template,
    count: +r.usage_count,
  }));

  // 6. Feedback: average rating, count this week
  // Solo cuentan las respuestas reales (submittedAt no null); las filas restantes
  // son solicitudes de feedback enviadas por email que el usuario nunca respondió.
  const feedbackRes = await db.query(`
    SELECT
      ROUND(AVG(rating)::numeric, 2) AS avg_rating,
      COUNT(*) AS total_feedbacks,
      COUNT(CASE WHEN "submittedAt" >= NOW() - INTERVAL '7 days' THEN 1 END) AS feedbacks_this_week
    FROM user_feedbacks
    WHERE "submittedAt" IS NOT NULL
  `);
  metrics.feedback = {
    avgRating: feedbackRes[0]?.avg_rating ? parseFloat(feedbackRes[0].avg_rating) : null,
    totalFeedbacks: +feedbackRes[0]?.total_feedbacks || 0,
    thisWeek: +feedbackRes[0]?.feedbacks_this_week || 0,
  };

  // 7. Waitlist: total signups, new this week
  const waitlistRes = await db.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN "createdAt" >= NOW() - INTERVAL '7 days' THEN 1 END) AS new_week
    FROM launch_waitlist
  `);
  metrics.waitlist = {
    total: +waitlistRes[0]?.total || 0,
    newThisWeek: +waitlistRes[0]?.new_week || 0,
  };

  return metrics;
}

// ── Issue Detection (thresholds) ─────────────────────────────────────────────

function detectFunnelIssues(metrics) {
  const issues = [];

  // No signups in 7 days
  if (metrics.users.newThisWeek === 0) {
    issues.push('FUNNEL_SIGNUPS: 0 new signups in 7 days');
  }

  // Low activation rate for recent cohort
  const cohortRate = metrics.activation.cohort14d.rate;
  if (metrics.activation.cohort14d.totalUsers > 0 && cohortRate < 30) {
    issues.push(`FUNNEL_ACTIVATION: Only ${cohortRate}% of recent users activated (threshold: 30%)`);
  }

  // Retention drop week-over-week
  if (metrics.retention.activePrevWeek > 0 && metrics.retention.changePercent < -20) {
    issues.push(`FUNNEL_RETENTION: Active users dropped ${Math.abs(metrics.retention.changePercent)}% week-over-week`);
  }

  // Zero paid subscriptions
  if (metrics.subscriptions.activePaid === 0 && metrics.users.total > 0) {
    issues.push(`FUNNEL_CONVERSION: 0 paid subscriptions from ${metrics.users.total} total users`);
  }

  // Low feedback rating
  if (metrics.feedback.avgRating !== null && metrics.feedback.avgRating < 3.5) {
    issues.push(`FUNNEL_FEEDBACK: Average rating below 3.5 (${metrics.feedback.avgRating})`);
  }

  // Churn this week
  if (metrics.subscriptions.canceledThisWeek > 0) {
    issues.push(`FUNNEL_CHURN: ${metrics.subscriptions.canceledThisWeek} subscriptions canceled this week`);
  }

  return issues;
}

// ── Claude Opus Analysis ─────────────────────────────────────────────────────

async function analyzeWithClaude(metrics, issues) {
  const userPrompt = `MÉTRICAS DEL FUNNEL:
${JSON.stringify(metrics, null, 2)}

PROBLEMAS DETECTADOS:
${issues.length > 0 ? issues.join('\n') : 'Ninguno'}`;

  const result = await guardedCall(userPrompt, {
    maxTokens: 2500,
    agentId: 'funnel-optimizer',
    system: `Eres el analista de conversión del sistema de auto-mejora de YTubViral. Analizas el funnel completo: adquisición → activación → retención → conversión → feedback.

PUEDES PROPONER estas acciones:
1. "alert" — email al owner con diagnóstico y prioridad (high/medium/low)
2. "adjust_social_mention" — ajustar mention rates en social-overrides.json si no hay signups
3. "trigger_activation_email" — enviar email de activación a usuarios inactivos

Para trigger_activation_email, devuelve el subject y body del email.

Responde en JSON:
{
  "diagnosis": "resumen del estado del funnel",
  "actions": [
    { "type": "alert", "priority": "high", "message": "..." },
    { "type": "adjust_social_mention", "alex": 0.35, "ferran": 0.30 },
    { "type": "trigger_activation_email", "subject": "...", "body": "..." }
  ] | null,
  "reasoning": "por qué propones cada acción"
}

Responde SOLO con el JSON.`,
  });

  if (!result?.text) return null;

  // Robust JSON parsing: strip fences, repair truncated JSON
  let parsed;
  try {
    let raw = result.text;
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      // Attempt to repair truncated JSON
      const openBraces = (raw.match(/\{/g) || []).length;
      const closeBraces = (raw.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        let patched = raw.replace(/,\s*"[^"]*"?\s*:?\s*[^,}]*$/, '');
        patched += '}'.repeat(openBraces - closeBraces);
        const patchedMatch = patched.match(/\{[\s\S]*\}/);
        if (patchedMatch) parsed = JSON.parse(patchedMatch[0]);
      }
      if (!parsed) throw new Error('No JSON found in Claude response');
    }
  } catch (e) {
    console.warn(`[funnel-optimizer] Claude JSON parse failed: ${e.message}. Raw: ${result.text.slice(0, 200)}`);
    return null;
  }

  return parsed;
}

// ── Action Execution ─────────────────────────────────────────────────────────

async function executeActions(claudeResponse, metrics) {
  if (!claudeResponse?.actions || !Array.isArray(claudeResponse.actions)) return [];

  const executed = [];

  for (const action of claudeResponse.actions) {
    try {
      switch (action.type) {
        case 'alert': {
          const priority = action.priority || 'medium';
          const subject = `[YTubViral Funnel] ${priority.toUpperCase()}: ${claudeResponse.diagnosis?.slice(0, 60) || 'Issue detected'}`;
          const body = [
            `Prioridad: ${priority}`,
            `Diagnóstico: ${claudeResponse.diagnosis}`,
            '',
            `Mensaje: ${action.message}`,
            '',
            `Razonamiento: ${claudeResponse.reasoning}`,
            '',
            '── Métricas ──',
            `Usuarios: ${metrics.users.total} total, ${metrics.users.newThisWeek} nuevos (7d)`,
            `Activación (cohort 14d): ${metrics.activation.cohort14d.rate}%`,
            `Retención: ${metrics.retention.activeThisWeek} activos (${metrics.retention.changePercent > 0 ? '+' : ''}${metrics.retention.changePercent}% vs semana anterior)`,
            `Subs pagadas: ${metrics.subscriptions.activePaid} activas, ${metrics.subscriptions.canceledThisWeek} canceladas`,
            metrics.feedback.avgRating !== null ? `Feedback: ${metrics.feedback.avgRating}/5 (${metrics.feedback.totalFeedbacks} total)` : '',
          ].filter(Boolean).join('\n');

          await optimizerAlert(subject, body);
          executed.push({ type: 'alert', priority, detail: action.message });
          break;
        }

        case 'adjust_social_mention': {
          const overridesPath = path.join(__dirname, 'social-overrides.json');
          let overrides = {};
          try { overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8')); } catch {}

          if (!overrides.personaMentionRates) overrides.personaMentionRates = {};

          const changes = {};
          for (const persona of ['alex', 'ferran']) {
            if (typeof action[persona] === 'number') {
              const clamped = Math.max(0.05, Math.min(0.50, Math.round(action[persona] * 1000) / 1000));
              const prev = overrides.personaMentionRates[persona];
              overrides.personaMentionRates[persona] = clamped;
              changes[persona] = { from: prev, to: clamped };
            }
          }

          if (Object.keys(changes).length > 0) {
            overrides.changeLog = overrides.changeLog || [];
            overrides.changeLog.push({
              date: new Date().toISOString().slice(0, 10),
              by: 'funnel-optimizer',
              summary: claudeResponse.diagnosis,
              reasoning: claudeResponse.reasoning,
              fieldsChanged: ['personaMentionRates'],
            });
            if (overrides.changeLog.length > 20) overrides.changeLog = overrides.changeLog.slice(-20);
            fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2), 'utf8');
            executed.push({ type: 'adjust_social_mention', changes });
          }
          break;
        }

        case 'trigger_activation_email': {
          if (!action.subject || !action.body) {
            console.warn('[funnel-optimizer] trigger_activation_email missing subject/body');
            break;
          }

          // Find users created >3 days ago with 0 generations
          const inactiveUsers = await db.query(`
            SELECT u.id, u.email, u.name
            FROM users u
            LEFT JOIN generations g ON g."userId" = u.id
            WHERE u."createdAt" < NOW() - INTERVAL '3 days'
              AND u."emailVerified" IS NOT NULL
            GROUP BY u.id, u.email, u.name
            HAVING COUNT(g.id) = 0
            LIMIT 50
          `);

          let sentCount = 0;
          for (const user of inactiveUsers) {
            try {
              const personalizedBody = action.body.replace(/\{name\}/g, user.name || 'there');
              await sendViaResend({
                to: user.email,
                subject: action.subject,
                body: personalizedBody,
                from: 'hello',
              });
              sentCount++;
            } catch (e) {
              console.warn(`[funnel-optimizer] Failed to send activation email to ${user.email}: ${e.message}`);
            }
          }

          executed.push({ type: 'trigger_activation_email', userCount: inactiveUsers.length, sent: sentCount });
          break;
        }

        default:
          console.warn(`[funnel-optimizer] Unknown action type: ${action.type}`);
      }
    } catch (e) {
      console.error(`[funnel-optimizer] Error executing action ${action.type}: ${e.message}`);
    }
  }

  return executed;
}

// ── Auto-Fix Registration ────────────────────────────────────────────────────

registerFixes('funnel-optimizer', [
  {
    id: 'claude-funnel-diagnosis',
    description: 'Claude Opus analiza el funnel completo y propone acciones correctivas',
    cooldownMs: 86400000, // 1 day — faster retry on persistent issues
    condition: (issues) => issues.length > 0,
    apply: async (_config, issues, metrics) => {
      const claudeResponse = await analyzeWithClaude(metrics, issues);

      if (!claudeResponse) {
        return { changed: false, detail: 'Claude funnel diagnosis: no valid response' };
      }

      if (!claudeResponse.actions || claudeResponse.actions.length === 0) {
        return { changed: false, detail: `Claude funnel diagnosis: ${claudeResponse.diagnosis} — no actions proposed` };
      }

      const executed = await executeActions(claudeResponse, metrics);

      if (executed.length === 0) {
        return { changed: false, detail: `Claude funnel diagnosis: ${claudeResponse.diagnosis} — actions proposed but none executed` };
      }

      return {
        changed: true,
        detail: `Claude funnel: ${claudeResponse.diagnosis}. Executed: ${executed.map(a => `${a.type}${a.detail ? ': ' + a.detail : ''}`).join('; ')}`,
      };
    },
  },
]);

// ── Main Flow ────────────────────────────────────────────────────────────────

async function runFunnelOptimizer() {
  console.log('[funnel-optimizer] Starting daily funnel analysis...');
  ensureDir(REPORTS_DIR);

  try {
    await db.initDb();

    // 1. Collect metrics
    const metrics = await collectFunnelMetrics();
    console.log(`[funnel-optimizer] Metrics collected: ${metrics.users.total} users, ${metrics.subscriptions.activePaid} paid subs`);

    // 2. Detect issues
    const issues = detectFunnelIssues(metrics);
    console.log(`[funnel-optimizer] Issues detected: ${issues.length}`);

    // 3. Apply auto-fixes + self-improvement (always run, even with 0 issues)
    let appliedFixes = await applyFixes('funnel-optimizer', issues, metrics);
    if (appliedFixes.length > 0) {
      console.log(`[funnel-optimizer] Auto-fixed ${appliedFixes.length} issue(s)`);
    }

    // 4. Build and save report
    const today = new Date().toISOString().slice(0, 10);
    const report = {
      date: today,
      metrics,
      issues,
      autoFixes: appliedFixes.length > 0 ? appliedFixes : undefined,
    };

    const reportFile = path.join(REPORTS_DIR, `funnel-optimizer-${today}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    // 5. Update agent memory
    try {
      const findings = issues.map(i => ({
        id: mem.issueId(i.slice(0, 50)),
        description: i,
        severity: i.includes('FUNNEL_SIGNUPS') || i.includes('FUNNEL_CONVERSION') ? 'high'
          : i.includes('FUNNEL_CHURN') ? 'medium'
          : 'medium',
      }));
      mem.processFindings('funnel-optimizer', findings);
    } catch (e) { /* memory not critical */ }

    console.log(`[funnel-optimizer] Analysis complete: ${issues.length} issues, report saved to ${reportFile}`);
    return report;
  } catch (err) {
    console.error('[funnel-optimizer] Error:', err.message);
    return null;
  }
}

module.exports = { runFunnelOptimizer };
