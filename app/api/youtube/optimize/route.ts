import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { computeScore, validOptimizeDraft } from '@/lib/optimize-score';
import { beginOptimizeUpdate } from '@/lib/optimize-update';


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

// ── PUT: finite HTTP wait; original publication retains its own history ──

export const maxDuration = 60;

type UpdateInput = { videoId: string; title: string; description: string; tags: string[]; categoryId: string;
  original: { title: string; description: string; tags: string[] } };
type UpdateResult = { status: number; body: Record<string, unknown> };
type OwnedUpdate = { owner: { userId: string; email: string | null }; input: UpdateInput; key: string; admitted: boolean; pending: boolean; complete: boolean;
  publication: 'not-started' | 'unconfirmed' | 'confirmed'; history: 'not-started' | 'unconfirmed' | 'complete' | 'unchanged';
  original: Promise<UpdateResult>; result?: UpdateResult };
// These references are only the real producer in this instance. They provide
// no cross-instance recovery, cancellation or replacement. Durable rows only
// deny other writers; they cannot recreate these original references/receipts.
const ownedUpdates = new Map<string, Map<string, OwnedUpdate>>();
const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);
function sameUpdate(a: UpdateInput, b: UpdateInput) {
  return a.videoId === b.videoId && a.title === b.title && a.description === b.description && a.categoryId === b.categoryId
    && sameTags(a.tags, b.tags) && a.original.title === b.original.title && a.original.description === b.original.description && sameTags(a.original.tags, b.original.tags);
}
function updateInput(v: unknown): UpdateInput | null {
  if (!object(v) || !validOptimizeDraft(v) || !v.title.trim() || !object(v.original)
    || !validOptimizeDraft({ ...v.original, videoId: v.videoId })
    || (v.categoryId !== undefined && v.categoryId !== null && v.categoryId !== '' && (typeof v.categoryId !== 'string' || !/^\d{1,3}$/.test(v.categoryId)))) return null;
  const original = v.original as UpdateInput['original'];
  return { videoId: v.videoId, title: v.title, description: v.description, tags: [...v.tags], categoryId: (v.categoryId as string) || '22',
    original: { title: original.title, description: original.description, tags: [...original.tags] } };
}
function unconfirmedUpdate(record?: OwnedUpdate): UpdateResult {
  return { status: 503, body: { error: 'optimize_update_unconfirmed', publicationStatus: record?.publication ?? 'not-started', historyStatus: record?.history ?? 'not-started' } };
}

export async function PUT(request: Request) {
  const deadline = performance.now() + 55_000;
  const key = request.headers.get('Idempotency-Key');
  let retired = false, record: OwnedUpdate | undefined, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Update unconfirmed')); } };
  const timer = setTimeout(retire, 55_000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Update unconfirmed'); };
  const reply = (r: UpdateResult) => NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async (): Promise<UpdateResult> => {
      check(); const session = await auth(); check();
      if (!session?.user?.id) return { status: 401, body: { error: 'Unauthorized' } };
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email ?? null });
      let body: unknown;
      try { body = await request.json(); } catch { check(); return { status: 400, body: { error: 'invalid_input' } }; }
      check(); const input = updateInput(body);
      if (!input || !identifier(key)) return { status: 400, body: { error: 'invalid_input' } };
      // Snapshot validated arrays before delayed plan/token/provider operations.
      Object.freeze(input.tags); Object.freeze(input.original.tags); Object.freeze(input.original); Object.freeze(input);
      const plan = await getUserPlan(owner.userId); check();
      if (!isPaid(plan)) return { status: 403, body: { error: 'pro_required' } };
      let byVideo = ownedUpdates.get(owner.userId);
      if (!byVideo) { byVideo = new Map(); ownedUpdates.set(owner.userId, byVideo); }
      const previous = byVideo.get(input.videoId);
      if (previous) {
        record = previous;
        // A live/uncertain original blocks every substitute, including a second
        // OAuth attempt. Only its actual successful receipt can be replayed.
        if (previous.pending || !previous.complete) return unconfirmedUpdate(previous);
        if (previous.key === key && previous.owner.email === owner.email && sameUpdate(previous.input, input)) return previous.result!;
      }
      check();
      const current: OwnedUpdate = { owner, input, key, admitted: false, pending: true, complete: false, publication: 'not-started', history: 'not-started',
        original: Promise.resolve(unconfirmedUpdate()) };
      record = current; byVideo.set(input.videoId, current);
      const persistOriginal = async (): Promise<UpdateResult> => {
        try {
          check(); const admission = await beginOptimizeUpdate(owner.userId, input.videoId, key, check);
          if (!admission.ok) return admission.error === 'youtube_not_connected' ? { status: 400, body: { error: 'youtube_not_connected' } } : unconfirmedUpdate(current);
          current.admitted = true;
          check(); const accessToken = await getAccessToken(owner.userId, check); check();
          if (!accessToken) return unconfirmedUpdate(current);
          const before = computeScore(input.original.title, input.original.description, input.original.tags);
          const after = computeScore(input.title, input.description, input.tags);
          check(); current.publication = 'unconfirmed';
          const update = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', { method: 'PUT', cache: 'no-store',
            headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: input.videoId, snippet: { title: input.title, description: input.description, tags: input.tags, categoryId: input.categoryId } }) });
          // Once invoked, this same writer/body and mandatory history continue
          // together after HTTP retirement. Never replace or cancel the writer.
          const ack: unknown = await update.json();
          if (!update.ok || update.status !== 200 || !object(ack) || ack.id !== input.videoId || !object(ack.snippet)
            || ack.snippet.title !== input.title || ack.snippet.description !== input.description || ack.snippet.categoryId !== input.categoryId
            || !Array.isArray(ack.snippet.tags) || !sameTags(ack.snippet.tags as string[], input.tags)) return unconfirmedUpdate(current);
          current.publication = 'confirmed';
          let views: number | null = null;
          try {
            const stats = await fetch('https://www.googleapis.com/youtube/v3/videos?part=statistics&id=' + encodeURIComponent(input.videoId),
              { cache: 'no-store', headers: { Authorization: 'Bearer ' + accessToken } });
            const data: unknown = await stats.json();
            if (stats.ok && stats.status === 200 && object(data) && Array.isArray(data.items) && data.items.length === 1
              && object(data.items[0]) && data.items[0].id === input.videoId && object(data.items[0].statistics)
              && data.items[0].statistics.viewCount !== undefined) { const value = googleCount(data.items[0].statistics.viewCount); if (value <= 2_147_483_647) views = value; }
          } catch { /* Unknown impact metrics stay null; never fabricate zero. */ }
          const entries: { field: string; oldValue: string; newValue: string }[] = [];
          if (input.original.title !== input.title) entries.push({ field: 'title', oldValue: input.original.title, newValue: input.title });
          if (input.original.description !== input.description) entries.push({ field: 'description', oldValue: input.original.description, newValue: input.description });
          if (!sameTags(input.original.tags, input.tags)) entries.push({ field: 'tags', oldValue: input.original.tags.join(', '), newValue: input.tags.join(', ') });
          current.history = 'unconfirmed';
          await admission.complete(entries.map(e => ({ ...e, scoreBefore: before.score, scoreAfter: after.score, viewsBefore: views })));
          current.history = entries.length ? 'complete' : 'unchanged';
          let aiSuggestion: { es: string; en: string } | null = null;
          try {
            check();
            const task = await getMessagesTask({ userId: owner.userId, taskType: 'youtube.optimization-tip', language: 'es', instructionsVersion: 'optimization-tip-v1',
              outputSchema: { type: 'object', additionalProperties: false, required: ['es', 'en'], properties: { es: { type: 'string', minLength: 1, maxLength: 1000 }, en: { type: 'string', minLength: 1, maxLength: 1000 } } } });
            check();
            const msg = await task.create({ max_tokens: 200, messages: [{ role: 'user', content: 'I just optimized a YouTube video. Score went from ' + before.score + ' to ' + after.score
              + '.\nTitle: ' + JSON.stringify(input.title) + '\nTags: ' + input.tags.slice(0, 10).join(', ') + '\nDescription first 200 chars: ' + JSON.stringify(input.description.slice(0, 200))
              + '\nGive ONE next step to improve further. Be specific and actionable. Reply in JSON: {"es":"consejo en español","en":"tip in english"}' }] });
            check();
            const parsed: unknown = JSON.parse((msg.content[0] as { type: string; text: string }).text);
            if (object(parsed) && typeof parsed.es === 'string' && parsed.es.trim() && parsed.es.length <= 1000
              && typeof parsed.en === 'string' && parsed.en.trim() && parsed.en.length <= 1000) aiSuggestion = { es: parsed.es, en: parsed.en };
          } catch { /* Optional advice cannot undo the original publication/history. */ }
          return { status: 200, body: { success: true, userId: owner.userId, email: owner.email, operationKey: key, selection: { videoId: input.videoId },
            draft: input, publicationStatus: 'confirmed', historyStatus: current.history, metricsStatus: views === null ? 'unavailable' : 'observed',
            scoreAfter: after.score, scoreBefore: before.score, checks: after.checks, aiSuggestion } };
        } catch { return unconfirmedUpdate(current); }
      };
      current.original = Promise.resolve().then(persistOriginal).then(result => {
        current.pending = false; current.result = result; current.complete = result.status === 200 && result.body.success === true;
        if (!current.admitted && byVideo!.get(input.videoId) === current) byVideo!.delete(input.videoId);
        return result;
      });
      return current.original;
    });
    const result = await Promise.race([original, stopped]); check(); const response = reply(result); check(); return response;
  } catch { return reply(unconfirmedUpdate(record)); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
