import { beginTeamRead } from '@/lib/team-read-client';
import type { TeamRead } from '@/lib/team-read-client';
import type { TeamOwner } from '@/lib/team-read-contract';

export interface TeamCreationReceipt { teamId: string; membershipId: string; name: string; slug: string; role: 'owner'; createdAt: string }
export type TeamCreateOutcome = { status: 'confirmed'; receipt: TeamCreationReceipt } | { status: 'rejected'; error: string } | { status: 'unconfirmed' };
export interface TeamCreateAttempt {
  readonly owner: TeamOwner; readonly name: string; readonly key: string; pending: boolean;
  original: Promise<TeamCreateOutcome>; waiter: Promise<TeamCreateOutcome>;
  outcome?: TeamCreateOutcome; waitOutcome?: TeamCreateOutcome; read?: TeamRead;
}
const attempts = new Map<string, TeamCreateAttempt>(), denied = new Set<string>();
const identity = (owner: TeamOwner) => 'ytubviral:team-create:' + JSON.stringify([owner.userId, owner.email]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const uncertain = (): TeamCreateOutcome => ({ status: 'unconfirmed' });
export const validTeamName = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 50;
function acknowledgement(body: unknown, a: TeamCreateAttempt): TeamCreationReceipt | null {
  if (!object(body) || body.ok !== true || body.userId !== a.owner.userId || body.email !== a.owner.email || body.key !== a.key
    || body.name !== a.name || !identifier(body.teamId) || !identifier(body.membershipId) || body.role !== 'owner'
    || typeof body.slug !== 'string' || body.slug.length > 80 || !/^[a-z0-9-]+$/.test(body.slug)
    || typeof body.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.createdAt)
    || !Number.isFinite(Date.parse(body.createdAt)) || new Date(body.createdAt).toISOString() !== body.createdAt) return null;
  return { teamId: body.teamId, membershipId: body.membershipId, name: a.name, slug: body.slug, role: 'owner', createdAt: body.createdAt };
}
export function retainedTeamCreation(owner: TeamOwner): TeamCreateAttempt | undefined { return attempts.get(identity(owner)); }
export function teamCreationBlocked(owner: TeamOwner): boolean {
  const id = identity(owner), a = attempts.get(id);
  if (denied.has(id) || a && (!a.outcome || a.outcome.status === 'unconfirmed')) return true;
  try { return sessionStorage.getItem(id) !== null; } catch { return true; }
}
// A stored receipt/ID/key never grants this continuation. Only the same
// successful live POST may create its one subsequent public read.
export function readConfirmedTeamCreation(a: TeamCreateAttempt): TeamRead | null {
  if (attempts.get(identity(a.owner)) !== a || a.outcome?.status !== 'confirmed') return null;
  return a.read ??= beginTeamRead(a.owner, true);
}
export function beginTeamCreation(owner: TeamOwner, input: string): TeamCreateAttempt | null {
  const id = identity(owner), existing = attempts.get(id);
  if (existing && (!existing.outcome || existing.outcome.status === 'unconfirmed')) return existing;
  if (!identifier(owner.userId) || typeof owner.email !== 'string' || !owner.email || !validTeamName(input) || teamCreationBlocked(owner)) return null;
  let key: string;
  try {
    key = crypto.randomUUID(); if (!identifier(key)) return null;
    // Presence is denial after module loss, never a parsed producer or receipt.
    sessionStorage.setItem(id, 'pending');
  } catch { denied.add(id); return null; }
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), name = input.trim();
  const a: TeamCreateAttempt = { owner: own, name, key, pending: true, original: Promise.resolve(uncertain()), waiter: Promise.resolve(uncertain()) };
  Object.defineProperties(a, { owner: { value: own, writable: false, configurable: false },
    name: { value: name, writable: false, configurable: false }, key: { value: key, writable: false, configurable: false } });
  attempts.set(id, a); const deadline = performance.now() + 60_000;
  a.original = Promise.resolve().then(async (): Promise<TeamCreateOutcome> => {
    let outcome = uncertain();
    try {
      if (performance.now() >= deadline) return outcome;
      const res = await fetch('/api/team', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ name }) });
      const body: unknown = await res.json(), receipt = res.ok && res.status === 201 ? acknowledgement(body, a) : null;
      if (receipt) outcome = { status: 'confirmed', receipt };
      else if (!res.ok && object(body) && [[401, 'Unauthorized'], [400, 'invalid_input'], [403, 'pro_required'], [400, 'already_in_team']]
        .some(([status, error]) => res.status === status && body.error === error)) outcome = { status: 'rejected', error: body.error as string };
      if (outcome.status !== 'unconfirmed') {
        try { sessionStorage.removeItem(id); } catch { denied.add(id); }
      }
    } catch { /* Private/transport errors leave denial and the original alone. */ }
    return outcome;
  }).then(outcome => { a.pending = false; a.outcome = outcome; return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  a.waiter = (async () => {
    try {
      const outcome = await Promise.race([a.original, new Promise<TeamCreateOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]);
      return a.waitOutcome = performance.now() >= deadline ? uncertain() : outcome;
    } finally { clearTimeout(timer); }
  })();
  return a;
}
