import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { TeamOwner } from '@/lib/team-read-contract';

export interface RevocationInput {
  teamId: string; invitationId: string; targetEmail: string;
  previousRole: 'admin' | 'member'; previousExpiresAt: string;
}
export type RevocationResult =
  | ({ ok: true; userId: string; email: string; key: string; operation: 'revoke'; status: 'revoked' } & RevocationInput)
  | { ok: false; status: number; error: string };
type Actor = { id: string; userId: string; teamId: string; role: string };
type Invitation = { id: string; teamId: string; email: string; role: string; expiresAt: Date };
const uncertain = (): RevocationResult => ({ ok: false, status: 503, error: 'invitation_revocation_unconfirmed' });
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validInvitationRevocation(input: unknown, key: unknown): input is RevocationInput {
  if (!id(key) || !object(input) || !id(input.teamId) || !id(input.invitationId)
    || typeof input.targetEmail !== 'string' || input.targetEmail.length > 320
    || !/^[^\s@]+@[^\s@]+$/.test(input.targetEmail)
    || !['admin', 'member'].includes(input.previousRole as string) || typeof input.previousExpiresAt !== 'string') return false;
  const expiration = new Date(input.previousExpiresAt);
  return Number.isFinite(expiration.getTime()) && expiration.toISOString() === input.previousExpiresAt;
}

// Rows only deny new work. The admission below belongs to this live invocation;
// neither lookup nor elapsed time can continue it or recreate an acknowledgement.
export async function revokeInvitationOriginal(owner: TeamOwner, input: unknown, key: string, beforeStep: () => void): Promise<RevocationResult> {
  try {
    beforeStep();
    if (!validInvitationRevocation(input, key) || !id(owner.userId) || typeof owner.email !== 'string' || !owner.email)
      return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email });
    const selected = Object.freeze({ teamId: input.teamId, invitationId: input.invitationId,
      targetEmail: input.targetEmail, previousRole: input.previousRole, previousExpiresAt: input.previousExpiresAt });
    const attemptId = randomUUID();
    const lock = async (tx: Prisma.TransactionClient) => {
      beforeStep();
      const teams = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM teams WHERE id=$1 FOR UPDATE', selected.teamId);
      beforeStep(); if (teams.length !== 1 || teams[0].id !== selected.teamId) return null;
      const users = await tx.$queryRawUnsafe<Array<{ id: string; email: string | null }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId);
      beforeStep(); if (users.length !== 1 || users[0].id !== own.userId || users[0].email !== own.email) throw Error('Revocation unconfirmed');
      const actors = await tx.$queryRawUnsafe<Actor[]>('SELECT id,"userId","teamId",role FROM team_members WHERE "teamId"=$1 AND "userId"=$2 FOR UPDATE', selected.teamId, own.userId);
      beforeStep(); if (actors.length > 1) throw Error('Revocation unconfirmed');
      const targets = await tx.$queryRawUnsafe<Invitation[]>('SELECT id,"teamId",email,role,"expiresAt" FROM team_invitations WHERE "teamId"=$1 AND id=$2 FOR UPDATE', selected.teamId, selected.invitationId);
      beforeStep(); if (targets.length > 1) throw Error('Revocation unconfirmed');
      return { actor: actors[0], target: targets[0] };
    };
    const permission = (scope: Awaited<ReturnType<typeof lock>>): string | null => {
      if (!scope) return 'team_not_found';
      if (!scope.actor || !['owner', 'admin'].includes(scope.actor.role)) return 'not_authorized';
      if (!scope.target) return 'invitation_not_found';
      const target = scope.target;
      if (scope.actor.userId !== own.userId || scope.actor.teamId !== selected.teamId
        || target.id !== selected.invitationId || target.teamId !== selected.teamId
        || target.email !== selected.targetEmail || target.role !== selected.previousRole
        || target.expiresAt.toISOString() !== selected.previousExpiresAt) return 'invitation_changed';
      return null;
    };
    const admission = await prisma.$transaction(async tx => {
      const scope = await lock(tx);
      if (!scope) return { denied: 'team_not_found' };
      if (!scope.actor || !['owner', 'admin'].includes(scope.actor.role)) return { denied: 'not_authorized' };
      const prior = await tx.teamInvitationRevocationAttempt.findFirst({ where: { OR: [
        { userId: own.userId, key }, { teamId: selected.teamId, state: { not: 'complete' } },
      ] } });
      beforeStep(); if (prior) return { denied: 'invitation_revocation_unconfirmed' };
      const memberPrior = await tx.teamMemberMutationAttempt.findFirst({ where: { OR: [
        { userId: own.userId, key }, { teamId: selected.teamId, state: { not: 'complete' } },
      ] } });
      beforeStep(); if (memberPrior) return { denied: 'invitation_revocation_unconfirmed' };
      const denied = permission(scope); if (denied) return { denied };
      const captured = Object.freeze({ id: attemptId, ...own, key, operation: 'revoke', ...selected,
        actorMemberId: scope.actor.id, actorRole: scope.actor.role });
      const row = await tx.teamInvitationRevocationAttempt.create({ data: { ...captured, state: 'pending' } });
      beforeStep(); return { captured, row };
    }, { maxWait: 10_000, timeout: 15_000 });
    if ('denied' in admission) {
      const error = admission.denied || 'invitation_revocation_unconfirmed';
      return { ok: false, status: error === 'not_authorized' ? 403 : error.endsWith('_not_found') ? 404 : error === 'invitation_changed' ? 409 : 503, error };
    }
    const captured = admission.captured;
    if (admission.row.state !== 'pending' || Object.entries(captured).some(([k, value]) => admission.row[k as keyof typeof admission.row] !== value)) return uncertain();
    beforeStep();
    await prisma.$transaction(async tx => {
      const scope = await lock(tx);
      if (permission(scope) || !scope?.actor || scope.actor.id !== captured.actorMemberId || scope.actor.role !== captured.actorRole) throw Error('Revocation unconfirmed');
      const row = await tx.teamInvitationRevocationAttempt.findUnique({ where: { id: attemptId } });
      beforeStep(); if (!row || row.state !== 'pending' || Object.entries(captured).some(([k, value]) => row[k as keyof typeof row] !== value)) throw Error('Revocation unconfirmed');
      // Once invoked, this original SQL effect and completion must finish atomically,
      // even after its HTTP observer has retired. No subsequent requester repeats it.
      const changed = await tx.teamInvitation.deleteMany({ where: { id: selected.invitationId, teamId: selected.teamId,
        email: selected.targetEmail, role: selected.previousRole, expiresAt: new Date(selected.previousExpiresAt) } });
      if (changed.count !== 1) throw Error('Revocation unconfirmed');
      const marked = await tx.teamInvitationRevocationAttempt.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Revocation unconfirmed');
    }, { maxWait: 10_000, timeout: 15_000 });
    return { ok: true, ...own, key, operation: 'revoke', ...selected, status: 'revoked' };
  } catch { return uncertain(); }
}
