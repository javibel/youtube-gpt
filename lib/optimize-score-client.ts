import { computeScore, validOptimizeDraft } from '@/lib/optimize-score';
import type { OptimizeDraft, OptimizeScore } from '@/lib/optimize-score';

export interface ScoreOwner { userId: string; email: string | null }
export type ScoreOutcome = { status: 'ready'; data: OptimizeScore } | { status: 'error' };
export interface ScoreRead {
  pending: boolean; original: Promise<ScoreOutcome>; waiter: Promise<ScoreOutcome>;
  outcome?: ScoreOutcome; waitOutcome?: ScoreOutcome;
}
const flights = new Map<string, ScoreRead>();
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function decode(value: unknown, owner: ScoreOwner, draft: OptimizeDraft): OptimizeScore {
  if (!object(value) || value.userId !== owner.userId || value.email !== owner.email || !validOptimizeDraft(value.draft)
    || value.draft.videoId !== draft.videoId || value.draft.title !== draft.title || value.draft.description !== draft.description
    || value.draft.tags.length !== draft.tags.length || value.draft.tags.some((t, i) => t !== draft.tags[i])) throw Error('Score unavailable');
  const expected = computeScore(draft.title, draft.description, draft.tags);
  if (value.score !== expected.score || !Array.isArray(value.checks) || value.checks.length !== expected.checks.length) throw Error('Score unavailable');
  for (let i = 0; i < expected.checks.length; i++) {
    const c = value.checks[i], e = expected.checks[i];
    if (!object(c) || c.key !== e.key || c.ok !== e.ok || c.w !== e.w) throw Error('Score unavailable');
  }
  return expected;
}

// Retain only the real live POST and body reader. No serialized recovery authority.
export function beginScoreRead(owner: ScoreOwner, draft: OptimizeDraft): ScoreRead {
  const own = { userId: owner.userId, email: owner.email }, selected = { ...draft, tags: [...draft.tags] };
  const key = JSON.stringify([own.userId, own.email, selected.videoId, selected.title, selected.description, selected.tags]);
  const existing = flights.get(key); if (existing) return existing;
  const read: ScoreRead = { pending: true, original: Promise.resolve({ status: 'error' }), waiter: Promise.resolve({ status: 'error' }) };
  flights.set(key, read); const deadline = performance.now() + 30_000;
  read.original = (async (): Promise<ScoreOutcome> => {
    try {
      if (!own.userId || !validOptimizeDraft(selected)) throw Error('Score unavailable');
      const res = await fetch('/api/youtube/optimize', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selected) });
      if (!res.ok || res.status !== 200) throw Error('Score unavailable');
      return { status: 'ready', data: decode(await res.json(), own, selected) };
    } catch { return { status: 'error' }; }
  })().then(outcome => {
    read.pending = false; read.outcome = outcome;
    if (flights.get(key) === read) flights.delete(key);
    return outcome;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  read.waiter = (async (): Promise<ScoreOutcome> => {
    try {
      const outcome = await Promise.race([read.original, new Promise<ScoreOutcome>(resolve => { timer = setTimeout(() => resolve({ status: 'error' }), Math.max(0, deadline - performance.now())); })]);
      return read.waitOutcome = performance.now() >= deadline ? { status: 'error' } : outcome;
    } finally { clearTimeout(timer); }
  })();
  return read;
}
