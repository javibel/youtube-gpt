import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import { parseClaudeJson } from '@/lib/parse-claude-json';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ── Scoring helpers (shared with seo-score but lightweight inline for optimize) ──

function scoreTitleChecks(title: string) {
  const len = title.length;
  const checks = [
    { key: 'title_length', ok: len >= 30 && len <= 70, w: 8 },
    { key: 'title_number', ok: /\d/.test(title), w: 5 },
    { key: 'title_caps', ok: title !== title.toUpperCase(), w: 4 },
    { key: 'title_emoji', ok: /[\p{Emoji_Presentation}]/u.test(title), w: 3 },
    { key: 'title_power', ok: /\b(cómo|how|best|mejor|secret|secreto|ultimate|top|hack|error|mistake)\b/i.test(title), w: 4 },
  ];
  return checks;
}

function scoreDescChecks(desc: string) {
  const wordCount = desc.split(/\s+/).filter(Boolean).length;
  const checks = [
    { key: 'desc_length', ok: wordCount >= 100, w: 10 },
    { key: 'desc_links', ok: /https?:\/\//.test(desc), w: 5 },
    { key: 'desc_timestamps', ok: /\d{1,2}:\d{2}/.test(desc), w: 7 },
    { key: 'desc_hashtags', ok: /#\w+/.test(desc), w: 4 },
    { key: 'desc_cta', ok: /suscri|subscribe|like|comenta|comment/i.test(desc), w: 3 },
  ];
  return checks;
}

function scoreTagChecks(tags: string[]) {
  const count = tags.length;
  const checks = [
    { key: 'tags_count', ok: count >= 5 && count <= 20, w: 8 },
    { key: 'tags_long', ok: tags.some(t => t.split(/\s+/).length >= 3), w: 4 },
    { key: 'tags_short', ok: tags.some(t => t.split(/\s+/).length === 1), w: 3 },
  ];
  return checks;
}

function computeScore(title: string, description: string, tags: string[]): { score: number; checks: { key: string; ok: boolean; w: number }[] } {
  const allChecks = [
    ...scoreTitleChecks(title),
    ...scoreDescChecks(description),
    ...scoreTagChecks(tags),
  ];
  const maxW = allChecks.reduce((s, c) => s + c.w, 0);
  const rawW = allChecks.filter(c => c.ok).reduce((s, c) => s + c.w, 0);
  return { score: Math.round((rawW / maxW) * 100), checks: allChecks };
}

// ── GET: load video data + optimize history ─────────────────────────────

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const accessToken = await getAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId');

  try {
    // If specific videoId requested, return full details for editing
    if (videoId) {
      const vRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${videoId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const vData = await vRes.json();
      if (!vRes.ok || !vData.items?.length) {
        return NextResponse.json({ error: 'video_not_found' }, { status: 404 });
      }

      const video = vData.items[0];
      const snippet = video.snippet;
      const stats = video.statistics;

      const { score, checks } = computeScore(
        snippet.title || '',
        snippet.description || '',
        snippet.tags || [],
      );

      // Load optimize history for this video
      const history = await prisma.optimizeHistory.findMany({
        where: { userId: session.user.id, videoId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return NextResponse.json({
        video: {
          videoId: video.id,
          title: snippet.title || '',
          description: snippet.description || '',
          tags: snippet.tags || [],
          thumbnail: snippet.thumbnails?.medium?.url || '',
          publishedAt: snippet.publishedAt || '',
          categoryId: snippet.categoryId || '',
          views: parseInt(stats.viewCount || '0', 10),
          likes: parseInt(stats.likeCount || '0', 10),
          comments: parseInt(stats.commentCount || '0', 10),
        },
        score,
        checks,
        history,
      });
    }

    // No videoId: return user's videos list for selection
    const searchRes = await fetch(
      'https://www.googleapis.com/youtube/v3/search?part=id,snippet&forMine=true&type=video&order=date&maxResults=20',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();
    if (!searchRes.ok) {
      return NextResponse.json({ error: searchData.error?.message || 'YouTube API error' }, { status: 500 });
    }

    const ids = (searchData.items || []).map((i: { id: { videoId: string } }) => i.id.videoId);
    if (!ids.length) {
      return NextResponse.json({ videos: [] });
    }

    // Fetch stats for all videos
    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const statsData = await statsRes.json();

    const videos = (statsData.items || []).map((v: {
      id: string;
      snippet: { title: string; thumbnails?: { medium?: { url: string } }; publishedAt: string; tags?: string[]; description: string };
      statistics: { viewCount?: string; likeCount?: string };
    }) => {
      const { score } = computeScore(v.snippet.title, v.snippet.description, v.snippet.tags || []);
      return {
        videoId: v.id,
        title: v.snippet.title,
        thumbnail: v.snippet.thumbnails?.medium?.url || '',
        publishedAt: v.snippet.publishedAt,
        views: parseInt(v.statistics.viewCount || '0', 10),
        likes: parseInt(v.statistics.likeCount || '0', 10),
        score,
      };
    });

    return NextResponse.json({ videos });
  } catch (err) {
    console.error('[youtube/optimize] GET error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── POST: real-time score calculation (no YouTube API call) ─────────────

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title = (body.title as string) || '';
  const description = (body.description as string) || '';
  const tags = (body.tags as string[]) || [];

  const { score, checks } = computeScore(title, description, tags);
  return NextResponse.json({ score, checks });
}

// ── PUT: save changes to YouTube + record history ──────────────────────

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const accessToken = await getAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { videoId, title, description, tags, categoryId, original } = body as {
    videoId: string;
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
    original: { title: string; description: string; tags: string[] };
  };

  if (!videoId || !title) {
    return NextResponse.json({ error: 'Missing videoId or title' }, { status: 400 });
  }

  try {
    // Calculate scores before and after
    const { score: scoreBefore } = computeScore(original.title, original.description, original.tags);
    const { score: scoreAfter, checks } = computeScore(title, description, tags);

    // Update video on YouTube via Data API v3
    const updateRes = await fetch(
      'https://www.googleapis.com/youtube/v3/videos?part=snippet',
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: videoId,
          snippet: {
            title,
            description,
            tags,
            categoryId: categoryId || '22', // 22 = People & Blogs (default)
          },
        }),
      }
    );

    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      console.error('[youtube/optimize] PUT YouTube error', updateData);
      return NextResponse.json({
        error: updateData.error?.message || 'YouTube API error',
        detail: updateData.error?.errors?.[0]?.reason,
      }, { status: 500 });
    }

    // Get current views for impact tracking
    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const statsData = await statsRes.json();
    const currentViews = parseInt(statsData.items?.[0]?.statistics?.viewCount || '0', 10);

    // Record history for each changed field
    const historyEntries: { field: string; oldValue: string; newValue: string }[] = [];

    if (original.title !== title) {
      historyEntries.push({ field: 'title', oldValue: original.title, newValue: title });
    }
    if (original.description !== description) {
      historyEntries.push({ field: 'description', oldValue: original.description, newValue: description });
    }
    const oldTagStr = (original.tags || []).join(', ');
    const newTagStr = (tags || []).join(', ');
    if (oldTagStr !== newTagStr) {
      historyEntries.push({ field: 'tags', oldValue: oldTagStr, newValue: newTagStr });
    }

    if (historyEntries.length > 0) {
      await prisma.optimizeHistory.createMany({
        data: historyEntries.map(e => ({
          userId: session.user!.id!,
          videoId,
          field: e.field,
          oldValue: e.oldValue,
          newValue: e.newValue,
          scoreBefore,
          scoreAfter,
          viewsBefore: currentViews,
        })),
      });
    }

    // Generate AI suggestion for further improvement
    let aiSuggestion: { es: string; en: string } | null = null;
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `I just optimized a YouTube video. Score went from ${scoreBefore} to ${scoreAfter}.
Title: "${title}"
Tags: ${tags.slice(0, 10).join(', ')}
Description first 200 chars: "${description.slice(0, 200)}"

Give ONE next step to improve further. Be specific and actionable. Reply in JSON: {"es":"consejo en español","en":"tip in english"}`,
        }],
      });
      const text = (msg.content[0] as { type: string; text: string }).text;
      const parsed = parseClaudeJson(text);
      if (parsed.es && parsed.en) aiSuggestion = parsed;
    } catch {
      // AI suggestion is optional
    }

    return NextResponse.json({
      success: true,
      scoreAfter,
      scoreBefore,
      checks,
      aiSuggestion,
    });
  } catch (err) {
    console.error('[youtube/optimize] PUT error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
