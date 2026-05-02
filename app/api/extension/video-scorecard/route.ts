import { NextResponse } from 'next/server';
import { getExtensionUser } from '@/lib/extension-auth';

// ── SEO checks (lightweight, no Claude) ────────────────────────────────

function checkTitle(title: string) {
  const len = title.length;
  return [
    { key: 'title_length', ok: len >= 30 && len <= 70, w: 8 },
    { key: 'title_number', ok: /\d/.test(title), w: 5 },
    { key: 'title_caps', ok: title !== title.toUpperCase(), w: 4 },
    { key: 'title_emoji', ok: /[\p{Emoji_Presentation}]/u.test(title), w: 3 },
    { key: 'title_power', ok: /\b(cómo|how|best|mejor|secret|secreto|ultimate|top|hack|error|mistake)\b/i.test(title), w: 4 },
  ];
}

function checkDesc(desc: string) {
  const wc = desc.split(/\s+/).filter(Boolean).length;
  return [
    { key: 'desc_length', ok: wc >= 100, w: 10 },
    { key: 'desc_links', ok: /https?:\/\//.test(desc), w: 5 },
    { key: 'desc_timestamps', ok: /\d{1,2}:\d{2}/.test(desc), w: 7 },
    { key: 'desc_hashtags', ok: /#\w+/.test(desc), w: 4 },
    { key: 'desc_cta', ok: /suscri|subscribe|like|comenta|comment/i.test(desc), w: 3 },
  ];
}

function checkTags(tags: string[]) {
  return [
    { key: 'tags_count', ok: tags.length >= 5 && tags.length <= 20, w: 8 },
    { key: 'tags_long', ok: tags.some(t => t.split(/\s+/).length >= 3), w: 4 },
  ];
}

function checkVideo(snippet: { title: string; description: string; tags?: string[]; thumbnails?: Record<string, unknown> }, stats: { viewCount?: string; likeCount?: string; commentCount?: string }, contentDetails: { duration?: string; caption?: string }) {
  const title = snippet.title || '';
  const desc = snippet.description || '';
  const tags = snippet.tags || [];
  const views = parseInt(stats.viewCount || '0', 10);
  const likes = parseInt(stats.likeCount || '0', 10);
  const comments = parseInt(stats.commentCount || '0', 10);

  const durationMatch = (contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const durationSec = durationMatch
    ? (parseInt(durationMatch[1] || '0') * 3600) + (parseInt(durationMatch[2] || '0') * 60) + parseInt(durationMatch[3] || '0')
    : 0;

  const checks = [
    ...checkTitle(title),
    ...checkDesc(desc),
    ...checkTags(tags),
    { key: 'thumbnail', ok: snippet.thumbnails ? Object.keys(snippet.thumbnails).length >= 4 : false, w: 8 },
    { key: 'captions', ok: contentDetails.caption === 'true', w: 6 },
    { key: 'engagement', ok: views > 0 ? ((likes + comments) / views) > 0.03 : false, w: 7 },
    { key: 'duration', ok: durationSec >= 480 && durationSec <= 1200, w: 5 },
  ];

  const maxW = checks.reduce((s, c) => s + c.w, 0);
  const rawW = checks.filter(c => c.ok).reduce((s, c) => s + c.w, 0);
  return { score: Math.round((rawW / maxW) * 100), checks };
}

// ── POST ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Open to all logged-in users (Free + Pro) — no Claude cost
  const extUser = await getExtensionUser(request);
  if (!extUser) {
    return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const videoId = body.videoId as string | undefined;
  if (!videoId) {
    return NextResponse.json({ error: 'videoId required' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
  }

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(videoId)}&key=${apiKey}`,
  );
  if (!res.ok) {
    return NextResponse.json({ error: 'YouTube API error' }, { status: 500 });
  }

  const data = await res.json();
  const video = data.items?.[0];
  if (!video) {
    return NextResponse.json({ error: 'video not found' }, { status: 404 });
  }

  const snippet = video.snippet;
  const stats = video.statistics || {};
  const contentDetails = video.contentDetails || {};

  const views = parseInt(stats.viewCount || '0', 10);
  const likes = parseInt(stats.likeCount || '0', 10);
  const comments = parseInt(stats.commentCount || '0', 10);

  // Calculate age
  const publishedAt = snippet.publishedAt ? new Date(snippet.publishedAt) : new Date();
  const ageHours = Math.max(1, (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60));
  const ageDays = Math.floor(ageHours / 24);

  // Views per hour
  const vph = Math.round(views / ageHours * 10) / 10;

  // Engagement %
  const engagement = views > 0 ? Math.round(((likes + comments) / views) * 1000) / 10 : 0;

  // Likes ratio
  const likesRatio = views > 0 ? Math.round((likes / views) * 1000) / 10 : 0;

  // Duration
  const durationMatch = (contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const durationSec = durationMatch
    ? (parseInt(durationMatch[1] || '0') * 3600) + (parseInt(durationMatch[2] || '0') * 60) + parseInt(durationMatch[3] || '0')
    : 0;

  // SEO Score
  const { score, checks } = checkVideo(snippet, stats, contentDetails);

  // Outlier detection: fetch channel stats to compute average views
  let outlierMultiplier = 0;
  let channelAvgViews = 0;
  const channelId = snippet.channelId;
  if (channelId && views > 0) {
    try {
      const chRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${apiKey}`,
      );
      if (chRes.ok) {
        const chData = await chRes.json();
        const chStats = chData.items?.[0]?.statistics;
        if (chStats) {
          const totalViews = parseInt(chStats.viewCount || '0', 10);
          const videoCount = parseInt(chStats.videoCount || '1', 10);
          channelAvgViews = videoCount > 0 ? Math.round(totalViews / videoCount) : 0;
          if (channelAvgViews > 0 && views >= channelAvgViews * 5) {
            outlierMultiplier = Math.round(views / channelAvgViews);
          }
        }
      }
    } catch {
      // Non-critical — skip outlier detection
    }
  }

  return NextResponse.json({
    videoId,
    title: snippet.title,
    channelId: channelId || '',
    channelTitle: snippet.channelTitle || '',
    publishedAt: snippet.publishedAt,
    tags: snippet.tags || [],
    views,
    likes,
    comments,
    vph,
    engagement,
    likesRatio,
    ageDays,
    ageHours: Math.round(ageHours),
    durationSec,
    score,
    checks,
    channelAvgViews,
    outlierMultiplier,
    isPro: extUser.isPro,
  });
}
