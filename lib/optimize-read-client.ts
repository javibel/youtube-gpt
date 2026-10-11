import { computeScore, validOptimizeDraft } from '@/lib/optimize-score';
import type { OptimizeScore } from '@/lib/optimize-score';
import type { ScoreOwner } from '@/lib/optimize-score-client';

export interface OptimizeVideo {
  videoId: string; title: string; description: string; tags: string[]; thumbnail: string;
  publishedAt: string; categoryId: string; views: number; likes: number; comments: number;
}
export interface OptimizeVideoItem {
  videoId: string; title: string; thumbnail: string; publishedAt: string; views: number; likes: number; score: number;
}
export interface OptimizeHistory {
  id: string; userId: string; videoId: string; field: string; oldValue: string; newValue: string;
  scoreBefore: number | null; scoreAfter: number | null; viewsBefore: number | null; viewsAfter: number | null; createdAt: string;
}
export interface OptimizeList {
  kind: 'list'; videos: OptimizeVideoItem[]; requestedVideoIds: string[]; missingVideoIds: string[]; coverage: 'complete' | 'partial';
}
export interface OptimizeDetail extends OptimizeScore { kind: 'detail'; video: OptimizeVideo; history: OptimizeHistory[] }
export type OptimizeOutcome = { status: 'ready'; data: OptimizeList | OptimizeDetail } | { status: 'error'; error: string };
export interface OptimizeRead {
  owner: ScoreOwner; videoId: string | null; pending: boolean; original: Promise<OptimizeOutcome>; waiter: Promise<OptimizeOutcome>;
  outcome?: OptimizeOutcome; waitOutcome?: OptimizeOutcome;
}
const live = new Map<string, OptimizeRead>();
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const score = (v: unknown): v is number => count(v) && v <= 100;
function date(v: unknown): v is string {
  if (!text(v, 64)) return false;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  return !!m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate()
    && +m[4] < 24 && +m[5] < 60 && +m[6] < 60 && (m[7] === 'Z' || (+m[7].slice(1, 3) < 24 && +m[7].slice(4) < 60)) && Number.isFinite(Date.parse(v));
}
function thumbnail(v: unknown): v is string {
  if (!text(v, 2048)) return false;
  if (!v) return true;
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
const unavailable = (): OptimizeOutcome => ({ status: 'error', error: 'optimize_unavailable' });
function decode(value: unknown, owner: ScoreOwner, videoId: string | null): OptimizeList | OptimizeDetail {
  if (!object(value) || value.userId !== owner.userId || value.email !== owner.email
    || !object(value.selection) || value.selection.videoId !== videoId) throw Error('Optimize unavailable');
  if (videoId === null) {
    if (!Array.isArray(value.requestedVideoIds) || value.requestedVideoIds.length > 20 || !value.requestedVideoIds.every(identifier)
      || new Set(value.requestedVideoIds).size !== value.requestedVideoIds.length || !Array.isArray(value.missingVideoIds)
      || !value.missingVideoIds.every(identifier) || new Set(value.missingVideoIds).size !== value.missingVideoIds.length
      || value.missingVideoIds.some(id => !(value.requestedVideoIds as string[]).includes(id))
      || value.coverage !== (value.missingVideoIds.length ? 'partial' : 'complete') || !Array.isArray(value.videos)
      || value.videos.length !== value.requestedVideoIds.length - value.missingVideoIds.length) throw Error('Optimize unavailable');
    const requested = value.requestedVideoIds as string[], missing = value.missingVideoIds as string[];
    const expected = requested.filter(id => !missing.includes(id));
    const videos = value.videos.map((v, i) => {
      if (!object(v) || v.videoId !== expected[i] || !text(v.title, 100) || !thumbnail(v.thumbnail) || !date(v.publishedAt)
        || !count(v.views) || !count(v.likes) || !score(v.score)) throw Error('Optimize unavailable');
      return { videoId: expected[i], title: v.title, thumbnail: v.thumbnail, publishedAt: v.publishedAt, views: v.views, likes: v.likes, score: v.score };
    });
    return { kind: 'list', videos, requestedVideoIds: [...requested], missingVideoIds: [...missing], coverage: missing.length ? 'partial' : 'complete' };
  }
  const v = value.video;
  if (!validOptimizeDraft(v) || v.videoId !== videoId || !object(v) || !thumbnail(v.thumbnail) || !date(v.publishedAt)
    || !text(v.categoryId, 128) || !count(v.views) || !count(v.likes) || !count(v.comments)
    || !Array.isArray(value.history) || value.history.length > 20) throw Error('Optimize unavailable');
  const expected = computeScore(v.title, v.description, v.tags);
  if (value.score !== expected.score || !Array.isArray(value.checks) || value.checks.length !== expected.checks.length
    || value.checks.some((c, i) => !object(c) || c.key !== expected.checks[i].key || c.ok !== expected.checks[i].ok || c.w !== expected.checks[i].w)) throw Error('Optimize unavailable');
  let prior = Infinity; const seen = new Set<string>();
  const history = value.history.map(h => {
    if (!object(h) || !identifier(h.id) || seen.has(h.id) || h.userId !== owner.userId || h.videoId !== videoId
      || !['title', 'description', 'tags'].includes(h.field as string) || !text(h.oldValue, 50_000) || !text(h.newValue, 50_000)
      || [h.scoreBefore, h.scoreAfter].some(s => s !== null && !score(s))
      || [h.viewsBefore, h.viewsAfter].some(n => n !== null && !count(n)) || !date(h.createdAt) || Date.parse(h.createdAt) > prior) throw Error('Optimize unavailable');
    seen.add(h.id); prior = Date.parse(h.createdAt);
    return { id: h.id, userId: owner.userId, videoId, field: h.field as string, oldValue: h.oldValue, newValue: h.newValue,
      scoreBefore: h.scoreBefore as number | null, scoreAfter: h.scoreAfter as number | null,
      viewsBefore: h.viewsBefore as number | null, viewsAfter: h.viewsAfter as number | null, createdAt: h.createdAt };
  });
  return { kind: 'detail', video: { videoId, title: v.title, description: v.description, tags: [...v.tags], thumbnail: v.thumbnail,
    publishedAt: v.publishedAt, categoryId: v.categoryId, views: v.views, likes: v.likes, comments: v.comments }, ...expected, history };
}

// Keep only the original live GET/body in this instance. A timer retires the
// wait, never the producer or its authority, and cannot start a replacement.
export function beginOptimizeRead(owner: ScoreOwner, videoId: string | null, afterCurrent = false): OptimizeRead {
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), key = JSON.stringify([own.userId, own.email, videoId]);
  const existing = live.get(key); if (existing && !afterCurrent) return existing;
  const read: OptimizeRead = { owner: own, videoId, pending: true, original: Promise.resolve(unavailable()), waiter: Promise.resolve(unavailable()) };
  live.set(key, read); const deadline = performance.now() + 30_000;
  read.original = Promise.resolve().then(async (): Promise<OptimizeOutcome> => {
    try {
      // A confirmed edit may invalidate a read already in flight. Queue behind
      // that same body instead of replacing it; the visible budget is shared.
      if (existing) await existing.original;
      if (!own.userId || (videoId !== null && !identifier(videoId)) || performance.now() >= deadline) return unavailable();
      const res = await fetch('/api/youtube/optimize' + (videoId === null ? '' : '?videoId=' + encodeURIComponent(videoId)), { method: 'GET', cache: 'no-store' });
      const body: unknown = await res.json();
      if (res.ok && res.status === 200) return { status: 'ready', data: decode(body, own, videoId) };
      if (object(body) && [[401, 'Unauthorized'], [403, 'pro_required'], [400, 'youtube_not_connected'], [400, 'invalid_selection'], [404, 'video_not_found'], [503, 'optimize_unavailable']]
        .some(([status, error]) => res.status === status && body.error === error)) return { status: 'error', error: body.error as string };
    } catch { /* Private provider/transport diagnostics stay private. */ }
    return unavailable();
  }).then(outcome => { read.pending = false; read.outcome = outcome; if (live.get(key) === read) live.delete(key); return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  read.waiter = (async () => {
    try {
      const outcome = await Promise.race([read.original, new Promise<OptimizeOutcome>(resolve => { timer = setTimeout(() => resolve(unavailable()), Math.max(0, deadline - performance.now())); })]);
      return read.waitOutcome = performance.now() >= deadline ? unavailable() : outcome;
    } finally { clearTimeout(timer); }
  })();
  return read;
}
