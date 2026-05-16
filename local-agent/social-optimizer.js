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

    const prompt = `Eres un analista de marketing de redes sociales. Analiza estos comentarios dejados por cuentas personas (Alex=editor freelance 26yo, Ferran=consultor marketing 33yo) en Reddit/Twitter.

OBJETIVO: Estos comentarios deben eventualmente llevar usuarios a ytubviral.com (herramienta IA para YouTubers).

COMENTARIOS:
${commentsForReview}

MÉTRICAS:
- Menciones de ytubviral.com: ${totalMentions}/${totalComments} (${mentionRate}%)
- Follow-ups respondidos: ${metrics.followups_7d.responded}/${metrics.followups_7d.detected}
- Nuevos usuarios esta semana: ${metrics.users.newThisWeek}

Analiza en máximo 200 palabras:
1. ¿Los comentarios están en conversaciones RELEVANTES al producto (YouTube, SEO, herramientas)?
2. ¿La calidad del contenido genera autoridad?
3. ¿Por qué no se menciona ytubviral.com?
4. 3 recomendaciones concretas para mejorar conversión

Responde en español, directo, sin rodeos.`;

    const aiResult = await guardedCall(prompt, { maxTokens: 400, agentId: 'social-optimizer' });
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

module.exports = { runSocialOptimizer };
