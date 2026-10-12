import { bestTimeCache } from '@/lib/best-time-cache';

export type BestTimeData = ReturnType<typeof bestTimeCache>;
export type BestTimeOwner = Readonly<{ id: string; email: string }>;
type ReadOutcome = { status: 'ready'; data: BestTimeData | null } | { status: 'error' };
export interface BestTimeRead {
  pending: boolean; superseded: boolean; waiter: Promise<ReadOutcome>;
  original: Promise<ReadOutcome>; outcome?: ReadOutcome; retire(): void;
}
type AnalysisOutcome = { status: 'posted' } | { status: 'error'; code: string; videoCount?: number };
export interface BestTimeAnalysis {
  pending: boolean; uncertain: boolean; waiter: Promise<AnalysisOutcome>; original: Promise<AnalysisOutcome>;
}
const reads = new Map<string, BestTimeRead>();
const analyses = new Map<string, BestTimeAnalysis>();
const key = (owner: BestTimeOwner) => JSON.stringify([owner.id, owner.email]);
const unavailable = (): ReadOutcome => ({ status: 'error' });
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// This is a cache response, never an acceptance receipt for a generation.
export function decodeBestTimeRead(value: unknown, owner: BestTimeOwner): BestTimeData | null {
  if (!object(value) || !object(value.owner) || value.owner.id !== owner.id || value.owner.email !== owner.email
    || !Object.hasOwn(value, 'data')) throw Error('Best time read unavailable');
  if (value.data === null) return null;
  const d = value.data;
  if (!object(d) || typeof d.analyzedAt !== 'string' || d.analyzedAt.length > 64) throw Error('Best time read unavailable');
  const date = new Date(d.analyzedAt);
  if (date.toISOString() !== d.analyzedAt) throw Error('Best time read unavailable');
  return bestTimeCache({ userId: owner.id, heatmap: d.heatmap, topSlots: d.topSlots,
    videoCount: d.videoCount as number, aiTip: d.aiTip, analyzedAt: date }, owner.id);
}

export function pendingBestTimeAnalysis(owner: BestTimeOwner) { return analyses.get(key(owner)); }

// A retry may create a read only after the previous original/body terminates.
// Strict setup, language changes and remounts attach to the same live original.
export function beginBestTimeRead(owner: BestTimeOwner, fresh = false): BestTimeRead | null {
  const own = Object.freeze({ ...owner }), k = key(own), existing = reads.get(k);
  if (analyses.get(k)?.pending) return null;
  if (existing && (existing.pending || (!fresh && !existing.superseded))) return existing;
  const read: BestTimeRead = { pending: true, superseded: false,
    original: Promise.resolve(unavailable()), waiter: Promise.resolve(unavailable()), retire() {} };
  reads.set(k, read);
  const deadline = performance.now() + 30_000;
  let timer: ReturnType<typeof setTimeout> | undefined, finish!: (v: ReadOutcome) => void;
  const stopped = new Promise<ReadOutcome>(resolve => { finish = resolve; });
  read.retire = () => { read.superseded = true; finish(unavailable()); clearTimeout(timer); };
  read.original = Promise.resolve().then(async (): Promise<ReadOutcome> => {
    try {
      if (read.superseded || performance.now() >= deadline) return unavailable();
      const response = await fetch('/api/youtube/best-time', { method: 'GET', cache: 'no-store' });
      const body: unknown = await response.json();
      if (read.superseded || performance.now() >= deadline || !response.ok || response.status !== 200) return unavailable();
      return { status: 'ready', data: decodeBestTimeRead(body, own) };
    } catch { return unavailable(); }
  }).then(outcome => { read.pending = false; read.outcome = outcome; return outcome; });
  timer = setTimeout(() => finish(unavailable()), Math.max(0, deadline - performance.now()));
  read.waiter = Promise.race([read.original, stopped]).then(outcome =>
    performance.now() >= deadline || read.superseded ? unavailable() : outcome
  ).finally(() => clearTimeout(timer));
  return read;
}

// Existing explicit POST remains separate from cached data. Its result never
// supplies a heatmap. A successful HTTP response only permits a new cache GET.
// Unconfirmed POSTs stay excluded locally; this memory is not recovery authority.
export function beginBestTimeAnalysis(owner: BestTimeOwner): BestTimeAnalysis | null {
  const own = Object.freeze({ ...owner }), k = key(own), prior = analyses.get(k);
  if (prior && (prior.pending || prior.uncertain)) return null;
  reads.get(k)?.retire();
  const ticket: BestTimeAnalysis = { pending: true, uncertain: false,
    original: Promise.resolve({ status: 'error', code: 'unconfirmed' }),
    waiter: Promise.resolve({ status: 'error', code: 'unconfirmed' }) };
  analyses.set(k, ticket);
  const deadline = performance.now() + 65_000;
  ticket.original = Promise.resolve().then(async (): Promise<AnalysisOutcome> => {
    try {
      if (performance.now() >= deadline) throw Error('Analysis HTTP unconfirmed');
      const response = await fetch('/api/youtube/best-time', { method: 'POST', cache: 'no-store' });
      const body: unknown = await response.json();
      if (performance.now() >= deadline) throw Error('Analysis HTTP unconfirmed');
      if (response.ok && response.status === 200) return { status: 'posted' };
      if (response.status === 403 && object(body) && body.error === 'pro_required')
        return { status: 'error', code: 'pro_required' };
      if (response.status === 400 && object(body)
        && ['youtube_not_connected', 'no_videos', 'not_enough_videos'].includes(body.error as string)) {
        if (body.error === 'not_enough_videos' && (typeof body.videoCount !== 'number'
          || !Number.isSafeInteger(body.videoCount) || body.videoCount < 0 || body.videoCount > 2))
          throw Error('Analysis HTTP unconfirmed');
        return { status: 'error', code: body.error as string,
          ...(body.error === 'not_enough_videos' ? { videoCount: body.videoCount as number } : {}) };
      }
    } catch { /* Keep private diagnostics out of UI. */ }
    ticket.uncertain = true;
    return { status: 'error', code: 'unconfirmed' };
  }).then(outcome => { ticket.pending = false; return outcome; });
  let timer: ReturnType<typeof setTimeout>;
  ticket.waiter = Promise.race([ticket.original, new Promise<AnalysisOutcome>(resolve => {
    timer = setTimeout(() => { ticket.uncertain = true; resolve({ status: 'error', code: 'unconfirmed' }); }, 65_000);
  })]).then(outcome => {
    if (performance.now() >= deadline) { ticket.uncertain = true; return { status: 'error', code: 'unconfirmed' } as AnalysisOutcome; }
    return outcome;
  }).finally(() => clearTimeout(timer));
  return ticket;
}
