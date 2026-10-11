import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { TeamOwner } from '@/lib/team-read-contract';

export type TeamJoinResult = { ok: true; userId: string; email: string; key: string; operation: 'join'; status: 'joined'; teamId: string; teamName: string; invitationId: string; role: 'admin' | 'member'; expiresAt: string; membershipId: string }
  | { ok: false; status: number; error: string };
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
export function validTeamJoin(v: unknown, key: unknown): v is { token: string } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const b = v as Record<string, unknown>;
  return id(key) && Object.keys(b).length === 1 && id(b.token);
}
const uncertain = (): TeamJoinResult => ({ ok: false, status: 503, error: 'team_join_unconfirmed' });
type Invitation = { id: string; teamId: string; email: string; role: string; token: string; expiresAt: Date };
const settings = { maxWait: 10_000, timeout: 15_000 };

// The token and selection belong to this original invocation. Stored rows only
// deny new work; they never reconstitute a completion capability.
export async function joinTeamOriginal(owner: TeamOwner, input: unknown, key: string, beforeStep: () => void): Promise<TeamJoinResult> {
  try {
    beforeStep();
    if (!validTeamJoin(input, key) || !id(owner.userId) || typeof owner.email !== 'string' || !owner.email) return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email }), token = input.token;
    const prior = await prisma.teamJoinAttempt.findFirst({ where: { userId: own.userId, OR: [{ key }, { state: { not: 'complete' } }] } }); beforeStep();
    if (prior) return uncertain();
    const found = await prisma.teamInvitation.findUnique({ where: { token }, select: { id: true, teamId: true, email: true, role: true, token: true, expiresAt: true } }); beforeStep();
    if (!found) return { ok: false, status: 400, error: 'invalid_token' };
    if (!id(found.id) || !id(found.teamId) || found.token !== token || !['admin', 'member'].includes(found.role) || !Number.isFinite(found.expiresAt.getTime())) return uncertain();
    const selected = Object.freeze({ invitationId: found.id, teamId: found.teamId, targetEmail: found.email, role: found.role as 'admin' | 'member', expiresAt: found.expiresAt.toISOString() });
    const lock = async (tx: Prisma.TransactionClient) => {
      beforeStep(); const teams = await tx.$queryRawUnsafe<Array<{ id: string; name: string; maxMembers: number }>>('SELECT id,name,"maxMembers" FROM teams WHERE id=$1 FOR UPDATE', selected.teamId); beforeStep();
      if (teams.length !== 1 || teams[0].id !== selected.teamId) return null;
      const users = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId); beforeStep();
      if (users.length !== 1 || users[0].id !== own.userId || users[0].email !== own.email) throw Error('Join unconfirmed');
      const members = await tx.$queryRawUnsafe<Array<{ id: string; userId: string; teamId: string; role: string }>>('SELECT id,"userId","teamId",role FROM team_members WHERE "teamId"=$1 OR "userId"=$2 ORDER BY id FOR UPDATE', selected.teamId, own.userId); beforeStep();
      const invitations = await tx.$queryRawUnsafe<Invitation[]>('SELECT id,"teamId",email,role,token,"expiresAt" FROM team_invitations WHERE id=$1 AND "teamId"=$2 FOR UPDATE', selected.invitationId, selected.teamId); beforeStep();
      if (invitations.length > 1) throw Error('Join unconfirmed');
      return { team: teams[0], members, invitation: invitations[0] };
    };
    const permission = (scope: Awaited<ReturnType<typeof lock>>) => {
      if (!scope) return 'team_not_found';
      const invitation = scope.invitation;
      if (!invitation || invitation.id !== selected.invitationId || invitation.teamId !== selected.teamId || invitation.email !== selected.targetEmail || invitation.role !== selected.role || invitation.token !== token || invitation.expiresAt.toISOString() !== selected.expiresAt) return 'invitation_changed';
      if (selected.targetEmail !== own.email.toLowerCase()) return 'email_mismatch';
      if (invitation.expiresAt.getTime() <= Date.now()) return 'expired';
      if (scope.members.some(m => m.userId === own.userId)) return 'already_in_team';
      const teamMembers = scope.members.filter(m => m.teamId === selected.teamId);
      if (teamMembers.filter(m => m.role === 'owner').length !== 1 || teamMembers.some(m => !['owner', 'admin', 'member'].includes(m.role))) throw Error('Team inconsistent');
      if (!Number.isInteger(scope.team.maxMembers) || scope.team.maxMembers < 1 || teamMembers.length >= scope.team.maxMembers) return 'team_full';
      if (typeof scope.team.name !== 'string' || scope.team.name.trim().length < 2 || scope.team.name.length > 50) throw Error('Team inconsistent');
      return null;
    };
    const admission = await prisma.$transaction(async tx => {
      const scope = await lock(tx);
      const other = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM team_join_attempts WHERE ("userId"=$1 AND (key=$2 OR state<>'complete')) OR ("teamId"=$3 AND state<>'complete')
        UNION ALL SELECT id FROM team_creation_attempts WHERE "userId"=$1 AND (key=$2 OR state<>'complete')
        UNION ALL SELECT id FROM team_invitation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>'complete')
        UNION ALL SELECT id FROM team_invitation_revocation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>'complete')
        UNION ALL SELECT id FROM team_member_mutation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>'complete')
        UNION ALL SELECT id FROM team_exit_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>'complete')
        UNION ALL SELECT id FROM team_rename_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>'complete') LIMIT 1`, own.userId, key, selected.teamId); beforeStep();
      if (other.length) return { denied: 'team_join_unconfirmed' };
      const denied = permission(scope); if (denied) return { denied };
      const captured = Object.freeze({ id: randomUUID(), ...own, key, ...selected, teamName: scope!.team.name, membershipId: randomUUID() });
      const row = await tx.teamJoinAttempt.create({ data: { ...captured, state: 'pending' } }); beforeStep();
      return { captured, row };
    }, settings);
    if ('denied' in admission) { const error = admission.denied || 'team_join_unconfirmed'; return { ok: false, status: error === 'team_join_unconfirmed' ? 503 : error === 'email_mismatch' ? 403 : error === 'team_not_found' ? 404 : 409, error }; }
    const { captured } = admission;
    const exact = (row: Record<string, unknown> | null) => row?.state === 'pending' && Object.entries(captured).every(([k, v]) => row[k] === v);
    if (!exact(admission.row)) return uncertain();
    beforeStep();
    await prisma.$transaction(async tx => {
      const scope = await lock(tx); if (permission(scope) || scope!.team.name !== captured.teamName) throw Error('Join unconfirmed');
      const row = await tx.teamJoinAttempt.findUnique({ where: { id: captured.id } }); beforeStep(); if (!exact(row)) throw Error('Join unconfirmed');
      if (permission(scope)) throw Error('Join unconfirmed');
      // After the first effect, membership, consumption and completion are atomic
      // and belong to this producer even if the HTTP observation has retired.
      const member = await tx.teamMember.create({ data: { id: captured.membershipId, userId: own.userId, teamId: selected.teamId, role: selected.role } });
      if (member.id !== captured.membershipId || member.userId !== own.userId || member.teamId !== selected.teamId || member.role !== selected.role) throw Error('Join unconfirmed');
      const deleted = await tx.teamInvitation.deleteMany({ where: { id: selected.invitationId, teamId: selected.teamId, email: selected.targetEmail, role: selected.role, token, expiresAt: new Date(selected.expiresAt) } });
      if (deleted.count !== 1) throw Error('Join unconfirmed');
      const marked = await tx.teamJoinAttempt.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Join unconfirmed');
    }, settings);
    return { ok: true, ...own, key, operation: 'join', status: 'joined', teamId: selected.teamId, teamName: captured.teamName, invitationId: selected.invitationId, role: selected.role, expiresAt: selected.expiresAt, membershipId: captured.membershipId };
  } catch { return uncertain(); }
}
