import type { DeleteOwner } from './competitor-delete-client';

export interface CompetitorRecord {
  id: string; channelId: string; channelName: string; channelThumb: string | null;
  subscribers: number; totalViews: number; videoCount: number; addedAt: string;
  snapshots: { subscribers: number; totalViews: number; videoCount: number; recordedAt: string }[];
  growth: { subs7d: number; subs30d: number; views7d: number; views30d: number } | null;
}
type Outcome = { status: 'ready'; competitors: CompetitorRecord[] } | { status: 'error' };
type Read = { owner: DeleteOwner; pending: boolean; original: Promise<Outcome>; waiter: Promise<Outcome>; outcome?: Outcome };
const flights = new Map<string, Read>();
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
function decode(value: unknown, userId: string): CompetitorRecord[] {
  if (!object(value) || value.userId !== userId || !Array.isArray(value.competitors)) throw Error('List unavailable');
  const ids = new Set<string>();
  for (const row of value.competitors) {
    if (!object(row) || typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id)
      || typeof row.channelId !== 'string' || !row.channelId.trim() || typeof row.channelName !== 'string'
      || !(row.channelThumb === null || typeof row.channelThumb === 'string')
      || !count(row.subscribers) || !count(row.totalViews) || !count(row.videoCount) || !date(row.addedAt)
      || !Array.isArray(row.snapshots) || !row.snapshots.every(s => object(s) && count(s.subscribers) && count(s.totalViews) && count(s.videoCount) && date(s.recordedAt))
      || !(row.growth === null || object(row.growth) && ['subs7d', 'subs30d', 'views7d', 'views30d'].every(k => finite((row.growth as Record<string, unknown>)[k])))) throw Error('List unavailable');
    ids.add(row.id);
  }
  return structuredClone(value.competitors) as CompetitorRecord[];
}

// Retain only the actual pending reader. Navigation/remounts observe its same
// headers/body and30s waiter; a serialized row never reconstructs a producer.
export function beginCompetitorListRead(owner: DeleteOwner): Read {
  const own = { ...owner }, key = JSON.stringify([own.userId, own.email]);
  const existing = flights.get(key); if (existing) return existing;
  const read: Read = { owner: own, pending: true, original: Promise.resolve({ status: 'error' }), waiter: Promise.resolve({ status: 'error' }) };
  flights.set(key, read);
  const deadline = performance.now() + 30_000;
  read.original = (async (): Promise<Outcome> => {
    try {
      if (!own.userId) throw Error('List unavailable');
      const response = await fetch('/api/youtube/competitors', { cache: 'no-store' });
      const data = await response.json();
      if (response.status !== 200 || !response.ok) throw Error('List unavailable');
      return { status: 'ready', competitors: decode(data, own.userId) };
    } catch { return { status: 'error' }; }
  })().then(outcome => {
    read.pending = false; read.outcome = outcome;
    if (flights.get(key) === read) flights.delete(key);
    return outcome;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  read.waiter = (async (): Promise<Outcome> => {
    try {
      const outcome = await Promise.race([read.original, new Promise<Outcome>(resolve => { timer = setTimeout(() => resolve({ status: 'error' }), Math.max(0, deadline - performance.now())); })]);
      return performance.now() >= deadline ? { status: 'error' } : outcome;
    } finally { clearTimeout(timer); }
  })();
  return read;
}
