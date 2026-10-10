import type { DeleteOwner } from './competitor-delete-client';
import type { CompetitorRecord } from './competitor-list-read';

export type CreationOutcome = { status: 'confirmed'; competitor: CompetitorRecord }
  | { status: 'rejected'; error: string; max?: number } | { status: 'unconfirmed' };
export type CreationAttempt = { owner: DeleteOwner; input: string; original: Promise<CreationOutcome>;
  waiter: Promise<CreationOutcome>; outcome?: CreationOutcome; waitOutcome?: CreationOutcome };
const attempts = new Map<string, CreationAttempt>();
const confirmed = new Map<string, CompetitorRecord[]>();
const denied = new Set<string>();
const key = (owner: DeleteOwner) => 'ytubviral:competitor-create:' + JSON.stringify([owner.userId, owner.email]);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function acknowledgement(value: unknown, owner: DeleteOwner, input: string): CompetitorRecord | null {
  if (!object(value) || value.ok !== true || value.userId !== owner.userId || !object(value.competitor)) return null;
  const row = value.competitor;
  const selectedId = input.startsWith('UC') ? input : input.match(/\/channel\/(UC[\w-]+)(?:[/?#]|$)/)?.[1];
  if (typeof row.id !== 'string' || !row.id.trim() || typeof row.channelId !== 'string' || !/^UC[\w-]{20,}$/.test(row.channelId)
    || (selectedId && selectedId !== row.channelId) || typeof row.channelName !== 'string' || !row.channelName.trim() || row.channelName.length > 1000
    || !(row.channelThumb === null || typeof row.channelThumb === 'string') || !date(row.addedAt)
    || !count(row.subscribers, 2_147_483_647) || !count(row.videoCount, 2_147_483_647) || !count(row.totalViews, Number.MAX_SAFE_INTEGER)
    || row.growth !== null || !Array.isArray(row.snapshots) || row.snapshots.length !== 1) return null;
  const snapshot = row.snapshots[0];
  if (!object(snapshot) || snapshot.subscribers !== row.subscribers || snapshot.totalViews !== row.totalViews
    || snapshot.videoCount !== row.videoCount || !date(snapshot.recordedAt)) return null;
  return structuredClone(row) as unknown as CompetitorRecord;
}

export function retainedCompetitorCreation(owner: DeleteOwner): CreationAttempt | undefined { return attempts.get(key(owner)); }
export function competitorCreationBlocked(owner: DeleteOwner): boolean {
  const storageKey = key(owner), attempt = attempts.get(storageKey);
  if (denied.has(storageKey) || attempt && attempt.outcome?.status !== 'confirmed' && attempt.outcome?.status !== 'rejected') return true;
  try { return sessionStorage.getItem(storageKey) !== null; } catch { return true; }
}
export function mergeCompetitorCreations(owner: DeleteOwner, rows: CompetitorRecord[]): CompetitorRecord[] {
  const merged = [...rows];
  for (const row of confirmed.get(key(owner)) ?? []) if (!merged.some(existing => existing.id === row.id)) merged.push(structuredClone(row));
  return merged;
}

export function beginCompetitorCreation(owner: DeleteOwner, input: string): CreationAttempt | null {
  const own = { ...owner }, selected = input.trim(), storageKey = key(own), existing = attempts.get(storageKey);
  if (existing && existing.outcome?.status !== 'confirmed' && existing.outcome?.status !== 'rejected') return existing;
  if (!own.userId || !selected || denied.has(storageKey)) return null;
  try {
    // Presence denies a replacement after module loss. Never parse this text as
    // a producer, input, response, consent, completion or recovery authority.
    if (sessionStorage.getItem(storageKey) !== null) return null;
    sessionStorage.setItem(storageKey, 'pending');
  } catch { denied.add(storageKey); return null; }
  const attempt: CreationAttempt = { owner: own, input: selected, original: Promise.resolve({ status: 'unconfirmed' }), waiter: Promise.resolve({ status: 'unconfirmed' }) };
  attempts.set(storageKey, attempt); // Synchronous exclusion includes stale event handlers.
  const deadline = performance.now() + 60_000;
  attempt.original = Promise.resolve().then(async (): Promise<CreationOutcome> => {
    let outcome: CreationOutcome = { status: 'unconfirmed' };
    try {
      const response = await fetch('/api/youtube/competitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: selected }), cache: 'no-store' });
      const data: unknown = await response.json();
      const row = response.status === 200 && response.ok ? acknowledgement(data, own, selected) : null;
      if (row) outcome = { status: 'confirmed', competitor: row };
      else if (object(data) && [[401, 'unauthorized'], [400, 'invalid_url'], [400, 'limit_reached'], [404, 'channel_not_found'], [409, 'already_tracked'], [500, 'api_key_missing']]
        .some(([status, error]) => response.status === status && data.error === error)) {
        outcome = { status: 'rejected', error: data.error as string, ...(count(data.max, 2_147_483_647) ? { max: data.max as number } : {}) };
      }
      if (outcome.status !== 'unconfirmed') {
        try { sessionStorage.removeItem(storageKey); }
        catch { if (outcome.status === 'rejected') outcome = { status: 'unconfirmed' }; }
      }
    } catch { /* Observe uncertainty without replacing or aborting the original. */ }
    if (outcome.status === 'confirmed') {
      const rows = confirmed.get(storageKey) ?? [];
      confirmed.set(storageKey, [...rows.filter(row => row.id !== outcome.competitor.id), outcome.competitor]);
    }
    attempt.outcome = outcome;
    return outcome;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  attempt.waiter = (async (): Promise<CreationOutcome> => {
    let result: CreationOutcome;
    try {
      const outcome = await Promise.race([attempt.original, new Promise<CreationOutcome>(resolve => { timer = setTimeout(() => resolve({ status: 'unconfirmed' }), Math.max(0, deadline - performance.now())); })]);
      result = performance.now() >= deadline ? { status: 'unconfirmed' } : outcome;
    } finally { clearTimeout(timer); }
    attempt.waitOutcome = result;
    return result;
  })();
  return attempt;
}
