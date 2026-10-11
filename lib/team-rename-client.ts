import { beginTeamRead } from '@/lib/team-read-client';
import { teamCommandBlocked, reserveTeamCommand } from '@/lib/team-command-client';
import type { TeamRead } from '@/lib/team-read-client';
import type { TeamOwner } from '@/lib/team-read-contract';
import type { TeamRenameInput } from '@/lib/team-rename';

export type TeamRenameReceipt = TeamRenameInput & { operation: 'rename'; status: 'renamed' };
export type TeamRenameOutcome = { status: 'confirmed'; receipt: TeamRenameReceipt } | { status: 'rejected'; error: string } | { status: 'unconfirmed' };
export interface TeamRenameAttempt {
  readonly owner: TeamOwner; readonly input: Readonly<TeamRenameInput>; readonly key: string;
  pending: boolean; original: Promise<TeamRenameOutcome>; waiter: Promise<TeamRenameOutcome>;
  outcome?: TeamRenameOutcome; waitOutcome?: TeamRenameOutcome;
}
const attempts = new Map<string, TeamRenameAttempt>(), denied = new Set<string>();
const settled = new WeakMap<TeamRenameAttempt, TeamRenameOutcome>(), reads = new WeakMap<TeamRenameAttempt, TeamRead>();
const identity = (owner: TeamOwner, teamId: string) => 'ytubviral:team-rename:' + JSON.stringify([owner.userId, owner.email, teamId]);
const ownerIdentity = (owner: TeamOwner) => 'ytubviral:team-rename-owner:' + JSON.stringify([owner.userId, owner.email]);
const deniedOwners = new Set<string>();
// An empty public GET does not settle an earlier rename. Presence only denies
// creation even after module loss; it never reconstructs its producer.
export function teamRenameCreationBlocked(owner: TeamOwner): boolean {
  const scope = ownerIdentity(owner);
  if (deniedOwners.has(scope)) return true;
  try { return sessionStorage.getItem(scope) !== null; } catch { return true; }
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const uncertain = (): TeamRenameOutcome => ({ status: 'unconfirmed' });
function valid(input: TeamRenameInput): boolean {
  return id(input.teamId) && id(input.memberId) && (input.previousRole === 'owner' || input.previousRole === 'admin')
    && typeof input.previousName === 'string' && input.previousName.trim().length > 0 && input.previousName.length <= 250
    && typeof input.name === 'string' && input.name === input.name.trim() && input.name.length >= 2 && input.name.length <= 50 && input.name !== input.previousName;
}
function acknowledgement(body: unknown, a: TeamRenameAttempt): TeamRenameReceipt | null {
  if (!object(body) || body.ok !== true || body.userId !== a.owner.userId || body.email !== a.owner.email || body.key !== a.key
    || body.operation !== 'rename' || body.status !== 'renamed' || Object.entries(a.input).some(([k, value]) => body[k] !== value)) return null;
  return Object.freeze({ ...a.input, operation: 'rename', status: 'renamed' });
}
export function retainedTeamRename(owner: TeamOwner, teamId: string): TeamRenameAttempt | undefined { return attempts.get(identity(owner, teamId)); }
export function retainedTeamRenameForOwner(owner: TeamOwner): TeamRenameAttempt | undefined {
  // Only existing live objects; stored markers and public reads supply no identity.
  return Array.from(attempts.values()).reverse().find(a => a.owner.userId === owner.userId && a.owner.email === owner.email);
}
export function teamRenameBlocked(owner: TeamOwner, teamId: string): boolean {
  const scope = identity(owner, teamId), a = attempts.get(scope), outcome = a && settled.get(a);
  if (teamCommandBlocked(owner, teamId) || denied.has(scope) || a && (!outcome || outcome.status === 'unconfirmed')) return true;
  try { return sessionStorage.getItem(scope) !== null; } catch { return true; }
}
// The live producer's private settled success alone grants one public GET.
export function readConfirmedTeamRename(a: TeamRenameAttempt): TeamRead | null {
  if (attempts.get(identity(a.owner, a.input.teamId)) !== a || settled.get(a)?.status !== 'confirmed') return null;
  let read = reads.get(a);
  if (!read) { read = beginTeamRead(a.owner, true); reads.set(a, read); }
  return read;
}
export function beginTeamRename(owner: TeamOwner, input: TeamRenameInput): TeamRenameAttempt | null {
  if (!id(owner.userId) || typeof owner.email !== 'string' || !owner.email || !valid(input) || teamRenameBlocked(owner, input.teamId) || teamRenameCreationBlocked(owner)) return null;
  const own = Object.freeze({ userId: owner.userId, email: owner.email });
  const selected = Object.freeze({ teamId: input.teamId, memberId: input.memberId, previousRole: input.previousRole, previousName: input.previousName, name: input.name }), scope = identity(own, selected.teamId);
  const release = reserveTeamCommand(own, selected.teamId); if (!release) return null;
  let key: string;
  try { key = crypto.randomUUID(); if (!id(key)) return null; sessionStorage.setItem(ownerIdentity(own), 'pending'); sessionStorage.setItem(scope, 'pending'); }
  catch { denied.add(scope); deniedOwners.add(ownerIdentity(own)); return null; }
  const a: TeamRenameAttempt = { owner: own, input: selected, key, pending: true,
    original: Promise.resolve(uncertain()), waiter: Promise.resolve(uncertain()) };
  Object.defineProperties(a, { owner: { value: own, writable: false, configurable: false },
    input: { value: selected, writable: false, configurable: false }, key: { value: key, writable: false, configurable: false } });
  attempts.set(scope, a); const deadline = performance.now() + 60_000;
  a.original = Promise.resolve().then(async (): Promise<TeamRenameOutcome> => {
    let outcome = uncertain();
    try {
      if (performance.now() >= deadline) return outcome;
      const res = await fetch('/api/team', { method: 'PATCH', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(selected) });
      const body: unknown = await res.json(), receipt = res.ok && res.status === 200 ? acknowledgement(body, a) : null;
      if (receipt) outcome = { status: 'confirmed', receipt };
      else if (!res.ok && object(body) && [[401, 'Unauthorized'], [400, 'invalid_input'], [403, 'not_authorized'], [404, 'team_not_found'], [409, 'team_changed']]
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
      const outcome = await Promise.race([a.original, new Promise<TeamRenameOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]);
      return a.waitOutcome = performance.now() >= deadline ? uncertain() : outcome;
    } finally { clearTimeout(timer); }
  })();
  return a;
}
