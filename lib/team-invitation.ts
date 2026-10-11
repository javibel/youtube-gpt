import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { TeamOwner } from '@/lib/team-read-contract';
import { prepareInvitationEmail, sendInvitationEmail } from '@/lib/team-invitation-email';

export interface TeamInvitationInput { teamId: string; memberId: string; previousRole: 'owner' | 'admin'; targetEmail: string; role: 'admin' | 'member' }
export type TeamInvitationResult = ({ ok: true; userId: string; email: string; key: string; operation: 'invite'; status: 'created'; emailStatus: 'provider-accepted'; invitationId: string; expiresAt: string } & TeamInvitationInput) | { ok: false; status: number; error: string };
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
export function validTeamInvitation(v: unknown, key: unknown): v is TeamInvitationInput {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const b = v as Record<string, unknown>;
  return id(key) && id(b.teamId) && id(b.memberId) && ['owner', 'admin'].includes(b.previousRole as string)
    && ['member', 'admin'].includes(b.role as string) && typeof b.targetEmail === 'string' && b.targetEmail.length <= 320
    && b.targetEmail === b.targetEmail.trim().toLowerCase() && /^[^\s@<>"\x00-\x1f\x7f]+@[^\s@<>"\x00-\x1f\x7f]+\.[^\s@<>"\x00-\x1f\x7f]+$/.test(b.targetEmail);
}
const uncertain = (): TeamInvitationResult => ({ ok: false, status: 503, error: 'team_invitation_unconfirmed' });
type Actor = { id: string; userId: string; teamId: string; role: string };
type Team = { id: string; name: string; maxMembers: number };
const settings = { maxWait: 10_000, timeout: 15_000 };

// Rows retain denial after SQL/mail uncertainty. Only this live invocation holds
// the token and original transport capability; no lookup can reconstruct them.
export async function inviteTeamOriginal(owner: TeamOwner, input: unknown, key: string, beforeStep: () => void): Promise<TeamInvitationResult> {
  try {
    beforeStep();
    if (!validTeamInvitation(input, key) || !id(owner.userId) || typeof owner.email !== 'string' || !owner.email) return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email });
    const origin = process.env.APP_PUBLIC_URL;
    const selected = Object.freeze({ teamId: input.teamId, memberId: input.memberId, previousRole: input.previousRole, targetEmail: input.targetEmail, role: input.role });
    const captured = Object.freeze({ id: randomUUID(), ...own, key, ...selected, invitationId: randomUUID(), expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString() });
    const token = randomBytes(32).toString('hex');
    const lock = async (tx: Prisma.TransactionClient) => {
      beforeStep();
      const teams = await tx.$queryRawUnsafe<Team[]>('SELECT id,name,"maxMembers" FROM teams WHERE id=$1 FOR UPDATE', selected.teamId);
      beforeStep(); if (teams.length !== 1 || teams[0].id !== selected.teamId) return null;
      const users = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId);
      beforeStep(); if (users.length !== 1 || users[0].id !== own.userId || users[0].email !== own.email) throw Error('Invitation unconfirmed');
      const actors = await tx.$queryRawUnsafe<Actor[]>('SELECT id,"userId","teamId",role FROM team_members WHERE "teamId"=$1 AND "userId"=$2 FOR UPDATE', selected.teamId, own.userId);
      beforeStep(); if (actors.length > 1) throw Error('Invitation unconfirmed');
      return { team: teams[0], actor: actors[0] };
    };
    const permission = (scope: Awaited<ReturnType<typeof lock>>) => !scope ? 'team_not_found'
      : !scope.actor || !['owner', 'admin'].includes(scope.actor.role) ? 'not_authorized'
      : scope.actor.id !== selected.memberId || scope.actor.userId !== own.userId || scope.actor.teamId !== selected.teamId || scope.actor.role !== selected.previousRole ? 'team_changed' : null;
    const target = async (tx: Prisma.TransactionClient, team: Team) => {
      const users = await tx.$queryRawUnsafe<Array<{ id: string; lang: string }>>('SELECT id,lang FROM users WHERE lower(email)=$1 FOR SHARE', selected.targetEmail);
      beforeStep(); if (users.length > 1) throw Error('Ambiguous recipient');
      if (users[0]) { const member = await tx.teamMember.findFirst({ where: { userId: users[0].id } }); beforeStep(); if (member) return { denied: 'already_member' }; }
      const existing = await tx.teamInvitation.findUnique({ where: { teamId_email: { teamId: selected.teamId, email: selected.targetEmail } } });
      beforeStep(); if (existing) return { denied: existing.expiresAt.getTime() > Date.now() ? 'already_invited' : 'expired_invitation_requires_revocation' };
      const members = await tx.teamMember.count({ where: { teamId: selected.teamId } }); beforeStep();
      const invitations = await tx.teamInvitation.count({ where: { teamId: selected.teamId, expiresAt: { gt: new Date() } } }); beforeStep();
      if (!Number.isInteger(team.maxMembers) || team.maxMembers < 1 || members + invitations >= team.maxMembers) return { denied: 'team_full' };
      return { language: users[0]?.lang ?? 'es' };
    };
    const admission = await prisma.$transaction(async tx => {
      const scope = await lock(tx);
      const prior = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM team_invitation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_member_mutation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_invitation_revocation_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_exit_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_rename_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') UNION ALL SELECT id FROM team_join_attempts WHERE ("userId"=$1 AND key=$2) OR ("teamId"=$3 AND state<>\'complete\') LIMIT 1', own.userId, key, selected.teamId);
      beforeStep(); if (prior.length) return { denied: 'team_invitation_unconfirmed' };
      const denied = permission(scope); if (denied) return { denied };
      const recipient = await target(tx, scope!.team); if ('denied' in recipient) return { denied: recipient.denied };
      // Reject unsafe origin/preparation before reserving or creating anything.
      prepareInvitationEmail({ email: selected.targetEmail, teamName: scope!.team.name, inviter: own.email, token, language: recipient.language, expiresAt: captured.expiresAt }, origin);
      const row = await tx.teamInvitationAttempt.create({ data: { ...captured, state: 'pending' } }); beforeStep(); return { row };
    }, settings);
    if ('denied' in admission) { const error = admission.denied || 'team_invitation_unconfirmed'; return { ok: false, status: error === 'team_not_found' ? 404 : error === 'not_authorized' ? 403 : error === 'team_invitation_unconfirmed' ? 503 : 409, error }; }
    const exact = (row: Record<string, unknown> | null) => row?.state === 'pending' && Object.entries(captured).every(([k, v]) => row[k] === v);
    if (!exact(admission.row)) return uncertain();
    const packet = await prisma.$transaction(async tx => {
      const scope = await lock(tx); if (permission(scope)) throw Error('Invitation unconfirmed');
      const row = await tx.teamInvitationAttempt.findUnique({ where: { id: captured.id } }); beforeStep(); if (!exact(row)) throw Error('Invitation unconfirmed');
      const recipient = await target(tx, scope!.team); if ('denied' in recipient) throw Error('Invitation unconfirmed');
      const prepared = prepareInvitationEmail({ email: selected.targetEmail, teamName: scope!.team.name, inviter: own.email, token, language: recipient.language, expiresAt: captured.expiresAt }, origin);
      beforeStep();
      await tx.teamInvitation.create({ data: { id: captured.invitationId, teamId: selected.teamId, email: selected.targetEmail, role: selected.role, token, expiresAt: new Date(captured.expiresAt) } });
      return { prepared, name: scope!.team.name };
    }, settings);
    await prisma.$transaction(async tx => {
      const scope = await lock(tx); if (permission(scope) || scope!.team.name !== packet.name) throw Error('Invitation unconfirmed');
      const row = await tx.teamInvitationAttempt.findUnique({ where: { id: captured.id } }); beforeStep(); if (!exact(row)) throw Error('Invitation unconfirmed');
      const invitation = await tx.$queryRawUnsafe<Array<{ id: string; email: string; role: string; token: string; expiresAt: Date }>>('SELECT id,email,role,token,"expiresAt" FROM team_invitations WHERE "teamId"=$1 AND id=$2 FOR UPDATE', selected.teamId, captured.invitationId);
      beforeStep(); const created = invitation[0];
      if (invitation.length !== 1 || created.email !== selected.targetEmail || created.role !== selected.role || created.token !== token || created.expiresAt.toISOString() !== captured.expiresAt || created.expiresAt.getTime() <= Date.now()) throw Error('Invitation unconfirmed');
      const recipients = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE lower(email)=$1 FOR SHARE', selected.targetEmail);
      beforeStep(); if (recipients.length > 1) throw Error('Ambiguous recipient');
      if (recipients[0]) { const member = await tx.teamMember.findFirst({ where: { userId: recipients[0].id } }); beforeStep(); if (member) throw Error('Recipient already joined'); }
      // Once invoked, completion belongs to this producer, even if HTTP retires.
      await sendInvitationEmail(packet.prepared, captured.id);
      const marked = await tx.teamInvitationAttempt.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Invitation unconfirmed');
    }, settings);
    return { ok: true, ...own, key, ...selected, operation: 'invite', status: 'created', emailStatus: 'provider-accepted', invitationId: captured.invitationId, expiresAt: captured.expiresAt };
  } catch { return uncertain(); }
}
