import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { TeamOwner } from '@/lib/team-read-contract';

export interface TeamRenameInput { teamId: string; memberId: string; previousRole: 'owner' | 'admin'; previousName: string; name: string }
export type TeamRenameResult = ({ ok: true; userId: string; email: string; key: string; operation: 'rename'; status: 'renamed' } & TeamRenameInput)
  | { ok: false; status: number; error: string };
type Actor = { id: string; userId: string; teamId: string; role: string };
const uncertain = (): TeamRenameResult => ({ ok: false, status: 503, error: 'team_rename_unconfirmed' });
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validTeamRename(input: unknown, key: unknown): input is TeamRenameInput {
  return id(key) && object(input) && id(input.teamId) && id(input.memberId)
    && (input.previousRole === 'owner' || input.previousRole === 'admin')
    && typeof input.previousName === 'string' && input.previousName.trim().length > 0 && input.previousName.length <= 250
    && typeof input.name === 'string' && input.name === input.name.trim() && input.name.length >= 2 && input.name.length <= 50
    && input.name !== input.previousName;
}
// Durable rows only deny reuse. The admission and completion capability belong
// to this invocation, never to a row, key, stored JSON, clock or reset.
export async function renameTeamOriginal(owner: TeamOwner, input: unknown, key: string, beforeStep: () => void): Promise<TeamRenameResult> {
  try {
    beforeStep();
    if (!validTeamRename(input, key) || !id(owner.userId) || typeof owner.email !== 'string' || !owner.email)
      return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email });
    const selected = Object.freeze({ teamId: input.teamId, memberId: input.memberId, previousRole: input.previousRole, previousName: input.previousName, name: input.name });
    const attemptId = randomUUID();
    const lock = async (tx: Prisma.TransactionClient) => {
      beforeStep();
      const teams = await tx.$queryRawUnsafe<Array<{ id: string; name: string }>>('SELECT id,name FROM teams WHERE id=$1 FOR UPDATE', selected.teamId);
      beforeStep(); if (teams.length !== 1 || teams[0].id !== selected.teamId) return null;
      const users = await tx.$queryRawUnsafe<Array<{ id: string; email: string | null }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId);
      beforeStep(); if (users.length !== 1 || users[0].id !== own.userId || users[0].email !== own.email) throw Error('Team rename unconfirmed');
      const actors = await tx.$queryRawUnsafe<Actor[]>('SELECT id,"userId","teamId",role FROM team_members WHERE "teamId"=$1 AND "userId"=$2 FOR UPDATE', selected.teamId, own.userId);
      beforeStep(); if (actors.length > 1) throw Error('Team rename unconfirmed');
      return { team: teams[0], actor: actors[0] };
    };
    const permission = (scope: Awaited<ReturnType<typeof lock>>) => !scope ? 'team_not_found'
      : !scope.actor || !['owner', 'admin'].includes(scope.actor.role) ? 'not_authorized'
      : scope.actor.id !== selected.memberId || scope.actor.userId !== own.userId || scope.actor.teamId !== selected.teamId
        || scope.actor.role !== selected.previousRole || scope.team.name !== selected.previousName ? 'team_changed' : null;
    const admission = await prisma.$transaction(async tx => {
      const scope = await lock(tx);
      const prior = await tx.teamRenameAttempt.findFirst({ where: { OR: [
        { userId: own.userId, key }, { teamId: selected.teamId, state: { not: 'complete' } },
      ] } });
      beforeStep(); if (prior) return { denied: 'team_rename_unconfirmed' };
      const other = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM team_member_mutation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_invitation_revocation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_exit_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_invitation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_join_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') LIMIT 1', own.userId, key, selected.teamId);
      beforeStep(); if (other.length) return { denied: 'team_rename_unconfirmed' };
      const denied = permission(scope); if (denied) return { denied };
      const captured = Object.freeze({ id: attemptId, ...own, key, ...selected });
      const row = await tx.teamRenameAttempt.create({ data: { ...captured, state: 'pending' } });
      beforeStep(); return { captured, row };
    }, { maxWait: 10_000, timeout: 15_000 });
    if ('denied' in admission) {
      const error = admission.denied || 'team_rename_unconfirmed';
      return { ok: false, status: error === 'team_not_found' ? 404 : error === 'not_authorized' ? 403 : error === 'team_changed' ? 409 : 503, error };
    }
    const captured = admission.captured;
    if (admission.row.state !== 'pending' || Object.entries(captured).some(([k, value]) => admission.row[k as keyof typeof admission.row] !== value)) return uncertain();
    beforeStep();
    await prisma.$transaction(async tx => {
      if (permission(await lock(tx))) throw Error('Team rename unconfirmed');
      const row = await tx.teamRenameAttempt.findUnique({ where: { id: attemptId } });
      beforeStep(); if (!row || row.state !== 'pending' || Object.entries(captured).some(([k, value]) => row[k as keyof typeof row] !== value)) throw Error('Team rename unconfirmed');
      // Locked permission precedes invocation. This original finishes effect and
      // completion atomically, even after its HTTP observer has retired.
      const changed = await tx.team.updateMany({ where: { id: selected.teamId, name: selected.previousName }, data: { name: selected.name } });
      if (changed.count !== 1) throw Error('Team rename unconfirmed');
      const marked = await tx.teamRenameAttempt.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Team rename unconfirmed');
    }, { maxWait: 10_000, timeout: 15_000 });
    return { ok: true, ...own, key, ...selected, operation: 'rename', status: 'renamed' };
  } catch { return uncertain(); }
}
