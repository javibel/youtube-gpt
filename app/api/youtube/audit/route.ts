import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import Anthropic from '@anthropic-ai/sdk';
import { getUserPlan, isPaid } from '@/lib/plans';
import { parseClaudeJson } from '@/lib/parse-claude-json';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const maxDuration = 60;

// ── YouTube Analytics query helper ────────────────────────────────────────

async function queryAnalytics(token: string, channelId: string, params: Record<string, string>) {
  const base = 'https://youtubeanalytics.googleapis.com/v2/reports';
  const qs = new URLSearchParams({ ids: `channel==${channelId}`, ...params });
  const res = await fetch(`${base}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Analytics API ${res.status}`);
  }
  return res.json();
}

function toRows<T>(data: { columnHeaders: { name: string }[]; rows?: unknown[][] }): T[] {
  if (!data.rows?.length) return [];
  const headers = data.columnHeaders.map(h => h.name);
  return data.rows.map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj as T;
  });
}

// ── SEO scoring (lightweight inline) ──────────────────────────────────────

function computeSeoScore(title: string, desc: string, tags: string[]): number {
  const checks = [
    { ok: title.length >= 30 && title.length <= 70, w: 8 },
    { ok: /\d/.test(title), w: 5 },
    { ok: title !== title.toUpperCase(), w: 4 },
    { ok: /[\p{Emoji_Presentation}]/u.test(title), w: 3 },
    { ok: /\b(cómo|how|best|mejor|secret|secreto|ultimate|top|hack|error|mistake)\b/i.test(title), w: 4 },
    { ok: desc.split(/\s+/).filter(Boolean).length >= 100, w: 10 },
    { ok: /https?:\/\//.test(desc), w: 5 },
    { ok: /\d{1,2}:\d{2}/.test(desc), w: 7 },
    { ok: /#\w+/.test(desc), w: 4 },
    { ok: /suscri|subscribe|like|comenta|comment/i.test(desc), w: 3 },
    { ok: tags.length >= 5 && tags.length <= 20, w: 8 },
    { ok: tags.some(t => t.split(/\s+/).length >= 3), w: 4 },
    { ok: tags.some(t => t.split(/\s+/).length === 1), w: 3 },
  ];
  const maxW = checks.reduce((s, c) => s + c.w, 0);
  const rawW = checks.filter(c => c.ok).reduce((s, c) => s + c.w, 0);
  return Math.round((rawW / maxW) * 100);
}

// ── Scoring categories ────────────────────────────────────────────────────

interface VideoData {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSec: number;
  seoScore: number;
}

interface CategoryScore {
  key: string;
  label: { es: string; en: string };
  score: number;
  maxScore: number;
  checks: { key: string; label: { es: string; en: string }; passed: boolean; impact: number }[];
}

function scoreContent(videos: VideoData[]): CategoryScore {
  if (!videos.length) return { key: 'content', label: { es: 'Contenido', en: 'Content' }, score: 0, maxScore: 100, checks: [] };

  const avgDuration = videos.reduce((s, v) => s + v.durationSec, 0) / videos.length;
  const goodDuration = avgDuration >= 480 && avgDuration <= 1200;
  const hasLongform = videos.some(v => v.durationSec >= 600);
  const avgDescWords = videos.reduce((s, v) => s + v.description.split(/\s+/).filter(Boolean).length, 0) / videos.length;
  const goodDescs = avgDescWords >= 80;
  const withTimestamps = videos.filter(v => /\d{1,2}:\d{2}/.test(v.description)).length;
  const timestampsPct = withTimestamps / videos.length;
  const withLinks = videos.filter(v => /https?:\/\//.test(v.description)).length;
  const linksPct = withLinks / videos.length;

  const checks = [
    { key: 'avg_duration', label: { es: 'Duración media óptima (8-20 min)', en: 'Optimal avg duration (8-20 min)' }, passed: goodDuration, impact: 25 },
    { key: 'longform', label: { es: 'Videos long-form (10+ min)', en: 'Long-form videos (10+ min)' }, passed: hasLongform, impact: 15 },
    { key: 'desc_quality', label: { es: 'Descripciones completas (80+ palabras)', en: 'Complete descriptions (80+ words)' }, passed: goodDescs, impact: 25 },
    { key: 'timestamps', label: { es: 'Timestamps en >50% videos', en: 'Timestamps in >50% videos' }, passed: timestampsPct > 0.5, impact: 20 },
    { key: 'links', label: { es: 'Enlaces en descripciones', en: 'Links in descriptions' }, passed: linksPct > 0.5, impact: 15 },
  ];

  const score = checks.filter(c => c.passed).reduce((s, c) => s + c.impact, 0);
  return { key: 'content', label: { es: 'Contenido', en: 'Content' }, score, maxScore: 100, checks };
}

function scoreSeo(videos: VideoData[]): CategoryScore {
  if (!videos.length) return { key: 'seo', label: { es: 'SEO', en: 'SEO' }, score: 0, maxScore: 100, checks: [] };

  const avgSeo = videos.reduce((s, v) => s + v.seoScore, 0) / videos.length;
  const withTags = videos.filter(v => v.tags.length >= 5).length;
  const tagsPct = withTags / videos.length;
  const withHashtags = videos.filter(v => /#\w+/.test(v.description)).length;
  const hashtagsPct = withHashtags / videos.length;
  const goodTitles = videos.filter(v => v.title.length >= 30 && v.title.length <= 70).length;
  const titlesPct = goodTitles / videos.length;

  const checks = [
    { key: 'avg_seo', label: { es: 'SEO Score promedio ≥ 60', en: 'Average SEO Score ≥ 60' }, passed: avgSeo >= 60, impact: 30 },
    { key: 'tags_usage', label: { es: '>70% videos con 5+ tags', en: '>70% videos with 5+ tags' }, passed: tagsPct > 0.7, impact: 25 },
    { key: 'hashtags', label: { es: 'Hashtags en >50% videos', en: 'Hashtags in >50% videos' }, passed: hashtagsPct > 0.5, impact: 15 },
    { key: 'title_length', label: { es: 'Títulos bien dimensionados (30-70 chars)', en: 'Well-sized titles (30-70 chars)' }, passed: titlesPct > 0.7, impact: 30 },
  ];

  const score = checks.filter(c => c.passed).reduce((s, c) => s + c.impact, 0);
  return { key: 'seo', label: { es: 'SEO', en: 'SEO' }, score, maxScore: 100, checks };
}

function scoreGrowth(
  overview: Record<string, number>,
  daily: { day: string; subscribersGained: number; subscribersLost: number; views: number }[],
): CategoryScore {
  const subsGained = overview.subscribersGained || 0;
  const subsLost = overview.subscribersLost || 0;
  const netSubs = subsGained - subsLost;
  const subsRatio = subsGained > 0 ? subsLost / subsGained : 1;

  // Check if views are trending up (compare first half vs second half)
  let trending = false;
  if (daily.length >= 14) {
    const half = Math.floor(daily.length / 2);
    const firstHalf = daily.slice(0, half).reduce((s, d) => s + d.views, 0) / half;
    const secondHalf = daily.slice(half).reduce((s, d) => s + d.views, 0) / (daily.length - half);
    trending = secondHalf > firstHalf * 1.05;
  }

  const checks = [
    { key: 'net_positive', label: { es: 'Crecimiento neto positivo', en: 'Net positive growth' }, passed: netSubs > 0, impact: 30 },
    { key: 'low_churn', label: { es: 'Baja pérdida de suscriptores (<30%)', en: 'Low subscriber churn (<30%)' }, passed: subsRatio < 0.3, impact: 25 },
    { key: 'views_trending', label: { es: 'Tendencia de views al alza', en: 'Views trending upward' }, passed: trending, impact: 25 },
    { key: 'subs_gained', label: { es: '10+ suscriptores en 28 días', en: '10+ subscribers in 28 days' }, passed: subsGained >= 10, impact: 20 },
  ];

  const score = checks.filter(c => c.passed).reduce((s, c) => s + c.impact, 0);
  return { key: 'growth', label: { es: 'Crecimiento', en: 'Growth' }, score, maxScore: 100, checks };
}

function scoreEngagement(overview: Record<string, number>, videos: VideoData[]): CategoryScore {
  const views = overview.views || 1;
  const likes = overview.likes || 0;
  const comments = overview.comments || 0;
  const shares = overview.shares || 0;
  const avgViewPct = overview.averageViewPercentage || 0;

  const engRate = (likes + comments) / views;
  const shareRate = shares / views;

  // Check if videos have CTAs
  const withCta = videos.filter(v => /suscri|subscribe|like|comenta|comment|comparte|share/i.test(v.description)).length;
  const ctaPct = videos.length > 0 ? withCta / videos.length : 0;

  const checks = [
    { key: 'eng_rate', label: { es: 'Engagement rate > 3%', en: 'Engagement rate > 3%' }, passed: engRate > 0.03, impact: 30 },
    { key: 'avg_retention', label: { es: 'Retención media > 40%', en: 'Average retention > 40%' }, passed: avgViewPct > 40, impact: 30 },
    { key: 'share_rate', label: { es: 'Videos compartidos', en: 'Videos shared' }, passed: shareRate > 0.001, impact: 15 },
    { key: 'cta_usage', label: { es: 'CTAs en >50% descripciones', en: 'CTAs in >50% descriptions' }, passed: ctaPct > 0.5, impact: 25 },
  ];

  const score = checks.filter(c => c.passed).reduce((s, c) => s + c.impact, 0);
  return { key: 'engagement', label: { es: 'Engagement', en: 'Engagement' }, score, maxScore: 100, checks };
}

function scoreConsistency(videos: VideoData[]): CategoryScore {
  if (videos.length < 2) {
    return { key: 'consistency', label: { es: 'Consistencia', en: 'Consistency' }, score: 0, maxScore: 100, checks: [] };
  }

  // Calculate upload frequency
  const dates = videos.map(v => new Date(v.publishedAt).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
  }
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const maxGap = Math.max(...gaps);

  // Coefficient of variation (consistency of gaps)
  const stdDev = Math.sqrt(gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length);
  const cv = avgGap > 0 ? stdDev / avgGap : 999;

  const checks = [
    { key: 'freq_weekly', label: { es: 'Al menos 1 video/semana', en: 'At least 1 video/week' }, passed: avgGap <= 7, impact: 35 },
    { key: 'no_long_gaps', label: { es: 'Sin pausas > 14 días', en: 'No gaps > 14 days' }, passed: maxGap <= 14, impact: 25 },
    { key: 'regular_schedule', label: { es: 'Calendario regular (baja variación)', en: 'Regular schedule (low variation)' }, passed: cv < 0.6, impact: 25 },
    { key: 'active_recent', label: { es: 'Video en últimos 7 días', en: 'Video in last 7 days' }, passed: (Date.now() - dates[dates.length - 1]) < 7 * 86400000, impact: 15 },
  ];

  const score = checks.filter(c => c.passed).reduce((s, c) => s + c.impact, 0);
  return { key: 'consistency', label: { es: 'Consistencia', en: 'Consistency' }, score, maxScore: 100, checks };
}

// ── Quick Wins generator ──────────────────────────────────────────────────

interface QuickWin {
  label: { es: string; en: string };
  detail: { es: string; en: string };
  action: { label: { es: string; en: string }; href: string };
  priority: 'high' | 'medium' | 'low';
}

function generateQuickWins(
  categories: CategoryScore[],
  videos: VideoData[],
  overview: Record<string, number>,
): QuickWin[] {
  const wins: QuickWin[] = [];

  // Find worst SEO videos
  const worstSeo = [...videos].sort((a, b) => a.seoScore - b.seoScore).slice(0, 3);
  for (const v of worstSeo) {
    if (v.seoScore < 50) {
      wins.push({
        label: { es: `Optimiza "${v.title.slice(0, 40)}..."`, en: `Optimize "${v.title.slice(0, 40)}..."` },
        detail: { es: `SEO Score: ${v.seoScore}/100. Mejora título, descripción y tags.`, en: `SEO Score: ${v.seoScore}/100. Improve title, description and tags.` },
        action: { label: { es: 'Optimizar', en: 'Optimize' }, href: `/optimize?videoId=${v.videoId}` },
        priority: 'high',
      });
    }
  }

  // Check missing tags
  const noTags = videos.filter(v => v.tags.length < 3);
  if (noTags.length > 0) {
    wins.push({
      label: { es: `${noTags.length} vídeos sin tags`, en: `${noTags.length} videos without tags` },
      detail: { es: 'Los tags ayudan a YouTube a clasificar tus vídeos. Añade 5-15 tags relevantes.', en: 'Tags help YouTube categorize your videos. Add 5-15 relevant tags.' },
      action: { label: { es: 'Optimizar', en: 'Optimize' }, href: `/optimize` },
      priority: 'high',
    });
  }

  // Check descriptions
  const shortDescs = videos.filter(v => v.description.split(/\s+/).filter(Boolean).length < 50);
  if (shortDescs.length > 2) {
    wins.push({
      label: { es: `${shortDescs.length} vídeos con descripción corta`, en: `${shortDescs.length} videos with short description` },
      detail: { es: 'Descripciones de 150+ palabras mejoran el posicionamiento en búsqueda.', en: '150+ word descriptions improve search ranking.' },
      action: { label: { es: 'Optimizar', en: 'Optimize' }, href: `/optimize` },
      priority: 'medium',
    });
  }

  // Engagement check
  const engRate = overview.views > 0 ? ((overview.likes || 0) + (overview.comments || 0)) / overview.views : 0;
  if (engRate < 0.03) {
    wins.push({
      label: { es: 'Mejora tu engagement rate', en: 'Improve your engagement rate' },
      detail: { es: `Tu engagement es ${(engRate * 100).toFixed(1)}%. Añade CTAs claros pidiendo likes y comentarios.`, en: `Your engagement is ${(engRate * 100).toFixed(1)}%. Add clear CTAs asking for likes and comments.` },
      action: { label: { es: 'Ver Coach AI', en: 'Ask AI Coach' }, href: `/coach` },
      priority: 'medium',
    });
  }

  // Retention check
  const avgRetention = overview.averageViewPercentage || 0;
  if (avgRetention < 40 && avgRetention > 0) {
    wins.push({
      label: { es: 'Retención por debajo del 40%', en: 'Retention below 40%' },
      detail: { es: `Tu retención media es ${Math.round(avgRetention)}%. Mejora los primeros 30 segundos de tus vídeos.`, en: `Your average retention is ${Math.round(avgRetention)}%. Improve the first 30 seconds of your videos.` },
      action: { label: { es: 'Analizar retención', en: 'Analyze retention' }, href: `/retention` },
      priority: 'high',
    });
  }

  // Consistency check
  const consistencyCategory = categories.find(c => c.key === 'consistency');
  if (consistencyCategory && consistencyCategory.score < 50) {
    wins.push({
      label: { es: 'Publica más consistentemente', en: 'Publish more consistently' },
      detail: { es: 'Un calendario regular de publicación mejora el rendimiento del algoritmo.', en: 'A regular publishing schedule improves algorithm performance.' },
      action: { label: { es: 'Ir al calendario', en: 'Go to calendar' }, href: `/calendar` },
      priority: 'medium',
    });
  }

  // Best time
  if (overview.views > 0) {
    wins.push({
      label: { es: 'Publica en tu mejor horario', en: 'Publish at your best time' },
      detail: { es: 'Analiza cuándo tu audiencia está más activa para maximizar las primeras horas.', en: 'Analyze when your audience is most active to maximize the first hours.' },
      action: { label: { es: 'Ver Best Time', en: 'See Best Time' }, href: `/best-time` },
      priority: 'low',
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  wins.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return wins.slice(0, 8);
}

// ── Pattern analysis ──────────────────────────────────────────────────────

interface PatternAnalysis {
  topVideos: { videoId: string; title: string; views: number; seoScore: number }[];
  bottomVideos: { videoId: string; title: string; views: number; seoScore: number }[];
  patterns: { es: string; en: string }[];
}

function analyzePatterns(videos: VideoData[]): PatternAnalysis {
  if (videos.length < 4) {
    return { topVideos: [], bottomVideos: [], patterns: [] };
  }

  const sorted = [...videos].sort((a, b) => b.views - a.views);
  const topN = Math.max(3, Math.floor(videos.length * 0.25));
  const top = sorted.slice(0, topN);
  const bottom = sorted.slice(-topN);

  const patterns: { es: string; en: string }[] = [];

  // Compare SEO scores
  const topAvgSeo = top.reduce((s, v) => s + v.seoScore, 0) / top.length;
  const bottomAvgSeo = bottom.reduce((s, v) => s + v.seoScore, 0) / bottom.length;
  if (topAvgSeo > bottomAvgSeo + 10) {
    patterns.push({
      es: `Tus TOP videos tienen SEO Score ${Math.round(topAvgSeo)} vs ${Math.round(bottomAvgSeo)} de los peores. El SEO importa.`,
      en: `Your TOP videos have SEO Score ${Math.round(topAvgSeo)} vs ${Math.round(bottomAvgSeo)} for bottom ones. SEO matters.`,
    });
  }

  // Compare title lengths
  const topAvgTitleLen = top.reduce((s, v) => s + v.title.length, 0) / top.length;
  const bottomAvgTitleLen = bottom.reduce((s, v) => s + v.title.length, 0) / bottom.length;
  if (Math.abs(topAvgTitleLen - bottomAvgTitleLen) > 10) {
    const better = topAvgTitleLen > bottomAvgTitleLen ? 'longer' : 'shorter';
    const betterEs = topAvgTitleLen > bottomAvgTitleLen ? 'más largos' : 'más cortos';
    patterns.push({
      es: `Tus TOP videos tienen títulos ${betterEs} (${Math.round(topAvgTitleLen)} vs ${Math.round(bottomAvgTitleLen)} chars).`,
      en: `Your TOP videos have ${better} titles (${Math.round(topAvgTitleLen)} vs ${Math.round(bottomAvgTitleLen)} chars).`,
    });
  }

  // Compare duration
  const topAvgDuration = top.reduce((s, v) => s + v.durationSec, 0) / top.length;
  const bottomAvgDuration = bottom.reduce((s, v) => s + v.durationSec, 0) / bottom.length;
  if (Math.abs(topAvgDuration - bottomAvgDuration) > 120) {
    const topMin = Math.round(topAvgDuration / 60);
    const bottomMin = Math.round(bottomAvgDuration / 60);
    patterns.push({
      es: `Tus TOP videos duran ~${topMin} min vs ~${bottomMin} min los peores.`,
      en: `Your TOP videos are ~${topMin} min vs ~${bottomMin} min for bottom ones.`,
    });
  }

  // Tags comparison
  const topAvgTags = top.reduce((s, v) => s + v.tags.length, 0) / top.length;
  const bottomAvgTags = bottom.reduce((s, v) => s + v.tags.length, 0) / bottom.length;
  if (topAvgTags > bottomAvgTags + 3) {
    patterns.push({
      es: `Tus TOP videos usan ${Math.round(topAvgTags)} tags de media vs ${Math.round(bottomAvgTags)} en los peores.`,
      en: `Your TOP videos use ${Math.round(topAvgTags)} tags on average vs ${Math.round(bottomAvgTags)} for bottom ones.`,
    });
  }

  // Check for numbers in titles
  const topWithNumbers = top.filter(v => /\d/.test(v.title)).length / top.length;
  const bottomWithNumbers = bottom.filter(v => /\d/.test(v.title)).length / bottom.length;
  if (topWithNumbers > bottomWithNumbers + 0.2) {
    patterns.push({
      es: `${Math.round(topWithNumbers * 100)}% de tus TOP videos usan números en el título vs ${Math.round(bottomWithNumbers * 100)}% de los peores.`,
      en: `${Math.round(topWithNumbers * 100)}% of your TOP videos use numbers in titles vs ${Math.round(bottomWithNumbers * 100)}% of bottom ones.`,
    });
  }

  return {
    topVideos: top.slice(0, 5).map(v => ({ videoId: v.videoId, title: v.title, views: v.views, seoScore: v.seoScore })),
    bottomVideos: bottom.slice(0, 5).map(v => ({ videoId: v.videoId, title: v.title, views: v.views, seoScore: v.seoScore })),
    patterns,
  };
}

// ── GET handler ────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const yt = await prisma.youtubeToken.findUnique({ where: { userId: session.user.id } });
  if (!yt?.channelId) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const accessToken = await getAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  const now = new Date();
  const endDate = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const startDate28 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  try {
    // ── Parallel fetch: Analytics + Videos ──────────────────────────────

    const [overviewRes, dailyRes, videosSearchRes] = await Promise.all([
      queryAnalytics(accessToken, yt.channelId, {
        startDate: startDate28,
        endDate,
        metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares',
      }),
      queryAnalytics(accessToken, yt.channelId, {
        startDate: startDate28,
        endDate,
        metrics: 'views,subscribersGained,subscribersLost',
        dimensions: 'day',
        sort: 'day',
      }),
      fetch(
        'https://www.googleapis.com/youtube/v3/search?part=id,snippet&forMine=true&type=video&order=date&maxResults=30',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
    ]);

    // Parse overview
    const ovHeaders = overviewRes.columnHeaders?.map((h: { name: string }) => h.name) || [];
    const ovRow = overviewRes.rows?.[0] || [];
    const overview: Record<string, number> = {};
    ovHeaders.forEach((h: string, i: number) => { overview[h] = Number(ovRow[i]) || 0; });

    // Parse daily
    const daily = toRows<{ day: string; views: number; subscribersGained: number; subscribersLost: number }>(dailyRes);

    // Parse videos search
    const searchData = await videosSearchRes.json();
    const videoIds = (searchData.items || []).map((i: { id: { videoId: string } }) => i.id.videoId);

    if (!videoIds.length) {
      return NextResponse.json({ error: 'no_videos' }, { status: 400 });
    }

    // Fetch full video details
    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const statsData = await statsRes.json();

    const videos: VideoData[] = (statsData.items || []).map((v: {
      id: string;
      snippet: { title: string; description: string; tags?: string[]; publishedAt: string };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails: { duration?: string };
    }) => {
      const durationMatch = (v.contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      const durationSec = durationMatch
        ? (parseInt(durationMatch[1] || '0') * 3600) + (parseInt(durationMatch[2] || '0') * 60) + parseInt(durationMatch[3] || '0')
        : 0;

      return {
        videoId: v.id,
        title: v.snippet.title || '',
        description: v.snippet.description || '',
        tags: v.snippet.tags || [],
        publishedAt: v.snippet.publishedAt || '',
        views: parseInt(v.statistics.viewCount || '0', 10),
        likes: parseInt(v.statistics.likeCount || '0', 10),
        comments: parseInt(v.statistics.commentCount || '0', 10),
        durationSec,
        seoScore: computeSeoScore(v.snippet.title || '', v.snippet.description || '', v.snippet.tags || []),
      };
    });

    // ── Compute category scores ──────────────────────────────────────────

    const categories = [
      scoreContent(videos),
      scoreSeo(videos),
      scoreGrowth(overview, daily),
      scoreEngagement(overview, videos),
      scoreConsistency(videos),
    ];

    const healthScore = Math.round(
      categories.reduce((s, c) => s + c.score, 0) / categories.length
    );

    // ── Quick Wins ──────────────────────────────────────────────────────

    const quickWins = generateQuickWins(categories, videos, overview);

    // ── Pattern analysis ────────────────────────────────────────────────

    const patternAnalysis = analyzePatterns(videos);

    // ── AI Summary ──────────────────────────────────────────────────────

    let aiSummary: { es: string; en: string } | null = null;
    try {
      const prompt = `You are a YouTube growth expert. Analyze this channel audit data and give 2-3 specific, actionable insights. Be direct and practical.

Channel: ${yt.channelName} (${yt.subscribers} subs)
Health Score: ${healthScore}/100
Categories: ${categories.map(c => `${c.key}: ${c.score}/100`).join(', ')}
Videos analyzed: ${videos.length}
28-day overview: ${JSON.stringify(overview)}
Top patterns found: ${patternAnalysis.patterns.map(p => p.en).join('; ')}
Quick wins count: ${quickWins.length}

Reply ONLY with valid JSON: {"es": "...", "en": "..."}
Keep each under 200 words. Use line breaks for readability. No markdown.`;

      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = (msg.content[0] as { type: string; text: string }).text.trim();
      const parsed = parseClaudeJson<{ es?: string; en?: string }>(text);
      if (parsed.es && parsed.en) {
        aiSummary = { es: parsed.es, en: parsed.en };
      }
    } catch {
      // AI summary is optional — don't fail the audit
    }

    return NextResponse.json({
      channelName: yt.channelName || 'Channel',
      subscribers: yt.subscribers || 0,
      healthScore,
      categories,
      quickWins,
      patterns: patternAnalysis,
      aiSummary,
      videosAnalyzed: videos.length,
      period: { start: startDate28, end: endDate },
    });
  } catch (e) {
    console.error('[youtube/audit] error', e);
    const msg = e instanceof Error ? e.message : 'Audit error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
