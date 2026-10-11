import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { TeamOwner } from '@/lib/team-read-contract';

export type MemberOperation = 'role' | 'remove';
export interface MemberInput {
  teamId: string; memberId: string; targetUserId: string;
  previousRole: 'admin' | 'member'; role: 'admin' | 'member' | null;
}
type MemberRow = { id: string; userId: string; teamId: string; role: string };
export type MemberMutationResult =
  | ({ ok: true; userId: string; email: string; key: string; operation: MemberOperation; status: 'updated' | 'removed' } & MemberInput)
  | { ok: false; status: number; error: string };
const uncertain = (): MemberMutationResult => ({ ok: false, status: 503, error: 'member_mutation_unconfirmed' });
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validMemberMutation(input: unknown, key: unknown, operation: MemberOperation): input is MemberInput {
  return id(key) && object(input) && id(input.teamId) && id(input.memberId) && id(input.targetUserId)
    && (input.previousRole === 'admin' || input.previousRole === 'member')
    && (operation === 'remove' ? input.role === null
      : (input.role === 'admin' || input.role === 'member') && input.role !== input.previousRole);
}

// Admission rows only deny replay. No row, ID, elapsed time or independent
// lookup can continue this producer: only this live invocation has its admission.
export async function mutateTeamMemberOriginal(
  owner: TeamOwner, input: unknown, key: string, operation: MemberOperation, beforeStep: () => void,
): Promise<MemberMutationResult> {
  try {
    beforeStep();
    if (!validMemberMutation(input, key, operation) || !id(owner.userId) || typeof owner.email !== 'string')
      return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email });
    const selected = Object.freeze({ teamId: input.teamId, memberId: input.memberId,
      targetUserId: input.targetUserId, previousRole: input.previousRole, role: input.role });
    const attemptId = randomUUID();
    if (selected.targetUserId === own.userId) return { ok: false, status: 400, error: 'cannot_mutate_self' };
    const lock = async (tx: Prisma.TransactionClient) => {
      beforeStep();
      const team = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM teams WHERE id=$1 FOR UPDATE', selected.teamId);
      beforeStep(); if (team.length !== 1 || team[0].id !== selected.teamId) return null;
      const users = await tx.$queryRawUnsafe<Array<{ id: string; email: string | null }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId);
      beforeStep();
      if (users.length !== 1 || users[0].id !== own.userId || users[0].email !== own.email) throw Error('Member unconfirmed');
      const rows = await tx.$queryRawUnsafe<MemberRow[]>('SELECT id,"userId","teamId",role FROM team_members WHERE "teamId"=$1 AND ("userId"=$2 OR id=$3) ORDER BY id FOR UPDATE', selected.teamId, own.userId, selected.memberId);
      beforeStep();
      const actors = rows.filter(r => r.userId === own.userId && r.teamId === selected.teamId);
      const targets = rows.filter(r => r.id === selected.memberId && r.teamId === selected.teamId);
      if (actors.length > 1 || targets.length > 1) throw Error('Member unconfirmed');
      return { actor: actors[0], target: targets[0] };
    };
    const permission = (scope: Awaited<ReturnType<typeof lock>>): string | null => {
      if (!scope) return 'team_not_found';
      const { actor, target } = scope;
      if (!actor || (operation === 'role' ? actor.role !== 'owner' : !['owner', 'admin'].includes(actor.role))) return 'not_authorized';
      if (!target) return 'member_not_found';
      if (target.userId === own.userId || target.role === 'owner') return 'cannot_mutate_self';
      if (actor.role === 'admin' && target.role !== 'member') return 'not_authorized';
      if (target.userId !== selected.targetUserId || target.role !== selected.previousRole) return 'member_changed';
      return null;
    };
    const admission = await prisma.$transaction(async tx => {
      const scope = await lock(tx);
      if (!scope) return { denied: 'team_not_found' };
      if (!scope.actor || !['owner', 'admin'].includes(scope.actor.role)) return { denied: 'not_authorized' };
      const prior = await tx.teamMemberMutationAttempt.findFirst({ where: { OR: [
        { userId: own.userId, key }, { teamId: selected.teamId, state: { not: 'complete' } },
      ] } });
      beforeStep(); if (prior) return { denied: 'member_mutation_unconfirmed' };
      const invitationPrior = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM team_invitation_revocation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_invitation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_join_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') LIMIT 1', own.userId, key, selected.teamId);
      beforeStep(); if (invitationPrior.length) return { denied: 'member_mutation_unconfirmed' };
      const exitPrior = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM team_exit_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_rename_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') LIMIT 1', own.userId, key, selected.teamId);
      beforeStep(); if (exitPrior.length) return { denied: 'member_mutation_unconfirmed' };
      const denied = permission(scope); if (denied) return { denied };
      const captured = Object.freeze({ id: attemptId, ...own, key, operation, ...selected,
        actorMemberId: scope.actor.id, actorRole: scope.actor.role });
      const row = await tx.teamMemberMutationAttempt.create({ data: { ...captured, state: 'pending' } });
      beforeStep(); return { captured, row };
    }, { maxWait: 10_000, timeout: 15_000 });
    if ('denied' in admission) {
      const error = admission.denied || 'member_mutation_unconfirmed';
      return { ok: false, status: error === 'not_authorized' ? 403 : error.endsWith('_not_found') ? 404
        : error === 'member_changed' ? 409 : error === 'cannot_mutate_self' ? 400 : 503, error };
    }
    const captured = admission.captured;
    if (admission.row.state !== 'pending'
      || Object.entries(captured).some(([k, value]) => admission.row[k as keyof typeof admission.row] !== value)) return uncertain();
    beforeStep();
    await prisma.$transaction(async tx => {
      const scope = await lock(tx);
      if (permission(scope) || !scope?.actor
        || scope.actor.id !== captured.actorMemberId || scope.actor.role !== captured.actorRole) throw Error('Member unconfirmed');
      const row = await tx.teamMemberMutationAttempt.findUnique({ where: { id: attemptId } });
      beforeStep();
      if (!row || row.state !== 'pending' || Object.entries(captured).some(([k, value]) => row[k as keyof typeof row] !== value)) throw Error('Member unconfirmed');
      const where = { id: selected.memberId, teamId: selected.teamId, userId: selected.targetUserId, role: selected.previousRole };
      // After invocation the original SQL effect and completion must finish
      // atomically, even when its HTTP observer has retired.
      const changed = operation === 'role' ? await tx.teamMember.updateMany({ where, data: { role: selected.role! } })
        : await tx.teamMember.deleteMany({ where });
      if (changed.count !== 1) throw Error('Member unconfirmed');
      const marked = await tx.teamMemberMutationAttempt.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Member unconfirmed');
    }, { maxWait: 10_000, timeout: 15_000 });
    return { ok: true, ...own, key, operation, ...selected, status: operation === 'role' ? 'updated' : 'removed' };
  } catch { return uncertain(); }
}
