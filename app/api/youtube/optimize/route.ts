import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { computeScore, validOptimizeDraft } from '@/lib/optimize-score';


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
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Score unavailable')); } };
  const timer = setTimeout(retire, 25_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Score unavailable'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id) return reply({ error: 'Unauthorized' }, 401);
      const userId = session.user.id, email = session.user.email ?? null;
      const body: unknown = await request.json().catch(() => null); check();
      if (!validOptimizeDraft(body)) return reply({ error: 'invalid_input' }, 400);
      const draft = { videoId: body.videoId, title: body.title, description: body.description, tags: [...body.tags] };
      const result = computeScore(draft.title, draft.description, draft.tags);
      check(); return reply({ userId, email, draft, ...result });
    });
    const result = await Promise.race([original, stopped]); check(); return result;
  } catch { return reply({ error: 'score_unavailable' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
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
  if (!body || typeof body !== 'object' || Array.isArray(body) || ['videoId', 'title', 'description'].some(key => typeof body[key] !== 'string')
    || !Array.isArray(body.tags) || body.tags.some((tag: unknown) => typeof tag !== 'string')
    || (body.categoryId != null && typeof body.categoryId !== 'string')
    || !body.original || typeof body.original.title !== 'string' || typeof body.original.description !== 'string'
    || !Array.isArray(body.original.tags) || body.original.tags.some((tag: unknown) => typeof tag !== 'string')) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
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
      const task = await getMessagesTask({ userId: session.user.id, taskType: 'youtube.optimization-tip', language: 'es', instructionsVersion: 'optimization-tip-v1',
        outputSchema: { type: 'object', additionalProperties: false, required: ['es', 'en'], properties: { es: { type: 'string', minLength: 1 }, en: { type: 'string', minLength: 1 } } },
      });
      const msg = await task.create({
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
      const parsed = JSON.parse(text) as { es: string; en: string };
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
