import type { DeleteOwner } from './competitor-delete-client';

export interface OutlierVideo {
  videoId: string; title: string; thumbnail: string; publishedAt: string;
  views: number; likes: number; multiplier: number; type: 'viral' | 'evergreen';
}
export interface OutlierSelection { channelId: string; period: 'all' | '7d' | '30d' | '90d'; threshold: number }
export interface OutlierData extends OutlierSelection {
  userId: string; medianViews: number; totalVideosAnalyzed: number; outliers: OutlierVideo[];
}
export type OutlierOutcome = { status: 'ready'; data: OutlierData } | { status: 'error' };
export interface OutlierRead {
  owner: DeleteOwner; selection: OutlierSelection; pending: boolean;
  original: Promise<OutlierOutcome>; waiter: Promise<OutlierOutcome>;
  outcome?: OutlierOutcome; waitOutcome?: OutlierOutcome;
}
const flights = new Map<string, OutlierRead>();
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
function decode(value: unknown, owner: DeleteOwner, selection: OutlierSelection): OutlierData {
  if (!object(value) || value.userId !== owner.userId || value.channelId !== selection.channelId
    || value.period !== selection.period || value.threshold !== selection.threshold
    || !count(value.medianViews) || !count(value.totalVideosAnalyzed) || value.totalVideosAnalyzed > 100
    || !Array.isArray(value.outliers) || value.outliers.length > value.totalVideosAnalyzed
    || (value.totalVideosAnalyzed < 3 && value.medianViews !== 0)
    || (value.medianViews === 0 && value.outliers.length !== 0)) throw Error('Outliers unavailable');
  const seen = new Set<string>(); let prior = Infinity;
  for (const v of value.outliers) {
    if (!object(v) || !id(v.videoId) || seen.has(v.videoId) || typeof v.title !== 'string' || typeof v.thumbnail !== 'string'
      || typeof v.publishedAt !== 'string' || !Number.isFinite(Date.parse(v.publishedAt)) || !count(v.views) || !count(v.likes)
      || typeof v.multiplier !== 'number' || !Number.isFinite(v.multiplier) || v.multiplier <= 0 || v.multiplier > prior
      || v.multiplier !== Math.round(v.views / value.medianViews * 10) / 10 || v.views < selection.threshold * value.medianViews
      || !['viral', 'evergreen'].includes(v.type as string)) throw Error('Outliers unavailable');
    seen.add(v.videoId); prior = v.multiplier;
  }
  return structuredClone(value) as unknown as OutlierData;
}

// Only the actual live reader is retained. A remount shares its original body
// and deadline; terminal navigation makes a fresh read, without serialized authority.
export function beginOutlierRead(owner: DeleteOwner, selection: OutlierSelection): OutlierRead {
  const own = Object.freeze({ userId: owner.userId, email: owner.email });
  const selected = Object.freeze({ channelId: selection.channelId, period: selection.period, threshold: selection.threshold });
  const key = JSON.stringify([own.userId, own.email, selected.channelId, selected.period, selected.threshold]);
  const existing = flights.get(key); if (existing) return existing;
  const read: OutlierRead = { owner: own, selection: selected, pending: true, original: Promise.resolve({ status: 'error' }), waiter: Promise.resolve({ status: 'error' }) };
  flights.set(key, read); const deadline = performance.now() + 30_000;
  read.original = (async (): Promise<OutlierOutcome> => {
    try {
      if (!own.userId || !id(selected.channelId) || !['all', '7d', '30d', '90d'].includes(selected.period)
        || !Number.isFinite(selected.threshold) || selected.threshold <= 0) throw Error('Outliers unavailable');
      const response = await fetch(`/api/youtube/outliers?channelId=${encodeURIComponent(selected.channelId)}&period=${selected.period}&threshold=${selected.threshold}`, { cache: 'no-store' });
      if (!response.ok || response.status !== 200) throw Error('Outliers unavailable');
      return { status: 'ready', data: decode(await response.json(), own, selected) };
    } catch { return { status: 'error' }; }
  })().then(outcome => {
    read.pending = false; read.outcome = outcome;
    if (flights.get(key) === read) flights.delete(key);
    return outcome;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  read.waiter = (async (): Promise<OutlierOutcome> => {
    try {
      const result = await Promise.race([read.original, new Promise<OutlierOutcome>(resolve => { timer = setTimeout(() => resolve({ status: 'error' }), Math.max(0, deadline - performance.now())); })]);
      return read.waitOutcome = performance.now() >= deadline ? { status: 'error' } : result;
    } finally { clearTimeout(timer); }
  })();
  return read;
}
