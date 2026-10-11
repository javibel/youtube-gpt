import { beginTeamRead } from '@/lib/team-read-client';
import { teamCommandBlocked, reserveTeamCommand } from '@/lib/team-command-client';
import type { TeamRead } from '@/lib/team-read-client';
import type { TeamOwner } from '@/lib/team-read-contract';
import type { TeamInvitationInput as TeamInviteInput } from '@/lib/team-invitation';

export type TeamInviteReceipt = TeamInviteInput & { operation: 'invite'; status: 'created'; emailStatus: 'provider-accepted'; invitationId: string; expiresAt: string };
export type TeamInviteOutcome = { status: 'confirmed'; receipt: TeamInviteReceipt } | { status: 'rejected'; error: string } | { status: 'unconfirmed' };
export interface TeamInviteAttempt {
  readonly owner: TeamOwner; readonly input: Readonly<TeamInviteInput>; readonly key: string;
  pending: boolean; original: Promise<TeamInviteOutcome>; waiter: Promise<TeamInviteOutcome>;
  outcome?: TeamInviteOutcome; waitOutcome?: TeamInviteOutcome;
}
const attempts = new Map<string, TeamInviteAttempt>(), denied = new Set<string>();
const settled = new WeakMap<TeamInviteAttempt, TeamInviteOutcome>(), reads = new WeakMap<TeamInviteAttempt, TeamRead>();
const identity = (owner: TeamOwner, teamId: string) => 'ytubviral:team-invite:' + JSON.stringify([owner.userId, owner.email, teamId]);
const ownerIdentity = (owner: TeamOwner) => 'ytubviral:team-invite-owner:' + JSON.stringify([owner.userId, owner.email]);
const deniedOwners = new Set<string>();
// An empty public GET does not settle an earlier invite. Presence only denies
// creation even after module loss; it never reconstructs its producer.
export function teamInviteCreationBlocked(owner: TeamOwner): boolean {
  const scope = ownerIdentity(owner);
  if (deniedOwners.has(scope)) return true;
  try { return sessionStorage.getItem(scope) !== null; } catch { return true; }
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const uncertain = (): TeamInviteOutcome => ({ status: 'unconfirmed' });
function valid(input: TeamInviteInput): boolean {
  return id(input.teamId) && id(input.memberId) && (input.previousRole === 'owner' || input.previousRole === 'admin')
    && (input.role === 'member' || input.role === 'admin') && typeof input.targetEmail === 'string' && input.targetEmail.length <= 320
    && input.targetEmail === input.targetEmail.trim().toLowerCase() && /^[^\s@<>"\x00-\x1f\x7f]+@[^\s@<>"\x00-\x1f\x7f]+\.[^\s@<>"\x00-\x1f\x7f]+$/.test(input.targetEmail);
}
function acknowledgement(body: unknown, a: TeamInviteAttempt): TeamInviteReceipt | null {
  if (!object(body) || body.ok !== true || body.userId !== a.owner.userId || body.email !== a.owner.email || body.key !== a.key
    || body.operation !== 'invite' || body.status !== 'created' || body.emailStatus !== 'provider-accepted' || !id(body.invitationId) || typeof body.expiresAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.expiresAt) || !Number.isFinite(Date.parse(body.expiresAt))
    || new Date(body.expiresAt).toISOString() !== body.expiresAt || Date.parse(body.expiresAt) <= Date.now() || Object.entries(a.input).some(([k, value]) => body[k] !== value)) return null;
  return Object.freeze({ ...a.input, operation: 'invite', status: 'created', emailStatus: 'provider-accepted', invitationId: body.invitationId, expiresAt: body.expiresAt });
}
export function retainedTeamInvite(owner: TeamOwner, teamId: string): TeamInviteAttempt | undefined { return attempts.get(identity(owner, teamId)); }
export function retainedTeamInviteForOwner(owner: TeamOwner): TeamInviteAttempt | undefined {
  // Only existing live objects; stored markers and public reads supply no identity.
  return Array.from(attempts.values()).reverse().find(a => a.owner.userId === owner.userId && a.owner.email === owner.email);
}
export function teamInviteBlocked(owner: TeamOwner, teamId: string): boolean {
  const scope = identity(owner, teamId), a = attempts.get(scope), outcome = a && settled.get(a);
  if (teamCommandBlocked(owner, teamId) || denied.has(scope) || a && (!outcome || outcome.status === 'unconfirmed')) return true;
  try { return sessionStorage.getItem(scope) !== null; } catch { return true; }
}
// The live producer's private settled success alone grants one public GET.
export function readConfirmedTeamInvite(a: TeamInviteAttempt): TeamRead | null {
  if (attempts.get(identity(a.owner, a.input.teamId)) !== a || settled.get(a)?.status !== 'confirmed') return null;
  let read = reads.get(a);
  if (!read) { read = beginTeamRead(a.owner, true); reads.set(a, read); }
  return read;
}
export function beginTeamInvite(owner: TeamOwner, input: TeamInviteInput): TeamInviteAttempt | null {
  if (!id(owner.userId) || typeof owner.email !== 'string' || !owner.email || !valid(input) || teamInviteBlocked(owner, input.teamId) || teamInviteCreationBlocked(owner)) return null;
  const own = Object.freeze({ userId: owner.userId, email: owner.email });
  const selected = Object.freeze({ teamId: input.teamId, memberId: input.memberId, previousRole: input.previousRole, targetEmail: input.targetEmail, role: input.role }), scope = identity(own, selected.teamId);
  const release = reserveTeamCommand(own, selected.teamId); if (!release) return null;
  let key: string;
  try { key = crypto.randomUUID(); if (!id(key)) return null; sessionStorage.setItem(ownerIdentity(own), 'pending'); sessionStorage.setItem(scope, 'pending'); }
  catch { denied.add(scope); deniedOwners.add(ownerIdentity(own)); return null; }
  const a: TeamInviteAttempt = { owner: own, input: selected, key, pending: true,
    original: Promise.resolve(uncertain()), waiter: Promise.resolve(uncertain()) };
  Object.defineProperties(a, { owner: { value: own, writable: false, configurable: false },
    input: { value: selected, writable: false, configurable: false }, key: { value: key, writable: false, configurable: false } });
  attempts.set(scope, a); const deadline = performance.now() + 60_000;
  a.original = Promise.resolve().then(async (): Promise<TeamInviteOutcome> => {
    let outcome = uncertain();
    try {
      if (performance.now() >= deadline) return outcome;
      const res = await fetch('/api/team/invite', { method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(selected) });
      const body: unknown = await res.json(), receipt = res.ok && res.status === 201 ? acknowledgement(body, a) : null;
      if (receipt) outcome = { status: 'confirmed', receipt };
      else if (!res.ok && object(body) && [[401, 'Unauthorized'], [400, 'invalid_input'], [403, 'not_authorized'], [404, 'team_not_found'], [409, 'team_changed'], [409, 'team_full'], [409, 'already_member'], [409, 'already_invited'], [409, 'expired_invitation_requires_revocation']]
        .some(([status, error]) => res.status === status && body.error === error)) outcome = { status: 'rejected', error: body.error as string };
      if (outcome.status !== 'unconfirmed') {
        try { sessionStorage.removeItem(scope); sessionStorage.removeItem(ownerIdentity(own)); release(); }
        catch { denied.add(scope); deniedOwners.add(ownerIdentity(own)); }
      }
    } catch { /* Uncertainty keeps denial and the original. No resend/recovery. */ }
    return outcome;
  }).then(outcome => { Object.freeze(outcome); a.pending = false; a.outcome = outcome; settled.set(a, outcome); return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  a.waiter = (async () => {
    try {
      const outcome = await Promise.race([a.original, new Promise<TeamInviteOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]);
      return a.waitOutcome = performance.now() >= deadline ? uncertain() : outcome;
    } finally { clearTimeout(timer); }
  })();
  return a;
}
