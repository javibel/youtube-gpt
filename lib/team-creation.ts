import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { hasPaidAccess } from '@/lib/plans';
import type { TeamOwner } from '@/lib/team-read-contract';
import type { Prisma } from '@prisma/client';

export type TeamCreationResult = { ok: true; userId: string; email: string; key: string; name: string; teamId: string; slug: string; role: 'owner'; membershipId: string; createdAt: string }
  | { ok: false; status: number; error: string };
const uncertain = (): TeamCreationResult => ({ ok: false, status: 503, error: 'team_create_unconfirmed' });
export function validTeamCreation(input: unknown, key: unknown): input is { name: string } {
  return typeof key === 'string' && /^[\w-]{1,128}$/.test(key) && !!input && typeof input === 'object' && !Array.isArray(input)
    && 'name' in input && typeof input.name === 'string' && input.name.trim().length >= 2 && input.name.trim().length <= 50;
}

// Admission rows only deny fresh work. No exported completion/recovery method
// accepts IDs or stored JSON; the original closure retains its own fresh ack.
export async function createTeamOriginal(owner: TeamOwner, input: unknown, key: string, beforeStep: () => void): Promise<TeamCreationResult> {
  try {
    beforeStep(); if (!validTeamCreation(input, key) || !owner.userId || typeof owner.email !== 'string') return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email }), name = input.name.trim(), id = randomUUID();
    const slug = (name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'team') + '-' + randomUUID();
    const lock = async (tx: Prisma.TransactionClient) => {
      beforeStep(); const users = await tx.$queryRawUnsafe<Array<{ id: string; email: string | null }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId); beforeStep();
      if (users.length !== 1 || users[0].id !== own.userId || users[0].email !== own.email) throw Error('Team unconfirmed');
      await tx.$queryRawUnsafe('SELECT "userId" FROM subscriptions WHERE "userId"=$1 FOR UPDATE', own.userId); beforeStep();
      const sub = await tx.subscription.findUnique({ where: { userId: own.userId }, select: { status: true, stripeCustomerId: true, currentPeriodEnd: true } }); beforeStep();
      return hasPaidAccess(sub);
    };
    const admission = await prisma.$transaction(async tx => {
      if (!await lock(tx)) return { denied: 'pro_required' as const };
      const prior = await tx.teamCreationAttempt.findFirst({ where: { userId: own.userId, OR: [{ key }, { state: { not: 'complete' } }] } }); beforeStep();
      if (prior) return { denied: 'team_create_unconfirmed' as const };
      const existing = await tx.teamMember.findFirst({ where: { userId: own.userId } }); beforeStep();
      if (existing) return { denied: 'already_in_team' as const };
      const row = await tx.teamCreationAttempt.create({ data: { id, userId: own.userId, email: own.email, key, name, state: 'pending' } }); beforeStep();
      return { row };
    }, { maxWait: 10_000, timeout: 15_000 });
    if ('denied' in admission) return { ok: false, status: admission.denied === 'pro_required' ? 403 : admission.denied === 'already_in_team' ? 400 : 503, error: admission.denied || 'team_create_unconfirmed' };
    if (admission.row.id !== id || admission.row.userId !== own.userId || admission.row.email !== own.email || admission.row.key !== key || admission.row.name !== name || admission.row.state !== 'pending') return uncertain();
    beforeStep();
    const result = await prisma.$transaction(async tx => {
      if (!await lock(tx)) throw Error('Team unconfirmed');
      const attempt = await tx.teamCreationAttempt.findUnique({ where: { id } }); beforeStep();
      if (!attempt || attempt.userId !== own.userId || attempt.email !== own.email || attempt.key !== key || attempt.name !== name || attempt.state !== 'pending') throw Error('Team unconfirmed');
      const existing = await tx.teamMember.findFirst({ where: { userId: own.userId } }); beforeStep();
      if (existing) throw Error('Team unconfirmed');
      // From this invocation onward the original transaction alone creates the
      // team/owner and terminal marker atomically, even if HTTP has retired.
      const team = await tx.team.create({ data: { name, slug, plan: 'team', maxMembers: 5, members: { create: { userId: own.userId, role: 'owner' } } }, select: { id: true, name: true, slug: true, createdAt: true, members: { select: { id: true, userId: true, role: true } } } });
      if (team.name !== name || team.slug !== slug || team.members.length !== 1 || team.members[0].userId !== own.userId || team.members[0].role !== 'owner') throw Error('Team unconfirmed');
      const marked = await tx.teamCreationAttempt.updateMany({ where: { id, userId: own.userId, email: own.email, key, name, state: 'pending' }, data: { state: 'complete', teamId: team.id } });
      if (marked.count !== 1) throw Error('Team unconfirmed');
      return { team, membership: team.members[0] };
    }, { maxWait: 10_000, timeout: 15_000 });
    return { ok: true, ...own, key, name, teamId: result.team.id, slug: result.team.slug, role: 'owner', membershipId: result.membership.id, createdAt: result.team.createdAt.toISOString() };
  } catch { return uncertain(); }
}
