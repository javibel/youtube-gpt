'use strict';

/**
 * SOCIAL OPTIMIZER AGENT — Continuous improvement loop
 *
 * Runs daily. Analyzes social media performance, identifies problems,
 * and generates actionable recommendations. Reports findings to Manager
 * and owner via email.
 *
 * Tasks:
 * 1. Analyze engagement metrics (mentions, follow-ups, conversions)
 * 2. Check content quality (are posts getting engagement?)
 * 3. Verify all systems are operational (sessions, posting, follow-ups)
 * 4. Generate optimization recommendations
 * 5. Track trends over time
 *
 * Output: reports/social-optimizer-YYYY-MM-DD.json + email alert if issues found
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { guardedCall } = require('./api-guard');
const { sendEmail, optimizerAlert } = require('./reports');
const mem = require('./agent-memory');
const { registerFixes, applyFixes, adjustConfigValue } = require('./auto-fix');

const REPORTS_DIR = path.join(__dirname, 'reports');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function collectMetrics() {
  const metrics = {};

  // 1. Engagement volume (last 24h and 7d)
  const [tw24h, tw7d, bs24h, bs7d] = await Promise.all([
    db.query("SELECT type, COUNT(*) as count FROM twitter_actions WHERE created_at >= NOW() - INTERVAL '1 day' GROUP BY type"),
    db.query("SELECT type, COUNT(*) as count FROM twitter_actions WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY type"),
    db.query("SELECT type, COUNT(*) as count FROM bluesky_actions WHERE created_at >= NOW() - INTERVAL '1 day' GROUP BY type"),
    db.query("SELECT type, COUNT(*) as count FROM bluesky_actions WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY type"),
  ]);

  metrics.twitter_24h = { likes: 0, replies: 0 };
  tw24h.forEach(r => { if (r.type === 'x_like') metrics.twitter_24h.likes = +r.count; if (r.type === 'x_reply') metrics.twitter_24h.replies = +r.count; });
  metrics.twitter_7d = { likes: 0, replies: 0 };
  tw7d.forEach(r => { if (r.type === 'x_like') metrics.twitter_7d.likes = +r.count; if (r.type === 'x_reply') metrics.twitter_7d.replies = +r.count; });
  metrics.bluesky_24h = { likes: 0, replies: 0 };
  bs24h.forEach(r => { if (r.type === 'bsky_like') metrics.bluesky_24h.likes = +r.count; if (r.type === 'bsky_reply') metrics.bluesky_24h.replies = +r.count; });
  metrics.bluesky_7d = { likes: 0, replies: 0 };
  bs7d.forEach(r => { if (r.type === 'bsky_like') metrics.bluesky_7d.likes = +r.count; if (r.type === 'bsky_reply') metrics.bluesky_7d.replies = +r.count; });

  // 2. YTubViral mentions
  const [bsMentions, twMentions] = await Promise.all([
    db.query("SELECT COUNT(*) as total, COUNT(CASE WHEN content ILIKE '%ytubviral%' THEN 1 END) as mentions FROM bluesky_actions WHERE type = 'bsky_reply' AND created_at >= NOW() - INTERVAL '7 days'"),
    db.query("SELECT COUNT(*) as total, COUNT(CASE WHEN content ILIKE '%ytubviral%' THEN 1 END) as mentions FROM twitter_actions WHERE type = 'x_reply' AND created_at >= NOW() - INTERVAL '7 days'"),
  ]);
  metrics.mentions_7d = {
    bluesky: { total: +bsMentions[0]?.total || 0, withBrand: +bsMentions[0]?.mentions || 0 },
    twitter: { total: +twMentions[0]?.total || 0, withBrand: +twMentions[0]?.mentions || 0 },
  };

  // 3. Follow-ups effectiveness
  const followups = await db.query("SELECT platform, responded, COUNT(*) as count FROM followup_checks WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY platform, responded");
  metrics.followups_7d = { detected: 0, responded: 0 };
  followups.forEach(r => {
    metrics.followups_7d.detected += +r.count;
    if (r.responded) metrics.followups_7d.responded += +r.count;
  });

  // 4. Brand posts
  const posts = await db.query("SELECT platform, status, COUNT(*) as count FROM social_posts WHERE \"createdAt\" >= NOW() - INTERVAL '7 days' GROUP BY platform, status");
  metrics.brandPosts_7d = {};
  posts.forEach(r => {
    if (!metrics.brandPosts_7d[r.platform]) metrics.brandPosts_7d[r.platform] = { published: 0, failed: 0 };
    if (r.status === 'published') metrics.brandPosts_7d[r.platform].published = +r.count;
    else if (r.status === 'failed') metrics.brandPosts_7d[r.platform].failed = +r.count;
  });

  // 5. Users/signups
  const users = await db.query("SELECT COUNT(*) as total, COUNT(CASE WHEN \"createdAt\" >= NOW() - INTERVAL '7 days' THEN 1 END) as week FROM users");
  metrics.users = { total: +users[0]?.total || 0, newThisWeek: +users[0]?.week || 0 };

  // 6. Recent replies content (to evaluate quality)
  const recentComments = await db.query("SELECT account_id, LEFT(content, 300) as content, post_url, created_at FROM bluesky_actions WHERE type = 'bsky_reply' AND created_at >= NOW() - INTERVAL '1 day' ORDER BY created_at DESC LIMIT 5");
  metrics.recentBlueskyComments = recentComments;

  const recentTweets = await db.query("SELECT account_id, LEFT(content, 280) as content, tweet_url, created_at FROM twitter_actions WHERE type = 'x_reply' AND created_at >= NOW() - INTERVAL '1 day' ORDER BY created_at DESC LIMIT 5");
  metrics.recentTweetReplies = recentTweets;

  return metrics;
}

async function analyzeAndRecommend(metrics) {
  const issues = [];
  const recommendations = [];

  // Check engagement volume
  // Twitter personas DISABLED 2026-06-25, Bluesky personas DISABLED 2026-07-08
  // (decisión Javier: personas abandonadas en todas las redes, solo quedan brand
  // FB/IG vía API + cuentas personales). No alertar sobre canales apagados a
  // propósito — generaba falsa alarma diaria "0 actividad / posible sesión caída".

  // Check mention rate
  const totalComments = metrics.mentions_7d.bluesky.total + metrics.mentions_7d.twitter.total;
  const totalMentions = metrics.mentions_7d.bluesky.withBrand + metrics.mentions_7d.twitter.withBrand;
  const mentionRate = totalComments > 0 ? (totalMentions / totalComments * 100).toFixed(1) : '0';

  if (totalMentions === 0 && totalComments > 5) {
    issues.push(`MENCIONES: 0 menciones de YTubViral en ${totalComments} replies — el sistema de menciones no está funcionando`);
    recommendations.push('Revisar prompt de generación de replies: Claude está ignorando las instrucciones de mención');
  } else if (parseFloat(mentionRate) < 15 && totalComments > 10) {
    issues.push(`MENCIONES: Solo ${mentionRate}% de replies mencionan YTubViral (objetivo: 25%+)`);
  }

  // Check follow-ups
  if (metrics.followups_7d.detected > 0 && metrics.followups_7d.responded === 0) {
    issues.push(`FOLLOW-UPS: ${metrics.followups_7d.detected} replies detectados pero 0 respondidos — matching o respuesta fallando`);
  }

  // Check brand posts
  for (const [platform, data] of Object.entries(metrics.brandPosts_7d)) {
    if (data.failed > data.published) {
      issues.push(`POSTS ${platform.toUpperCase()}: ${data.failed} fallos vs ${data.published} publicados — más fallos que éxitos`);
    }
  }

  // Check user growth
  if (metrics.users.newThisWeek === 0) {
    issues.push('USUARIOS: 0 registros nuevos esta semana');
    recommendations.push('Aumentar frecuencia de menciones y mejorar CTA en replies');
  }

  // Use Claude to analyze content quality if we have replies
  let aiAnalysis = '';
  if (metrics.recentBlueskyComments.length > 0 || metrics.recentTweetReplies.length > 0) {
    const commentsForReview = [
      ...metrics.recentBlueskyComments.map(c => `[Bluesky/${c.account_id}] ${c.content}`),
      ...metrics.recentTweetReplies.map(c => `[Twitter/${c.account_id || 'brand'}] ${c.content}`),
    ].join('\n\n');

    const userPrompt = `COMENTARIOS:\n${commentsForReview}\n\nMÉTRICAS:\n- Menciones de ytubviral.com: ${totalMentions}/${totalComments} (${mentionRate}%)\n- Follow-ups respondidos: ${metrics.followups_7d.responded}/${metrics.followups_7d.detected}\n- Nuevos usuarios esta semana: ${metrics.users.newThisWeek}`;

    const aiResult = await guardedCall(userPrompt, {
      maxTokens: 1200,
      agentId: 'social-optimizer',
      system: `Eres un analista de marketing de redes sociales. Analiza comentarios dejados por cuentas personas en Bluesky/Twitter:
- Alex: editor de vídeo freelance, 26 años, Valencia. Usa ytubviral.com y lo recomienda con micro-narrativas de su experiencia.
- Ferran: consultor de marketing digital, 33 años, Barcelona. Recomienda ytubviral.com a sus clientes como herramienta profesional.
- Ana: community manager freelance, 29 años, Madrid. Gestiona YouTube de clientes y usa ytubviral.com para títulos y keyword research.
- Mayra: copywriter especializada en YouTube, 31 años, Sevilla. Recomienda ytubviral.com a clientes para A/B testing automático.

OBJETIVO: Estos comentarios deben eventualmente llevar usuarios a ytubviral.com (herramienta IA para YouTubers).

Analiza en máximo 350 palabras:
1. ¿Los comentarios están en conversaciones RELEVANTES al producto (YouTube, SEO, herramientas)?
2. ¿La calidad del contenido genera autoridad?
3. ¿Por qué no se menciona ytubviral.com?
4. 3 recomendaciones concretas para mejorar conversión (completa las 3 siempre)

Responde en español, directo, sin rodeos.`,
    });
    aiAnalysis = aiResult?.text || '';
  }

  return { issues, recommendations, aiAnalysis, mentionRate: parseFloat(mentionRate), totalComments, totalMentions };
}

async function runSocialOptimizer() {
  console.log('[social-optimizer] Starting daily analysis...');
  ensureDir(REPORTS_DIR);

  try {
    await db.initDb();
    const metrics = await collectMetrics();
    const analysis = await analyzeAndRecommend(metrics);

    const today = new Date().toISOString().slice(0, 10);
    const report = {
      date: today,
      metrics: {
        twitter_24h: metrics.twitter_24h,
        twitter_7d: metrics.twitter_7d,
        bluesky_24h: metrics.bluesky_24h,
        bluesky_7d: metrics.bluesky_7d,
        mentions_7d: metrics.mentions_7d,
        followups_7d: metrics.followups_7d,
        brandPosts_7d: metrics.brandPosts_7d,
        users: metrics.users,
      },
      analysis: {
        issues: analysis.issues,
        recommendations: analysis.recommendations,
        mentionRate: analysis.mentionRate,
        aiAnalysis: analysis.aiAnalysis,
      },
    };

    // Auto-fix + self-improvement: apply corrections AND act on AI recommendations
    const allIssuesForFix = [...analysis.issues];

    // Extract AI recommendations as improvement opportunities (separate from issues)
    // Only include actionable recommendations, not generic analysis text
    const improvements = [];
    if (analysis.recommendations.length > 0) {
      improvements.push(...analysis.recommendations);
    }
    // Only extract AI analysis sentences that contain actionable keywords
    if (analysis.aiAnalysis) {
      const actionableKeywords = /debe|should|recomiend|cambiar|mejorar|aumentar|reducir|abandonar|concentrar|ajustar|improve|fix|change|increase|decrease|stop|focus/i;
      const aiSentences = analysis.aiAnalysis.split(/[.\n]/)
        .filter(s => s.trim().length > 20 && actionableKeywords.test(s));
      improvements.push(...aiSentences);
    }

    // Run auto-fix with issues + improvements
    // DISABLED 2026-07-08 — desconexión de personas: el auto-fix optimizaba menciones/volumen
    // de cuentas ficticias (la noche del 07→08/07 puso la mención como "norma", pisando la
    // política de menciones graduadas). Sin personas no hay nada legítimo que auto-corregir.
    // El análisis/reporte diario sigue activo (cubre también Instagram/brand).
    let appliedFixes = [];
    // appliedFixes = await applyFixes('social-optimizer', allIssuesForFix, metrics, improvements);
    if (appliedFixes.length > 0) {
      console.log(`[social-optimizer] Auto-fixed ${appliedFixes.length} issue(s)`);
      report.autoFixes = appliedFixes;
    }

    // Save report
    const reportFile = path.join(REPORTS_DIR, `social-optimizer-${today}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    // Update agent memory
    try {
      const findings = analysis.issues.map(i => ({
        id: mem.issueId(i.slice(0, 50)),
        description: i,
        severity: i.includes('0 ') ? 'high' : 'medium',
      }));
      mem.processFindings('social-optimizer', findings);
    } catch (e) { /* memory not critical */ }

    // Send alert email if there are issues
    if (analysis.issues.length > 0) {
      const emailBody = [
        '=== SOCIAL OPTIMIZER — Análisis diario ===',
        `Fecha: ${today}`,
        '',
        '── PROBLEMAS DETECTADOS ──',
        ...analysis.issues.map(i => `⚠️  ${i}`),
        '',
        '── MÉTRICAS ──',
        `Twitter (7d): ${metrics.twitter_7d.likes} likes, ${metrics.twitter_7d.replies} replies`,
        `Bluesky (7d): ${metrics.bluesky_7d.likes} likes, ${metrics.bluesky_7d.replies} replies`,
        `Menciones YTubViral: ${analysis.totalMentions}/${analysis.totalComments} (${analysis.mentionRate}%)`,
        `Follow-ups: ${metrics.followups_7d.responded}/${metrics.followups_7d.detected} respondidos`,
        `Usuarios nuevos (7d): ${metrics.users.newThisWeek}`,
        '',
        analysis.aiAnalysis ? `── ANÁLISIS IA ──\n${analysis.aiAnalysis}` : '',
        '',
        analysis.recommendations.length > 0 ? `── RECOMENDACIONES ──\n${analysis.recommendations.map(r => `→ ${r}`).join('\n')}` : '',
      ].filter(Boolean).join('\n');

      await optimizerAlert('[YTubViral] Social Optimizer — Reporte diario', emailBody);
    }

    console.log(`[social-optimizer] Analysis complete: ${analysis.issues.length} issues found`);
    return report;
  } catch (err) {
    console.error('[social-optimizer] Error:', err.message);
    return null;
  }
}

// ── Auto-Fix Definitions ──────────────────────────────────────────────────────

registerFixes('social-optimizer', [
  {
    id: 'claude-unified-diagnosis',
    description: 'Claude Opus analiza todos los problemas y genera correcciones inteligentes a config + social-overrides',
    cooldownMs: 86400000, // 1 day — was 3 days but parse errors + persistent issues need faster retry
    condition: (issues) => issues.length > 0,
    apply: async (config, issues, metrics) => {
      const overridesPath = require('path').join(__dirname, 'social-overrides.json');
      let currentOverrides = {};
      try { currentOverrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8')); } catch {}

      // Gather fix history for Claude to learn from
      const { loadFixLog } = require('./auto-fix');
      const fixLog = loadFixLog();
      const recentFixes = fixLog.fixes
        .filter(f => f.agent === 'social-optimizer')
        .slice(-5)
        .map(f => ({ fix: f.fixId, detail: f.detail, outcome: f.outcome, date: f.timestamp?.slice(0, 10) }));

      const effectivenessData = {};
      for (const [key, eff] of Object.entries(fixLog.effectiveness)) {
        if (key.startsWith('social-optimizer:')) {
          effectivenessData[key.replace('social-optimizer:', '')] = {
            successRate: `${Math.round(eff.successRate * 100)}%`,
            total: eff.total,
            consecutiveFailures: eff.consecutiveFailures,
          };
        }
      }

      // Build relevant config snapshot for Claude
      const configSnapshot = {
        personas: config.personas || {},
        humanize: config.humanize || {},
        'persona-runner': config['persona-runner'] || {},
      };

      const mentionRate = metrics.mentions_7d
        ? ((metrics.mentions_7d.bluesky.withBrand + metrics.mentions_7d.twitter.withBrand) / Math.max(1, metrics.mentions_7d.bluesky.total + metrics.mentions_7d.twitter.total) * 100).toFixed(1)
        : '?';

      const userPrompt = `PROBLEMAS DETECTADOS:
${issues.join('\n')}

MÉTRICAS:
- Mention rate: ${mentionRate}%
- Twitter 24h: ${metrics.twitter_24h?.likes || 0} likes, ${metrics.twitter_24h?.replies || 0} replies
- Bluesky 24h: ${metrics.bluesky_24h?.likes || 0} likes, ${metrics.bluesky_24h?.replies || 0} replies
- Follow-ups: ${metrics.followups_7d?.responded || 0}/${metrics.followups_7d?.detected || 0} respondidos
- Nuevos usuarios 7d: ${metrics.users?.newThisWeek || 0}

CONFIG ACTUAL (agent-config.json, secciones relevantes):
${JSON.stringify(configSnapshot, null, 2)}

SOCIAL-OVERRIDES ACTUAL:
${JSON.stringify(currentOverrides, null, 2)}

HISTORIAL DE FIXES RECIENTES (aprende de lo que funcionó y lo que no):
${JSON.stringify(recentFixes, null, 2)}

EFECTIVIDAD ACUMULADA:
${JSON.stringify(effectivenessData, null, 2)}`;

      const diagnosisResult = await guardedCall(userPrompt, {
        maxTokens: 4000,
        agentId: 'social-optimizer',
        system: `Eres el cerebro de auto-mejora del sistema social de YTubViral. Analizas problemas y generas correcciones INTELIGENTES basadas en datos.

CONTEXTO: Las personas Alex (editor freelance 26yo), Ferran (consultor marketing 33yo), Ana (community manager freelance 29yo) y Mayra (copywriter YouTube 31yo) comentan en Bluesky y Twitter sobre YouTube. El objetivo es llevar usuarios a ytubviral.com.

PUEDES MODIFICAR DOS TIPOS DE CONFIG:

1. "overrideChanges" — campos de social-overrides.json:
   - offTopicPatterns: regex patterns para rechazar posts no-YouTube
   - additionalRejectPatterns: regex para rechazar comentarios problemáticos
   - coreRulesExtra: reglas adicionales para el system prompt (es/en)
   - mentionFormula.forced: instrucción cuando post es 100% relevante
   - mentionFormula.probabilistic: instrucción para menciones probabilísticas
   - personaMentionRates: tasas de mención por persona (0.05-0.50)

2. "configChanges" — campos de agent-config.json:
   - personas.{name}.mentionRate: tasa de mención (0.05-0.50)
   - humanize.skipSessionProbability: prob de saltar sesión (0.0-0.30)
   - humanize.skipPostProbability: prob de saltar post (0.05-0.40)
   - persona-runner.maxTweetsPerSession: max tweets por sesión (3-20)

REGLAS:
- Analiza el historial: NO repitas fixes que ya fallaron (mira EFECTIVIDAD)
- Cada cambio DEBE tener razón directa en los problemas o recomendaciones detectadas
- Las líneas con [IMPROVE] son oportunidades de mejora del AI analysis — actúa sobre ellas
- Razona el POR QUÉ de cada ajuste numérico, no solo "subir" o "bajar"
- Si una persona (Alex/Ferran/Ana/Mayra) está en hilos irrelevantes, añade offTopicPatterns o coreRulesExtra para corregir su targeting
- Si no hay problemas NI oportunidades reales, NO inventes cambios

RESPONDE en JSON exacto:
{
  "diagnosis": "resumen de 1-2 frases del problema raíz",
  "overrideChanges": { ...campos de social-overrides.json... } | null,
  "configChanges": { "personas.alex.mentionRate": 0.35, ... } | null,
  "reasoning": "por qué cada cambio resuelve el problema"
}

Responde SOLO con el JSON, sin markdown, sin explicación adicional.`,
      });

      if (!diagnosisResult?.text) {
        return { changed: false, detail: 'Claude unified diagnosis: no response' };
      }

      // Parse Claude's response (robust: handles markdown fences, truncated JSON, trailing commas)
      let claudeResponse;
      try {
        let raw = diagnosisResult.text;
        // Strip markdown fences
        const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) raw = fenceMatch[1].trim();
        // Try direct parse first
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            claudeResponse = JSON.parse(jsonMatch[0]);
          } catch {
            // Clean trailing commas and retry
            let cleaned = jsonMatch[0].replace(/,\s*([\]}])/g, '$1');
            try {
              claudeResponse = JSON.parse(cleaned);
            } catch {
              // Truncated JSON — close open braces
              const openBraces = (cleaned.match(/\{/g) || []).length;
              const closeBraces = (cleaned.match(/\}/g) || []).length;
              if (openBraces > closeBraces) {
                cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, '');
                cleaned = cleaned.replace(/,\s*$/, '');
                cleaned += '}'.repeat(openBraces - closeBraces);
                claudeResponse = JSON.parse(cleaned);
              }
            }
          }
        }
        if (!claudeResponse) {
          // Last resort: extract just the diagnosis field
          const diagMatch = raw.match(/"diagnosis"\s*:\s*"([^"]*)"/);
          if (diagMatch) {
            claudeResponse = { diagnosis: diagMatch[1], overrideChanges: null, configChanges: null };
          } else {
            throw new Error('No JSON found');
          }
        }
      } catch (e) {
        console.warn(`[claude-unified] JSON parse failed: ${e.message}. Raw: ${diagnosisResult.text.slice(0, 200)}`);
        return { changed: false, detail: `Claude unified diagnosis: parse error — ${e.message}` };
      }

      if (!claudeResponse.overrideChanges && !claudeResponse.configChanges) {
        return { changed: false, detail: `Claude unified diagnosis: ${claudeResponse.diagnosis} — no changes needed` };
      }

      let changed = false;
      const appliedChanges = [];

      // ── Apply override changes (social-overrides.json) ──
      if (claudeResponse.overrideChanges) {
        const ALLOWED_OVERRIDE_FIELDS = ['offTopicPatterns', 'additionalRejectPatterns', 'coreRulesExtra', 'mentionFormula', 'personaMentionRates'];
        const validOverrides = {};
        for (const [key, value] of Object.entries(claudeResponse.overrideChanges)) {
          if (!ALLOWED_OVERRIDE_FIELDS.includes(key)) continue;
          if (key === 'personaMentionRates' && typeof value === 'object') {
            for (const [pid, rate] of Object.entries(value)) {
              if (typeof rate !== 'number' || rate > 0.50 || rate < 0.05) {
                console.log(`[claude-unified] Rejected invalid override mentionRate for ${pid}: ${rate}`);
                delete value[pid];
              }
            }
          }
          validOverrides[key] = value;
        }

        if (Object.keys(validOverrides).length > 0) {
          const newOverrides = { ...currentOverrides, ...validOverrides };
          newOverrides.changeLog = newOverrides.changeLog || [];
          newOverrides.changeLog.push({
            date: new Date().toISOString().slice(0, 10),
            by: 'claude-unified',
            summary: claudeResponse.diagnosis,
            reasoning: claudeResponse.reasoning,
            fieldsChanged: Object.keys(validOverrides),
          });
          if (newOverrides.changeLog.length > 20) newOverrides.changeLog = newOverrides.changeLog.slice(-20);
          fs.writeFileSync(overridesPath, JSON.stringify(newOverrides, null, 2), 'utf8');
          appliedChanges.push(`overrides: ${Object.keys(validOverrides).join(', ')}`);
          changed = true;
        }
      }

      // ── Apply config changes (agent-config.json) ──
      if (claudeResponse.configChanges) {
        const CONFIG_BOUNDS = {
          'personas.alex.mentionRate': { min: 0.05, max: 0.50 },
          'personas.ferran.mentionRate': { min: 0.05, max: 0.50 },
          'humanize.skipSessionProbability': { min: 0.0, max: 0.30 },
          'humanize.skipPostProbability': { min: 0.05, max: 0.40 },
          'persona-runner.maxTweetsPerSession': { min: 3, max: 20 },
        };

        for (const [dotKey, value] of Object.entries(claudeResponse.configChanges)) {
          const bounds = CONFIG_BOUNDS[dotKey];
          if (!bounds) {
            console.log(`[claude-unified] Rejected unknown config key: ${dotKey}`);
            continue;
          }
          if (typeof value !== 'number' || value < bounds.min || value > bounds.max) {
            console.log(`[claude-unified] Rejected out-of-bounds config: ${dotKey}=${value} (bounds: ${bounds.min}-${bounds.max})`);
            continue;
          }

          // Apply the dotted key path to config
          const parts = dotKey.split('.');
          let target = config;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!target[parts[i]]) target[parts[i]] = {};
            target = target[parts[i]];
          }
          const prev = target[parts[parts.length - 1]];
          target[parts[parts.length - 1]] = Math.round(value * 1000) / 1000;
          appliedChanges.push(`${dotKey}: ${prev} → ${value}`);
          changed = true;
        }
      }

      if (!changed) {
        return { changed: false, detail: `Claude unified diagnosis: all proposed changes were invalid` };
      }

      // Email notification
      await optimizerAlert(
        '[YTubViral Social] Claude auto-fix aplicado',
        `Claude Opus ha analizado y corregido el sistema social.\n\nDIAGNÓSTICO: ${claudeResponse.diagnosis}\n\nCAMBIOS APLICADOS:\n${appliedChanges.join('\n')}\n\nRAZONAMIENTO: ${claudeResponse.reasoning}`
      ).catch(() => {});

      return {
        changed: true,
        detail: `Claude unified: ${claudeResponse.diagnosis}. Applied: ${appliedChanges.join('; ')}`,
      };
    },
  },
]);

module.exports = { runSocialOptimizer };
