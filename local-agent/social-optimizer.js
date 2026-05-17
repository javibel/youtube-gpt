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
const { sendEmail } = require('./reports');
const mem = require('./agent-memory');
const { registerFixes, applyFixes, adjustConfigValue } = require('./auto-fix');

const REPORTS_DIR = path.join(__dirname, 'reports');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function collectMetrics() {
  const metrics = {};

  // 1. Engagement volume (last 24h and 7d)
  const [tw24h, tw7d, rd24h, rd7d] = await Promise.all([
    db.query("SELECT type, COUNT(*) as count FROM twitter_actions WHERE created_at >= NOW() - INTERVAL '1 day' GROUP BY type"),
    db.query("SELECT type, COUNT(*) as count FROM twitter_actions WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY type"),
    db.query("SELECT type, COUNT(*) as count FROM reddit_actions WHERE created_at >= NOW() - INTERVAL '1 day' GROUP BY type"),
    db.query("SELECT type, COUNT(*) as count FROM reddit_actions WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY type"),
  ]);

  metrics.twitter_24h = { likes: 0, replies: 0 };
  tw24h.forEach(r => { if (r.type === 'x_like') metrics.twitter_24h.likes = +r.count; if (r.type === 'x_reply') metrics.twitter_24h.replies = +r.count; });
  metrics.twitter_7d = { likes: 0, replies: 0 };
  tw7d.forEach(r => { if (r.type === 'x_like') metrics.twitter_7d.likes = +r.count; if (r.type === 'x_reply') metrics.twitter_7d.replies = +r.count; });
  metrics.reddit_24h = { upvotes: 0, comments: 0 };
  rd24h.forEach(r => { if (r.type === 'rd_upvote') metrics.reddit_24h.upvotes = +r.count; if (r.type === 'rd_comment') metrics.reddit_24h.comments = +r.count; });
  metrics.reddit_7d = { upvotes: 0, comments: 0 };
  rd7d.forEach(r => { if (r.type === 'rd_upvote') metrics.reddit_7d.upvotes = +r.count; if (r.type === 'rd_comment') metrics.reddit_7d.comments = +r.count; });

  // 2. YTubViral mentions
  const [rdMentions, twMentions] = await Promise.all([
    db.query("SELECT COUNT(*) as total, COUNT(CASE WHEN content ILIKE '%ytubviral%' THEN 1 END) as mentions FROM reddit_actions WHERE type = 'rd_comment' AND created_at >= NOW() - INTERVAL '7 days'"),
    db.query("SELECT COUNT(*) as total, COUNT(CASE WHEN content ILIKE '%ytubviral%' THEN 1 END) as mentions FROM twitter_actions WHERE type = 'x_reply' AND created_at >= NOW() - INTERVAL '7 days'"),
  ]);
  metrics.mentions_7d = {
    reddit: { total: +rdMentions[0]?.total || 0, withBrand: +rdMentions[0]?.mentions || 0 },
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

  // 6. Recent comments content (to evaluate quality)
  const recentComments = await db.query("SELECT account_id, LEFT(content, 300) as content, post_url, created_at FROM reddit_actions WHERE type = 'rd_comment' AND created_at >= NOW() - INTERVAL '1 day' ORDER BY created_at DESC LIMIT 5");
  metrics.recentRedditComments = recentComments;

  const recentTweets = await db.query("SELECT account_id, LEFT(content, 280) as content, tweet_url, created_at FROM twitter_actions WHERE type = 'x_reply' AND created_at >= NOW() - INTERVAL '1 day' ORDER BY created_at DESC LIMIT 5");
  metrics.recentTweetReplies = recentTweets;

  return metrics;
}

async function analyzeAndRecommend(metrics) {
  const issues = [];
  const recommendations = [];

  // Check engagement volume
  if (metrics.twitter_24h.likes === 0 && metrics.twitter_24h.replies === 0) {
    issues.push('TWITTER: 0 actividad en 24h — posible sesión caída o skip aleatorio');
  }
  if (metrics.reddit_24h.upvotes === 0 && metrics.reddit_24h.comments === 0) {
    issues.push('REDDIT: 0 actividad en 24h — posible sesión caída');
  }

  // Check mention rate
  const totalComments = metrics.mentions_7d.reddit.total + metrics.mentions_7d.twitter.total;
  const totalMentions = metrics.mentions_7d.reddit.withBrand + metrics.mentions_7d.twitter.withBrand;
  const mentionRate = totalComments > 0 ? (totalMentions / totalComments * 100).toFixed(1) : '0';

  if (totalMentions === 0 && totalComments > 5) {
    issues.push(`MENCIONES: 0 menciones de YTubViral en ${totalComments} comments — el sistema de menciones no está funcionando`);
    recommendations.push('Revisar prompt de generación de comments: Claude está ignorando las instrucciones de mención');
  } else if (parseFloat(mentionRate) < 15 && totalComments > 10) {
    issues.push(`MENCIONES: Solo ${mentionRate}% de comments mencionan YTubViral (objetivo: 25%+)`);
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
    recommendations.push('Aumentar frecuencia de menciones y mejorar CTA en comments');
  }

  // Use Claude to analyze content quality if we have comments
  let aiAnalysis = '';
  if (metrics.recentRedditComments.length > 0 || metrics.recentTweetReplies.length > 0) {
    const commentsForReview = [
      ...metrics.recentRedditComments.map(c => `[Reddit/${c.account_id}] ${c.content}`),
      ...metrics.recentTweetReplies.map(c => `[Twitter/${c.account_id || 'brand'}] ${c.content}`),
    ].join('\n\n');

    const userPrompt = `COMENTARIOS:\n${commentsForReview}\n\nMÉTRICAS:\n- Menciones de ytubviral.com: ${totalMentions}/${totalComments} (${mentionRate}%)\n- Follow-ups respondidos: ${metrics.followups_7d.responded}/${metrics.followups_7d.detected}\n- Nuevos usuarios esta semana: ${metrics.users.newThisWeek}`;

    const aiResult = await guardedCall(userPrompt, {
      maxTokens: 400,
      agentId: 'social-optimizer',
      system: `Eres un analista de marketing de redes sociales. Analiza comentarios dejados por cuentas personas (Alex=editor freelance 26yo que usa ytubviral.com, Ferran=consultor marketing 33yo que recomienda ytubviral.com a clientes) en Reddit/Twitter.

OBJETIVO: Estos comentarios deben eventualmente llevar usuarios a ytubviral.com (herramienta IA para YouTubers).

Analiza en máximo 200 palabras:
1. ¿Los comentarios están en conversaciones RELEVANTES al producto (YouTube, SEO, herramientas)?
2. ¿La calidad del contenido genera autoridad?
3. ¿Por qué no se menciona ytubviral.com?
4. 3 recomendaciones concretas para mejorar conversión

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
        reddit_24h: metrics.reddit_24h,
        reddit_7d: metrics.reddit_7d,
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

    // Auto-fix: apply corrections based on detected issues + AI analysis
    // Feed AI analysis text into issues so auto-fix can detect patterns like credibility rejection
    const allIssuesForFix = [...analysis.issues];
    if (analysis.aiAnalysis) {
      // Split AI analysis into sentences so pattern matching works on each
      const aiSentences = analysis.aiAnalysis.split(/[.\n]/).filter(s => s.trim().length > 20);
      allIssuesForFix.push(...aiSentences);
    }
    let appliedFixes = [];
    if (allIssuesForFix.length > 0) {
      appliedFixes = await applyFixes('social-optimizer', allIssuesForFix, metrics);
      if (appliedFixes.length > 0) {
        console.log(`[social-optimizer] Auto-fixed ${appliedFixes.length} issue(s)`);
        report.autoFixes = appliedFixes;
      }
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
        `Reddit (7d): ${metrics.reddit_7d.upvotes} upvotes, ${metrics.reddit_7d.comments} comments`,
        `Menciones YTubViral: ${analysis.totalMentions}/${analysis.totalComments} (${analysis.mentionRate}%)`,
        `Follow-ups: ${metrics.followups_7d.responded}/${metrics.followups_7d.detected} respondidos`,
        `Usuarios nuevos (7d): ${metrics.users.newThisWeek}`,
        '',
        analysis.aiAnalysis ? `── ANÁLISIS IA ──\n${analysis.aiAnalysis}` : '',
        '',
        analysis.recommendations.length > 0 ? `── RECOMENDACIONES ──\n${analysis.recommendations.map(r => `→ ${r}`).join('\n')}` : '',
      ].filter(Boolean).join('\n');

      await sendEmail('[YTubViral] Social Optimizer — Reporte diario', emailBody);
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
    id: 'bump-mention-rate',
    description: 'Subir mentionRate de personas cuando tasa de menciones es baja',
    cooldownMs: 72 * 3600000, // 3 days between bumps
    condition: (issues) => issues.some(i => i.includes('MENCIONES:')),
    apply: (config) => {
      const personas = config.personas || {};
      let changed = false;
      const details = [];
      for (const [key, persona] of Object.entries(personas)) {
        if (typeof persona !== 'object' || !persona.mentionRate) continue;
        const prev = persona.mentionRate;
        const next = Math.min(0.5, Math.round((prev + 0.05) * 100) / 100);
        if (next > prev) {
          persona.mentionRate = next;
          details.push(`${key}: ${prev} → ${next}`);
          changed = true;
        }
      }
      if (!changed) return { changed: false };
      return { changed: true, detail: `mentionRate bumped: ${details.join(', ')}`, previousValue: details.map(d => d.split(' → ')[0]), newValue: details.map(d => d.split(' → ')[1]) };
    },
  },
  {
    id: 'increase-session-limit',
    description: 'Aumentar límite de tweets/reddit por sesión cuando hay baja actividad',
    cooldownMs: 7 * 86400000, // 7 days
    condition: (issues) => issues.some(i => i.includes('0 actividad en 24h')),
    apply: (config) => {
      const pr = config['persona-runner'] || {};
      const results = [];
      let changed = false;

      if ((pr.maxTweetsPerSession || 10) < 15) {
        const prev = pr.maxTweetsPerSession || 10;
        if (!config['persona-runner']) config['persona-runner'] = {};
        config['persona-runner'].maxTweetsPerSession = prev + 3;
        results.push(`maxTweets: ${prev} → ${prev + 3}`);
        changed = true;
      }
      if ((pr.maxRedditPerSession || 5) < 8) {
        const prev = pr.maxRedditPerSession || 5;
        if (!config['persona-runner']) config['persona-runner'] = {};
        config['persona-runner'].maxRedditPerSession = prev + 2;
        results.push(`maxReddit: ${prev} → ${prev + 2}`);
        changed = true;
      }
      if (!changed) return { changed: false };
      return { changed: true, detail: `Session limits raised: ${results.join(', ')}` };
    },
  },
  {
    id: 'reduce-skip-probability',
    description: 'Reducir probabilidad de saltar sesiones cuando actividad es baja',
    cooldownMs: 7 * 86400000, // 7 days
    condition: (issues) => issues.some(i => i.includes('0 actividad en 24h')),
    apply: (config) => {
      const h = config.humanize || {};
      const prev = h.skipSessionProbability ?? 0.15;
      if (prev <= 0.05) return { changed: false, detail: 'skipSessionProbability already at minimum' };
      const next = Math.max(0.05, Math.round((prev - 0.05) * 100) / 100);
      if (!config.humanize) config.humanize = {};
      config.humanize.skipSessionProbability = next;
      return { changed: true, detail: `skipSessionProbability: ${prev} → ${next}`, previousValue: prev, newValue: next };
    },
  },
  {
    id: 'reduce-skip-post-probability',
    description: 'Reducir probabilidad de saltar posts cuando menciones son bajas',
    cooldownMs: 7 * 86400000, // 7 days
    condition: (issues) => issues.some(i => i.includes('MENCIONES:') || i.includes('0 actividad')),
    apply: (config) => {
      const h = config.humanize || {};
      const prev = h.skipPostProbability ?? 0.25;
      if (prev <= 0.10) return { changed: false };
      const next = Math.max(0.10, Math.round((prev - 0.05) * 100) / 100);
      if (!config.humanize) config.humanize = {};
      config.humanize.skipPostProbability = next;
      return { changed: true, detail: `skipPostProbability: ${prev} → ${next}`, previousValue: prev, newValue: next };
    },
  },
  {
    id: 'fix-mention-credibility',
    description: 'Reforzar instrucción de mención cuando la IA rechaza recomendar por falta de credibilidad',
    cooldownMs: 14 * 86400000, // 14 days — structural fix, not frequent
    condition: (issues) => {
      // Detect AI analysis mentioning credibility/verification rejection
      const patterns = [
        /rechaz[óo].*recomendar/i, /no puede verificar/i, /credibilidad/i,
        /refuse.*recommend/i, /can.?t verify/i, /credibility/i,
        /no.*menciona.*ytubviral/i, /not.*mention/i,
        /problema.*[eé]tico/i, /ethical.*problem/i,
      ];
      return issues.some(i => patterns.some(p => p.test(i)));
    },
    apply: async (config, issues) => {
      // Read current personas and check if they already reference ytubviral
      const personasPath = require('path').join(__dirname, 'personas.json');
      try {
        const personas = JSON.parse(fs.readFileSync(personasPath, 'utf8'));
        const fixes = [];

        for (const persona of personas) {
          const esHas = (persona.personality?.es || '').includes('ytubviral');
          const enHas = (persona.personality?.en || '').includes('ytubviral');

          if (!esHas || !enHas) {
            fixes.push(`${persona.name}: personalidad no incluye experiencia con ytubviral (es:${esHas}, en:${enHas})`);
          }
        }

        if (fixes.length > 0) {
          // Send alert — personality needs manual update
          await sendEmail(
            '[YTubViral Social] Personas rechazan mencionar YTubViral — acción requerida',
            `El análisis de Social Optimizer detectó que las personas están rechazando recomendar YTubViral por falta de credibilidad en su perfil.\n\nProblemas encontrados:\n${fixes.join('\n')}\n\nACCIÓN: Actualizar personalidades en personas.json para incluir experiencia real con ytubviral.com.\n\nIssues del análisis:\n${issues.filter(i => /credib|rechaz|verify|menciona|mention/i.test(i)).join('\n')}`
          ).catch(() => {});
          return { changed: false, detail: `Credibility gap detectado: ${fixes.join('; ')}. Alerta enviada.` };
        }

        return { changed: false, detail: 'Personalidades ya incluyen referencia a ytubviral — credibilidad OK' };
      } catch (err) {
        return { changed: false, detail: `Error checking personas: ${err.message}` };
      }
    },
  },
  {
    id: 'fix-irrelevant-targeting',
    description: 'Alerta cuando las personas comentan en hilos no relevantes (baja conversión)',
    cooldownMs: 7 * 86400000,
    condition: (issues) => {
      return issues.some(i => /relevancia|irrelevant|lejos del.*n[uú]cleo|too far|off.?topic/i.test(i));
    },
    apply: async (config, issues) => {
      await sendEmail(
        '[YTubViral Social] Personas en hilos irrelevantes — revisar targeting',
        `El análisis detectó que las personas están participando en conversaciones que no son relevantes para YTubViral.\n\nIssues:\n${issues.filter(i => /relevan|irrelevant|lejos|far|topic/i.test(i)).join('\n')}\n\nACCIÓN SUGERIDA:\n1. Revisar keywords de búsqueda en twitter.js y reddit.js\n2. Añadir filtros más estrictos en claude.js (isYtubviralRelevantPost)\n3. Verificar que los subreddits target son correctos`
      ).catch(() => {});
      return { changed: false, detail: 'Alerta de targeting irrelevante enviada' };
    },
  },
]);

module.exports = { runSocialOptimizer };
