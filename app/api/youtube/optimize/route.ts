import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { computeScore, validOptimizeDraft } from '@/lib/optimize-score';


// ── GET: load video data + optimize history ─────────────────────────────

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const safeCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function googleCount(v: unknown): number {
  if (v === undefined) return 0;
  if (typeof v !== 'string' || !/^\d+$/.test(v) || !safeCount(Number(v))) throw Error('Optimize unavailable');
  return Number(v);
}
function videoData(value: unknown) {
  if (!object(value) || !identifier(value.id) || !object(value.snippet) || !object(value.statistics)) throw Error('Optimize unavailable');
  const s = value.snippet, stats = value.statistics;
  const draft = { videoId: value.id, title: s.title, description: s.description === undefined ? '' : s.description, tags: s.tags === undefined ? [] : s.tags };
  if (!validOptimizeDraft(draft) || typeof s.publishedAt !== 'string' || !Number.isFinite(Date.parse(s.publishedAt))
    || (s.categoryId !== undefined && (typeof s.categoryId !== 'string' || s.categoryId.length > 128))) throw Error('Optimize unavailable');
  const thumbnail = object(s.thumbnails) && object(s.thumbnails.medium) ? s.thumbnails.medium.url : '';
  if (typeof thumbnail !== 'string' || thumbnail.length > 2048) throw Error('Optimize unavailable');
  if (thumbnail) { const u = new URL(thumbnail); if (u.protocol !== 'https:' || u.username || u.password) throw Error('Optimize unavailable'); }
  return { ...draft, thumbnail, publishedAt: s.publishedAt, categoryId: (s.categoryId as string) ?? '',
    views: googleCount(stats.viewCount), likes: googleCount(stats.likeCount), comments: googleCount(stats.commentCount) };
}

export async function GET(request: Request) {
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Optimize unavailable')); } };
  const timer = setTimeout(retire, 25_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Optimize unavailable'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    // Capture the URL selection before authentication, plan, token or transport.
    const params = new URL(request.url).searchParams, videoId = params.get('videoId');
    const selectionValid = params.getAll('videoId').length <= 1 && (videoId === null || identifier(videoId));
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id) return reply({ error: 'Unauthorized' }, 401);
      const userId = session.user.id, email = session.user.email ?? null;
      const plan = await getUserPlan(userId); check();
      if (!isPaid(plan)) return reply({ error: 'pro_required' }, 403);
      if (!selectionValid) return reply({ error: 'invalid_selection' }, 400);
      const accessToken = await getAccessToken(userId, check); check();
      if (!accessToken) return reply({ error: 'youtube_not_connected' }, 400);
      const envelope = { userId, email, selection: { videoId } };
      const google = async (path: string, limit: number) => {
        check(); const res = await fetch('https://www.googleapis.com/youtube/v3/' + path,
          { cache: 'no-store', headers: { Authorization: 'Bearer ' + accessToken } }); check();
        if (!res.ok || res.status !== 200) throw Error('Optimize unavailable');
        const data: unknown = await res.json(); check();
        if (!object(data) || !Array.isArray(data.items) || data.items.length > limit) throw Error('Optimize unavailable');
        return data.items as unknown[];
      };
      if (videoId !== null) {
        const items = await google('videos?part=snippet,statistics,status&id=' + encodeURIComponent(videoId), 1);
        if (!items.length) return reply({ error: 'video_not_found' }, 404);
        const video = videoData(items[0]); if (video.videoId !== videoId) throw Error('Optimize unavailable');
        const result = computeScore(video.title, video.description, video.tags);
        check(); const rows = await prisma.optimizeHistory.findMany({
          where: { userId, videoId }, orderBy: { createdAt: 'desc' }, take: 20,
          select: { id: true, userId: true, videoId: true, field: true, oldValue: true, newValue: true, scoreBefore: true, scoreAfter: true, viewsBefore: true, viewsAfter: true, createdAt: true },
        }); check();
        if (!Array.isArray(rows) || rows.length > 20) throw Error('Optimize unavailable');
        const seen = new Set<string>(); let prior = Infinity;
        const history = rows.map(row => {
          const createdAt = row.createdAt.toISOString(), timestamp = Date.parse(createdAt);
          if (!identifier(row.id) || seen.has(row.id) || row.userId !== userId || row.videoId !== videoId
            || !['title', 'description', 'tags'].includes(row.field)
            || typeof row.oldValue !== 'string' || row.oldValue.length > 50_000 || typeof row.newValue !== 'string' || row.newValue.length > 50_000
            || [row.scoreBefore, row.scoreAfter].some(v => v !== null && (!safeCount(v) || v > 100))
            || [row.viewsBefore, row.viewsAfter].some(v => v !== null && !safeCount(v))
            || !Number.isFinite(timestamp) || timestamp > prior) throw Error('Optimize unavailable');
          seen.add(row.id); prior = timestamp;
          return { id: row.id, userId, videoId, field: row.field, oldValue: row.oldValue, newValue: row.newValue,
            scoreBefore: row.scoreBefore, scoreAfter: row.scoreAfter, viewsBefore: row.viewsBefore, viewsAfter: row.viewsAfter, createdAt };
        });
        check(); return reply({ ...envelope, video, ...result, history });
      }
      const items = await google('search?part=id,snippet&forMine=true&type=video&order=date&maxResults=20', 20);
      const ids = new Set<string>();
      for (const item of items) {
        if (!object(item) || !object(item.id) || !identifier(item.id.videoId)) throw Error('Optimize unavailable');
        ids.add(item.id.videoId);
      }
      const requestedVideoIds = [...ids], found = new Map<string, ReturnType<typeof videoData>>();
      if (ids.size) for (const item of await google('videos?part=snippet,statistics&id=' + encodeURIComponent(requestedVideoIds.join(',')), 20)) {
        const video = videoData(item);
        if (!ids.has(video.videoId) || found.has(video.videoId)) throw Error('Optimize unavailable');
        found.set(video.videoId, video);
      }
      const missingVideoIds = requestedVideoIds.filter(id => !found.has(id));
      const videos = requestedVideoIds.filter(id => found.has(id)).map(id => {
        const v = found.get(id)!;
        return { videoId: v.videoId, title: v.title, thumbnail: v.thumbnail, publishedAt: v.publishedAt, views: v.views, likes: v.likes,
          score: computeScore(v.title, v.description, v.tags).score };
      });
      check(); return reply({ ...envelope, requestedVideoIds, missingVideoIds, coverage: missingVideoIds.length ? 'partial' : 'complete', videos });
    });
    const result = await Promise.race([original, stopped]); check(); return result;
  } catch { return reply({ error: 'optimize_unavailable' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
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
