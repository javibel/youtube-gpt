export type DeleteOwner = { userId: string; email: string };
export type DeleteOutcome = { status: 'confirmed' | 'rejected' | 'unconfirmed'; error?: string };
export type DeleteAttempt<T extends { id: string }> = { owner: DeleteOwner; row: T; original: Promise<DeleteOutcome>; waiter: Promise<DeleteOutcome>; outcome?: DeleteOutcome; waitOutcome?: DeleteOutcome };
const attempts = new Map<string, DeleteAttempt<{ id: string }>>();
const denied = new Set<string>();
const key = (owner: DeleteOwner, id: string) => 'ytubviral:competitor-delete:' + JSON.stringify([owner.userId, owner.email, id]);

export function competitorDeletionBlocked(owner: DeleteOwner, id: string): boolean {
  if (attempts.has(key(owner, id)) || denied.has(key(owner, id))) return true;
  try { return sessionStorage.getItem(key(owner, id)) !== null; } catch { return true; }
}
export function retainedCompetitorDeletions<T extends { id: string }>(owner: DeleteOwner): DeleteAttempt<T>[] {
  return [...attempts.values()].filter(a => a.owner.userId === owner.userId && a.owner.email === owner.email) as DeleteAttempt<T>[];
}
export function mergeCompetitorDeletions<T extends { id: string }>(owner: DeleteOwner, rows: T[]): T[] {
  const retained = retainedCompetitorDeletions<T>(owner);
  const confirmed = new Set(retained.filter(a => a.outcome?.status === 'confirmed').map(a => a.row.id));
  const merged = rows.filter(row => !confirmed.has(row.id));
  for (const a of retained) if (a.outcome?.status !== 'confirmed' && !merged.some(row => row.id === a.row.id)) merged.push(a.row);
  return merged;
}
export function beginCompetitorDeletion<T extends { id: string }>(owner: DeleteOwner, row: T): DeleteAttempt<T> | null {
  const own = { ...owner }, id = row.id, storageKey = key(own, id);
  const existing = attempts.get(storageKey); if (existing) return existing as DeleteAttempt<T>;
  if (denied.has(storageKey)) return null;
  if (!own.userId || typeof id !== 'string' || !id) return null;
  let captured: T;
  try {
    // Stored text only denies a replacement after module/tab loss. It cannot
    // reconstruct the original response or prove that SQL succeeded.
    if (sessionStorage.getItem(storageKey) !== null) return null;
    captured = structuredClone(row);
    sessionStorage.setItem(storageKey, 'pending');
  } catch { denied.add(storageKey); return null; }
  const attempt: DeleteAttempt<T> = { owner: own, row: captured, original: Promise.resolve({ status: 'unconfirmed' }), waiter: Promise.resolve({ status: 'unconfirmed' }) };
  attempts.set(storageKey, attempt);
  attempt.original = Promise.resolve().then(async (): Promise<DeleteOutcome> => {
    let outcome: DeleteOutcome = { status: 'unconfirmed' };
    try {
      const response = await fetch('/api/youtube/competitors', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), cache: 'no-store' });
      const data = await response.json();
      if (response.status === 200 && response.ok && data?.ok === true && data.deleted === true && data.userId === own.userId && data.id === id) outcome = { status: 'confirmed' };
      else if ([[401, 'unauthorized'], [400, 'missing id'], [404, 'not_found']].some(([status, error]) => response.status === status && data?.error === error)) outcome = { status: 'rejected', error: data.error };
      if (outcome.status !== 'unconfirmed') {
        try { sessionStorage.removeItem(storageKey); }
        catch { if (outcome.status === 'rejected') outcome = { status: 'unconfirmed' }; }
      }
    } catch { /* Retain the original uncertainty; never dispatch a replacement. */ }
    attempt.outcome = outcome;
    if (outcome.status === 'rejected') attempts.delete(storageKey);
    return outcome;
  });
  // One waiter per original request. Remounts observe the same deadline/result;
  // only the actual retained response can confirm the deletion afterwards.
  attempt.waiter = waitForCompetitorDeletion(attempt.original).then(outcome => { attempt.waitOutcome = outcome; return outcome; });
  return attempt;
}
export async function waitForCompetitorDeletion(original: Promise<DeleteOutcome>): Promise<DeleteOutcome> {
  const deadline = performance.now() + 60_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([original, new Promise<DeleteOutcome>(resolve => { timer = setTimeout(() => resolve({ status: 'unconfirmed' }), 60_000); })]);
    return performance.now() >= deadline ? { status: 'unconfirmed' } : result;
  } finally { clearTimeout(timer); }
}
