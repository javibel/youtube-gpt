import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { TeamOwner, TeamRole } from '@/lib/team-read-contract';

export interface TeamExitInput { teamId: string; memberId: string; previousRole: TeamRole; operation: 'leave' | 'delete' }
export type TeamExitResult = ({ ok: true; userId: string; email: string; key: string; status: 'left' | 'deleted' } & TeamExitInput)
  | { ok: false; status: number; error: string };
type Member = { id: string; userId: string; teamId: string; role: string };
const uncertain = (): TeamExitResult => ({ ok: false, status: 503, error: 'team_exit_unconfirmed' });
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validTeamExit(input: unknown, key: unknown): input is TeamExitInput {
  return id(key) && object(input) && id(input.teamId) && id(input.memberId)
    && (input.operation === 'delete' ? input.previousRole === 'owner'
      : input.operation === 'leave' && (input.previousRole === 'admin' || input.previousRole === 'member'));
}
// The durable row only denies replay. This invocation alone retains admission;
// no lookup, elapsed time, reset or stored receipt can resume or acknowledge it.
export async function exitTeamOriginal(owner: TeamOwner, input: unknown, key: string, beforeStep: () => void): Promise<TeamExitResult> {
  try {
    beforeStep();
    if (!validTeamExit(input, key) || !id(owner.userId) || typeof owner.email !== 'string' || !owner.email)
      return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email });
    const selected = Object.freeze({ teamId: input.teamId, memberId: input.memberId, previousRole: input.previousRole, operation: input.operation });
    const attemptId = randomUUID();
    const lock = async (tx: Prisma.TransactionClient) => {
      beforeStep();
      const teams = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM teams WHERE id=$1 FOR UPDATE', selected.teamId);
      beforeStep(); if (teams.length !== 1 || teams[0].id !== selected.teamId) return null;
      const users = await tx.$queryRawUnsafe<Array<{ id: string; email: string | null }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId);
      beforeStep(); if (users.length !== 1 || users[0].id !== own.userId || users[0].email !== own.email) throw Error('Team exit unconfirmed');
      const members = await tx.$queryRawUnsafe<Member[]>('SELECT id,"userId","teamId",role FROM team_members WHERE "teamId"=$1 AND "userId"=$2 FOR UPDATE', selected.teamId, own.userId);
      beforeStep(); if (members.length > 1) throw Error('Team exit unconfirmed');
      return members[0] ?? null;
    };
    const permission = (member: Member | null) => !member ? 'membership_not_found'
      : member.userId !== own.userId || member.teamId !== selected.teamId || member.id !== selected.memberId || member.role !== selected.previousRole ? 'membership_changed' : null;
    const admission = await prisma.$transaction(async tx => {
      const member = await lock(tx);
      // Used keys must still deny after the original team/membership disappeared.
      const prior = await tx.teamExitAttempt.findFirst({ where: { OR: [
        { userId: own.userId, key }, { teamId: selected.teamId, state: { not: 'complete' } },
      ] } });
      beforeStep(); if (prior) return { denied: 'team_exit_unconfirmed' };
      const other = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM team_member_mutation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_invitation_revocation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_rename_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_invitation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_join_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') LIMIT 1', own.userId, key, selected.teamId);
      beforeStep(); if (other.length) return { denied: 'team_exit_unconfirmed' };
      const denied = permission(member); if (denied) return { denied };
      const captured = Object.freeze({ id: attemptId, ...own, key, ...selected });
      const row = await tx.teamExitAttempt.create({ data: { ...captured, state: 'pending' } });
      beforeStep(); return { captured, row };
    }, { maxWait: 10_000, timeout: 15_000 });
    if ('denied' in admission) {
      const error = admission.denied || 'team_exit_unconfirmed';
      return { ok: false, status: error === 'membership_not_found' ? 404 : error === 'membership_changed' ? 409 : 503, error };
    }
    const captured = admission.captured;
    if (admission.row.state !== 'pending' || Object.entries(captured).some(([k, value]) => admission.row[k as keyof typeof admission.row] !== value)) return uncertain();
    beforeStep();
    await prisma.$transaction(async tx => {
      if (permission(await lock(tx))) throw Error('Team exit unconfirmed');
      const row = await tx.teamExitAttempt.findUnique({ where: { id: attemptId } });
      beforeStep(); if (!row || row.state !== 'pending' || Object.entries(captured).some(([k, value]) => row[k as keyof typeof row] !== value)) throw Error('Team exit unconfirmed');
      // Permission is locked before invocation. Effect and completion finish
      // atomically in this original even if its HTTP observer has retired.
      const changed = selected.operation === 'delete' ? await tx.team.deleteMany({ where: { id: selected.teamId } })
        : await tx.teamMember.deleteMany({ where: { id: selected.memberId, userId: own.userId, teamId: selected.teamId, role: selected.previousRole } });
      if (changed.count !== 1) throw Error('Team exit unconfirmed');
      const marked = await tx.teamExitAttempt.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Team exit unconfirmed');
    }, { maxWait: 10_000, timeout: 15_000 });
    return { ok: true, ...own, key, ...selected, status: selected.operation === 'delete' ? 'deleted' : 'left' };
  } catch { return uncertain(); }
}
