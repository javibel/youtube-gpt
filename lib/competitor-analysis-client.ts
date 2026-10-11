import type { DeleteOwner } from '@/lib/competitor-delete-client';

export interface AnalysisSelection { input: string; language: 'es' | 'en' }
export interface AnalysisData extends AnalysisSelection {
  userId: string;
  channel: { id: string; name: string; description: string; thumbnail: string; country: string | null; subscribers: number; totalViews: number; videoCount: number };
  topVideos: { videoId: string; title: string; thumbnail: string; publishedAt: string; views: number; likes: number }[];
  keywords: string[]; uploadFrequency: string; avgViews: number;
  collectionStatus: 'complete' | 'partial'; unavailableVideoIds: string[]; totalVideosRequested: number; totalVideosAvailable: number;
}
export type AnalysisOutcome = { status: 'ready'; data: AnalysisData } | { status: 'error'; error: string };
export interface AnalysisRead {
  owner: DeleteOwner; selection: AnalysisSelection; pending: boolean;
  original: Promise<AnalysisOutcome>; waiter: Promise<AnalysisOutcome>; outcome?: AnalysisOutcome; waitOutcome?: AnalysisOutcome;
}
const latest = new Map<string, AnalysisRead>(), live = new Map<string, AnalysisRead>();
const ownerKey = (o: DeleteOwner) => JSON.stringify([o.userId, o.email]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const videoId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const thumbnail = (v: unknown) => text(v, 2048) && (v === '' || /^https:\/\/[^\s]+$/.test(v));
function published(v: unknown, observedTime: number) {
  if (typeof v !== 'string') return false;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!m || +m[1] < 1000 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate()
    || +m[4] > 23 || +m[5] > 59 || +m[6] > 59 || (m[8] !== 'Z' && (+m[8].slice(1, 3) > 23 || +m[8].slice(4) > 59))) return false;
  const time = Date.parse(v); return Number.isFinite(time) && time <= observedTime;
}
function decode(value: unknown, owner: DeleteOwner, selected: AnalysisSelection, observedTime: number): AnalysisData {
  if (!object(value) || value.userId !== owner.userId || value.input !== selected.input || value.language !== selected.language
    || !object(value.channel) || !Array.isArray(value.topVideos) || !Array.isArray(value.keywords) || value.keywords.length > 12
    || !value.keywords.every(k => text(k, 1000) && !!k.trim()) || new Set(value.keywords).size !== value.keywords.length
    || !text(value.uploadFrequency, 1000) || !count(value.avgViews) || !count(value.totalVideosRequested) || value.totalVideosRequested > 50
    || !count(value.totalVideosAvailable) || value.totalVideosAvailable > value.totalVideosRequested
    || !Array.isArray(value.unavailableVideoIds) || !value.unavailableVideoIds.every(videoId)
    || new Set(value.unavailableVideoIds).size !== value.unavailableVideoIds.length
    || value.unavailableVideoIds.length !== value.totalVideosRequested - value.totalVideosAvailable
    || value.collectionStatus !== (value.unavailableVideoIds.length ? 'partial' : 'complete')
    || value.topVideos.length !== Math.min(10, value.totalVideosAvailable)) throw Error('Analysis unavailable');
  const c = value.channel, selectedId = selected.input.match(/^(UC[\w-]{22})$/)?.[1] ?? selected.input.match(/\/channel\/(UC[\w-]{22})(?:\/?(?:[?#]|$))/)?.[1];
  if (typeof c.id !== 'string' || !/^UC[\w-]{22}$/.test(c.id) || (selectedId && c.id !== selectedId)
    || !text(c.name, 1000) || !text(c.description, 200) || !thumbnail(c.thumbnail)
    || (c.country !== null && (typeof c.country !== 'string' || !/^[A-Z]{2}$/.test(c.country)))
    || !count(c.subscribers) || !count(c.totalViews) || !count(c.videoCount)) throw Error('Analysis unavailable');
  const seen = new Set<string>(); let prior = Infinity, sum = BigInt(0);
  for (const v of value.topVideos) {
    if (!object(v) || !videoId(v.videoId) || seen.has(v.videoId) || value.unavailableVideoIds.includes(v.videoId)
      || !text(v.title, 1000) || !thumbnail(v.thumbnail) || !published(v.publishedAt, observedTime)
      || !count(v.views) || !count(v.likes) || v.views > prior) throw Error('Analysis unavailable');
    seen.add(v.videoId); prior = v.views; sum += BigInt(v.views);
  }
  const n = value.topVideos.length, average = n ? Number((sum + BigInt(Math.floor(n / 2))) / BigInt(n)) : 0;
  if (value.avgViews !== average || (!value.totalVideosRequested && value.keywords.length)) throw Error('Analysis unavailable');
  return structuredClone(value) as unknown as AnalysisData;
}

export const retainedCompetitorAnalysis = (owner: DeleteOwner) => latest.get(ownerKey(owner));
export const pendingCompetitorAnalysis = (owner: DeleteOwner) => live.get(owner.userId);

// This read has no inference or business mutation. Retain the actual producer,
// including its late body, without serialized recovery or a second live query.
export function beginCompetitorAnalysis(owner: DeleteOwner, selection: AnalysisSelection): AnalysisRead {
  const existing = live.get(owner.userId); if (existing) return existing;
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), selected = Object.freeze({ input: selection.input.trim(), language: selection.language });
  const unavailable: AnalysisOutcome = { status: 'error', error: 'competitor_analysis_unavailable' };
  const read: AnalysisRead = { owner: own, selection: selected, pending: true, original: Promise.resolve(unavailable), waiter: Promise.resolve(unavailable) };
  live.set(own.userId, read); latest.set(ownerKey(own), read);
  const deadline = performance.now() + 30_000, observedTime = Date.now();
  read.original = Promise.resolve().then(async (): Promise<AnalysisOutcome> => {
    try {
      if (!own.userId || !selected.input || selected.input.length > 2048 || !['es', 'en'].includes(selected.language) || performance.now() >= deadline) return unavailable;
      const response = await fetch('/api/youtube/competitor', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: selected.input, lang: selected.language }) });
      const body: unknown = await response.json();
      if (response.ok && response.status === 200) return { status: 'ready', data: decode(body, own, selected, observedTime) };
      if (object(body) && [[401, 'Unauthorized'], [403, 'pro_required'], [400, 'Missing URL'], [400, 'invalid_selection'], [404, 'channel_not_found'], [503, 'no_api_key'], [503, 'competitor_analysis_unavailable']]
        .some(([status, error]) => response.status === status && body.error === error)) return { status: 'error', error: body.error as string };
    } catch { /* Never expose transport or provider diagnostics. */ }
    return unavailable;
  }).then(outcome => { read.pending = false; read.outcome = outcome; if (live.get(own.userId) === read) live.delete(own.userId); return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  read.waiter = (async () => {
    try {
      const result = await Promise.race([read.original, new Promise<AnalysisOutcome>(resolve => { timer = setTimeout(() => resolve(unavailable), Math.max(0, deadline - performance.now())); })]);
      return read.waitOutcome = performance.now() >= deadline ? unavailable : result;
    } finally { clearTimeout(timer); }
  })();
  return read;
}
