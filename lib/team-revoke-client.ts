import { beginTeamRead } from '@/lib/team-read-client';
import { teamCommandBlocked, reserveTeamCommand } from '@/lib/team-command-client';
import type { TeamRead } from '@/lib/team-read-client';
import type { TeamOwner } from '@/lib/team-read-contract';
import type { RevocationInput } from '@/lib/team-invitation-revocation';

export type RevocationReceipt = RevocationInput & { operation: 'revoke'; status: 'revoked' };
export type RevocationOutcome = { status: 'confirmed'; receipt: RevocationReceipt } | { status: 'rejected'; error: string } | { status: 'unconfirmed' };
export interface RevocationAttempt {
  readonly owner: TeamOwner; readonly input: Readonly<RevocationInput>; readonly key: string;
  pending: boolean; original: Promise<RevocationOutcome>; waiter: Promise<RevocationOutcome>;
  outcome?: RevocationOutcome; waitOutcome?: RevocationOutcome;
}
const attempts = new Map<string, RevocationAttempt>(), denied = new Set<string>();
const settled = new WeakMap<RevocationAttempt, RevocationOutcome>(), reads = new WeakMap<RevocationAttempt, TeamRead>();
const identity = (owner: TeamOwner, teamId: string) => 'ytubviral:team-revoke:' + JSON.stringify([owner.userId, owner.email, teamId]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const uncertain = (): RevocationOutcome => ({ status: 'unconfirmed' });
function valid(input: RevocationInput): boolean {
  return id(input.teamId) && id(input.invitationId) && typeof input.targetEmail === 'string' && input.targetEmail.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.targetEmail) && (input.previousRole === 'admin' || input.previousRole === 'member')
    && typeof input.previousExpiresAt === 'string' && Number.isFinite(Date.parse(input.previousExpiresAt))
    && new Date(input.previousExpiresAt).toISOString() === input.previousExpiresAt;
}
function acknowledgement(body: unknown, a: RevocationAttempt): RevocationReceipt | null {
  if (!object(body) || body.ok !== true || body.userId !== a.owner.userId || body.email !== a.owner.email || body.key !== a.key
    || body.operation !== 'revoke' || body.status !== 'revoked' || Object.entries(a.input).some(([k, value]) => body[k] !== value)) return null;
  return Object.freeze({ ...a.input, operation: 'revoke', status: 'revoked' });
}
export function retainedRevocation(owner: TeamOwner, teamId: string): RevocationAttempt | undefined { return attempts.get(identity(owner, teamId)); }
export function revocationBlocked(owner: TeamOwner, teamId: string): boolean {
  const scope = identity(owner, teamId), a = attempts.get(scope), outcome = a && settled.get(a);
  if (teamCommandBlocked(owner, teamId) || denied.has(scope) || a && (!outcome || outcome.status === 'unconfirmed')) return true;
  try { return sessionStorage.getItem(scope) !== null; } catch { return true; }
}
// The live producer's private settled success alone grants one public GET.
export function readConfirmedRevocation(a: RevocationAttempt): TeamRead | null {
  if (attempts.get(identity(a.owner, a.input.teamId)) !== a || settled.get(a)?.status !== 'confirmed') return null;
  let read = reads.get(a);
  if (!read) { read = beginTeamRead(a.owner, true); reads.set(a, read); }
  return read;
}
export function beginRevocation(owner: TeamOwner, input: RevocationInput): RevocationAttempt | null {
  if (!id(owner.userId) || typeof owner.email !== 'string' || !owner.email || !valid(input) || revocationBlocked(owner, input.teamId)) return null;
  const own = Object.freeze({ userId: owner.userId, email: owner.email });
  const selected = Object.freeze({ teamId: input.teamId, invitationId: input.invitationId, targetEmail: input.targetEmail,
    previousRole: input.previousRole, previousExpiresAt: input.previousExpiresAt }), scope = identity(own, selected.teamId);
  const release = reserveTeamCommand(own, selected.teamId); if (!release) return null;
  let key: string;
  try { key = crypto.randomUUID(); if (!id(key)) return null; sessionStorage.setItem(scope, 'pending'); }
  catch { denied.add(scope); return null; }
  const a: RevocationAttempt = { owner: own, input: selected, key, pending: true,
    original: Promise.resolve(uncertain()), waiter: Promise.resolve(uncertain()) };
  Object.defineProperties(a, { owner: { value: own, writable: false, configurable: false },
    input: { value: selected, writable: false, configurable: false }, key: { value: key, writable: false, configurable: false } });
  attempts.set(scope, a); const deadline = performance.now() + 60_000;
  a.original = Promise.resolve().then(async (): Promise<RevocationOutcome> => {
    let outcome = uncertain();
    try {
      if (performance.now() >= deadline) return outcome;
      const res = await fetch('/api/team/invite', { method: 'DELETE', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(selected) });
      const body: unknown = await res.json(), receipt = res.ok && res.status === 200 ? acknowledgement(body, a) : null;
      if (receipt) outcome = { status: 'confirmed', receipt };
      else if (!res.ok && object(body) && [[401, 'Unauthorized'], [400, 'invalid_input'], [403, 'not_authorized'],
        [404, 'team_not_found'], [404, 'invitation_not_found'], [409, 'invitation_changed']]
        .some(([status, error]) => res.status === status && body.error === error)) outcome = { status: 'rejected', error: body.error as string };
      if (outcome.status !== 'unconfirmed') { try { sessionStorage.removeItem(scope); release(); } catch { denied.add(scope); } }
    } catch { /* Uncertainty keeps denial and the original. No resend/recovery. */ }
    return outcome;
  }).then(outcome => { Object.freeze(outcome); a.pending = false; a.outcome = outcome; settled.set(a, outcome); return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  a.waiter = (async () => {
    try {
      const outcome = await Promise.race([a.original, new Promise<RevocationOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]);
      return a.waitOutcome = performance.now() >= deadline ? uncertain() : outcome;
    } finally { clearTimeout(timer); }
  })();
  return a;
}
