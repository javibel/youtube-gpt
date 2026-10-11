import { beginTeamRead } from '@/lib/team-read-client';
import { teamCommandBlocked, reserveTeamCommand } from '@/lib/team-command-client';
import type { TeamRead } from '@/lib/team-read-client';
import type { TeamOwner } from '@/lib/team-read-contract';
import type { MemberInput, MemberOperation } from '@/lib/team-member-mutation';

export type MemberReceipt = MemberInput & { operation: MemberOperation; status: 'updated' | 'removed' };
export type MemberOutcome = { status: 'confirmed'; receipt: MemberReceipt } | { status: 'rejected'; error: string } | { status: 'unconfirmed' };
export interface MemberAttempt {
  readonly owner: TeamOwner; readonly input: Readonly<MemberInput>; readonly key: string; readonly operation: MemberOperation;
  pending: boolean; original: Promise<MemberOutcome>; waiter: Promise<MemberOutcome>;
  outcome?: MemberOutcome; waitOutcome?: MemberOutcome;
}
const attempts = new Map<string, MemberAttempt>(), denied = new Set<string>();
const settled = new WeakMap<MemberAttempt, MemberOutcome>(), reads = new WeakMap<MemberAttempt, TeamRead>();
const identity = (owner: TeamOwner, teamId: string) => 'ytubviral:team-members:' + JSON.stringify([owner.userId, owner.email, teamId]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const uncertain = (): MemberOutcome => ({ status: 'unconfirmed' });
function valid(input: MemberInput, operation: MemberOperation): boolean {
  return id(input.teamId) && id(input.memberId) && id(input.targetUserId)
    && (input.previousRole === 'admin' || input.previousRole === 'member')
    && (operation === 'remove' ? input.role === null
      : (input.role === 'admin' || input.role === 'member') && input.role !== input.previousRole);
}
function acknowledgement(body: unknown, a: MemberAttempt): MemberReceipt | null {
  if (!object(body) || body.ok !== true || body.userId !== a.owner.userId || body.email !== a.owner.email || body.key !== a.key
    || body.operation !== a.operation || body.status !== (a.operation === 'role' ? 'updated' : 'removed')
    || Object.entries(a.input).some(([k, value]) => body[k] !== value)) return null;
  return Object.freeze({ ...a.input, operation: a.operation, status: a.operation === 'role' ? 'updated' : 'removed' });
}
export function retainedMemberMutation(owner: TeamOwner, teamId: string): MemberAttempt | undefined { return attempts.get(identity(owner, teamId)); }
export function memberMutationBlocked(owner: TeamOwner, teamId: string): boolean {
  const key = identity(owner, teamId), a = attempts.get(key), outcome = a && settled.get(a);
  if (teamCommandBlocked(owner, teamId) || denied.has(key) || a && (!outcome || outcome.status === 'unconfirmed')) return true;
  try { return sessionStorage.getItem(key) !== null; } catch { return true; }
}
// Only the successful live producer's private settled outcome can grant its
// subsequent public read. A stored/cloned/modified outcome cannot do so.
export function readConfirmedMemberMutation(a: MemberAttempt): TeamRead | null {
  if (attempts.get(identity(a.owner, a.input.teamId)) !== a || settled.get(a)?.status !== 'confirmed') return null;
  let read = reads.get(a);
  if (!read) { read = beginTeamRead(a.owner, true); reads.set(a, read); }
  return read;
}
export function beginMemberMutation(owner: TeamOwner, input: MemberInput, operation: MemberOperation): MemberAttempt | null {
  if (!id(owner.userId) || typeof owner.email !== 'string' || !owner.email || !valid(input, operation)
    || input.targetUserId === owner.userId || memberMutationBlocked(owner, input.teamId)) return null;
  const own = Object.freeze({ userId: owner.userId, email: owner.email });
  const selected = Object.freeze({ teamId: input.teamId, memberId: input.memberId, targetUserId: input.targetUserId,
    previousRole: input.previousRole, role: input.role }), scope = identity(own, selected.teamId);
  const release = reserveTeamCommand(own, selected.teamId); if (!release) return null;
  let key: string;
  try { key = crypto.randomUUID(); if (!id(key)) return null; sessionStorage.setItem(scope, 'pending'); }
  catch { denied.add(scope); return null; }
  const a: MemberAttempt = { owner: own, input: selected, operation, key, pending: true,
    original: Promise.resolve(uncertain()), waiter: Promise.resolve(uncertain()) };
  Object.defineProperties(a, { owner: { value: own, writable: false, configurable: false },
    input: { value: selected, writable: false, configurable: false }, operation: { value: operation, writable: false, configurable: false },
    key: { value: key, writable: false, configurable: false } });
  attempts.set(scope, a); const deadline = performance.now() + 60_000;
  a.original = Promise.resolve().then(async (): Promise<MemberOutcome> => {
    let outcome = uncertain();
    try {
      if (performance.now() >= deadline) return outcome;
      const res = await fetch('/api/team/members', { method: operation === 'role' ? 'PATCH' : 'DELETE', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(selected) });
      const body: unknown = await res.json(), receipt = res.ok && res.status === 200 ? acknowledgement(body, a) : null;
      if (receipt) outcome = { status: 'confirmed', receipt };
      else if (!res.ok && object(body) && [[401, 'Unauthorized'], [400, 'invalid_input'], [400, 'cannot_mutate_self'],
        [403, 'not_authorized'], [404, 'team_not_found'], [404, 'member_not_found'], [409, 'member_changed']]
        .some(([status, error]) => res.status === status && body.error === error)) outcome = { status: 'rejected', error: body.error as string };
      if (outcome.status !== 'unconfirmed') { try { sessionStorage.removeItem(scope); release(); } catch { denied.add(scope); } }
    } catch { /* Transport/private errors retain denial, never resend or recover. */ }
    return outcome;
  }).then(outcome => { Object.freeze(outcome); a.pending = false; a.outcome = outcome; settled.set(a, outcome); return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  a.waiter = (async () => {
    try {
      const outcome = await Promise.race([a.original, new Promise<MemberOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]);
      return a.waitOutcome = performance.now() >= deadline ? uncertain() : outcome;
    } finally { clearTimeout(timer); }
  })();
  return a;
}
