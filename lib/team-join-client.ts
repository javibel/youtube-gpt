import { beginTeamRead } from '@/lib/team-read-client';
import { teamOwnerCommandBlocked, reserveTeamOwnerCommand } from '@/lib/team-command-client';
import type { TeamRead } from '@/lib/team-read-client';
import type { TeamOwner } from '@/lib/team-read-contract';

export interface TeamJoinReceipt { teamId: string; teamName: string; invitationId: string; membershipId: string; role: 'admin' | 'member'; expiresAt: string }
export type TeamJoinOutcome = { status: 'confirmed'; receipt: TeamJoinReceipt } | { status: 'rejected'; error: string } | { status: 'unconfirmed' };
export interface TeamJoinAttempt { readonly owner: TeamOwner; readonly key: string; pending: boolean; original: Promise<TeamJoinOutcome>; waiter: Promise<TeamJoinOutcome>; outcome?: TeamJoinOutcome; waitOutcome?: TeamJoinOutcome }
const attempts = new Map<string, TeamJoinAttempt>(), tokens = new WeakMap<TeamJoinAttempt, string>(), settled = new WeakMap<TeamJoinAttempt, TeamJoinOutcome>(), reads = new WeakMap<TeamJoinAttempt, TeamRead>(), denied = new Set<string>();
const identity = (owner: TeamOwner) => 'ytubviral:team-join:' + JSON.stringify([owner.userId, owner.email]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
export const validTeamJoinToken = id;
const uncertain = (): TeamJoinOutcome => ({ status: 'unconfirmed' });
function acknowledgement(b: unknown, a: TeamJoinAttempt): TeamJoinReceipt | null {
  if (!object(b) || b.ok !== true || b.userId !== a.owner.userId || b.email !== a.owner.email || b.key !== a.key || b.operation !== 'join' || b.status !== 'joined'
    || !id(b.teamId) || !id(b.invitationId) || !id(b.membershipId) || typeof b.teamName !== 'string' || b.teamName.trim().length < 2 || b.teamName.length > 50
    || (b.role !== 'admin' && b.role !== 'member') || typeof b.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(b.expiresAt)
    || !Number.isFinite(Date.parse(b.expiresAt)) || new Date(b.expiresAt).toISOString() !== b.expiresAt) return null;
  // Expiry belongs to the consumed invitation. A delayed genuine ack must not
  // renew it or reinterpret server consumption against the client's clock.
  return Object.freeze({ teamId: b.teamId, teamName: b.teamName, invitationId: b.invitationId, membershipId: b.membershipId, role: b.role, expiresAt: b.expiresAt });
}
export function retainedTeamJoin(owner: TeamOwner, token: string): TeamJoinAttempt | undefined {
  const a = attempts.get(identity(owner)); return a && tokens.get(a) === token ? a : undefined;
}
export function teamJoinBlocked(owner: TeamOwner): boolean {
  const scope = identity(owner), a = attempts.get(scope), outcome = a && settled.get(a);
  if (teamOwnerCommandBlocked(owner) || denied.has(scope) || a && (!outcome || outcome.status === 'unconfirmed')) return true;
  try { return sessionStorage.getItem(scope) !== null; } catch { return true; }
}
export function trustedTeamJoinOutcome(a: TeamJoinAttempt): TeamJoinOutcome | undefined {
  return attempts.get(identity(a.owner)) === a ? settled.get(a) : undefined;
}
export function readConfirmedTeamJoin(a: TeamJoinAttempt): TeamRead | null {
  if (trustedTeamJoinOutcome(a)?.status !== 'confirmed') return null;
  let read = reads.get(a); if (!read) { read = beginTeamRead(a.owner, true); reads.set(a, read); } return read;
}
export function beginTeamJoin(owner: TeamOwner, token: string): TeamJoinAttempt | null {
  const prior = retainedTeamJoin(owner, token); if (prior && settled.get(prior)?.status === 'confirmed') return null;
  if (!id(owner.userId) || typeof owner.email !== 'string' || !owner.email || !id(token) || teamJoinBlocked(owner)) return null;
  let key: string; try { key = crypto.randomUUID(); if (!id(key)) return null; } catch { return null; }
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), scope = identity(own), release = reserveTeamOwnerCommand(own); if (!release) return null;
  try { sessionStorage.setItem(scope, 'pending'); } catch { denied.add(scope); return null; }
  const a: TeamJoinAttempt = { owner: own, key, pending: true, original: Promise.resolve(uncertain()), waiter: Promise.resolve(uncertain()) };
  Object.defineProperties(a, { owner: { value: own, writable: false, configurable: false }, key: { value: key, writable: false, configurable: false } });
  attempts.set(scope, a); tokens.set(a, token); const deadline = performance.now() + 60_000;
  a.original = Promise.resolve().then(async (): Promise<TeamJoinOutcome> => {
    let outcome = uncertain();
    try {
      if (performance.now() >= deadline) return outcome;
      const res = await fetch('/api/team/join', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ token }) });
      const body: unknown = await res.json(), receipt = res.ok && res.status === 200 ? acknowledgement(body, a) : null;
      if (receipt) outcome = { status: 'confirmed', receipt };
      else if (!res.ok && object(body) && [[401, 'Unauthorized'], [400, 'invalid_input'], [400, 'invalid_token'], [403, 'email_mismatch'], [404, 'team_not_found'], [409, 'invitation_changed'], [409, 'expired'], [409, 'already_in_team'], [409, 'team_full']].some(([status, error]) => res.status === status && body.error === error)) outcome = { status: 'rejected', error: body.error as string };
      if (outcome.status !== 'unconfirmed') { try { sessionStorage.removeItem(scope); release(); } catch { denied.add(scope); } }
    } catch { /* Keep original uncertainty; no abort, resend or restored token. */ }
    return outcome;
  }).then(outcome => { Object.freeze(outcome); a.pending = false; a.outcome = outcome; settled.set(a, outcome); return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  a.waiter = (async () => {
    try { const result = await Promise.race([a.original, new Promise<TeamJoinOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]); return a.waitOutcome = performance.now() >= deadline ? uncertain() : result; }
    finally { clearTimeout(timer); }
  })();
  Object.defineProperties(a, { original: { value: a.original, writable: false, configurable: false }, waiter: { value: a.waiter, writable: false, configurable: false } });
  return a;
}
