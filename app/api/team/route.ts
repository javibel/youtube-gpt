import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';
import { decodeTeamRead } from '@/lib/team-read-contract';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// GET — get user's team (if any)
export async function GET(request?: Request) {
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Team unavailable')); } };
  const timer = setTimeout(retire, 25_000);
  request?.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request?.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Team unavailable'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id) return reply({ error: 'Unauthorized' }, 401);
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email ?? null });
      const observedAt = new Date().toISOString();
      // Two rows detect ambiguous membership. The projection excludes invitation
      // tokens, private user fields and unnecessary team metadata at the SQL edge.
      const memberships = await prisma.teamMember.findMany({
        where: { userId: owner.userId }, take: 2,
        select: { id: true, userId: true, teamId: true, role: true, team: { select: {
          id: true, name: true, slug: true, plan: true, maxMembers: true,
          members: { take: 1001, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }], select: { id: true, userId: true, teamId: true, role: true, joinedAt: true, user: { select: { id: true, name: true, email: true } } } },
          invitations: { take: 1001, where: { expiresAt: { gt: new Date(observedAt) } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, teamId: true, email: true, role: true, expiresAt: true } },
        } } },
      });
      check();
      if (!memberships.length) return reply({ ...owner, observedAt, team: null, role: null });
      if (memberships.length !== 1) throw Error('Team unavailable');
      const membership = memberships[0], team = membership.team;
      if (membership.userId !== owner.userId || membership.teamId !== team.id
        || team.members.some(m => m.teamId !== team.id || m.userId !== m.user.id)
        || team.invitations.some(i => i.teamId !== team.id)
        || !team.members.some(m => m.id === membership.id && m.userId === owner.userId && m.role === membership.role)) throw Error('Team unavailable');
      const data = decodeTeamRead({ ...owner, observedAt, role: membership.role, team: { ...team,
        members: team.members.map(m => ({ id: m.id, role: m.role, joinedAt: m.joinedAt.toISOString(), user: m.user })),
        invitations: membership.role === 'member' ? [] : team.invitations.map(i => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() })),
      } }, owner);
      check(); return reply({ ...owner, ...data });
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'team_read_unavailable' }, 503); }
  finally { clearTimeout(timer); request?.signal.removeEventListener('abort', retire); }
}

// POST — create team
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check user doesn't already belong to a team
  const existing = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  });
  if (existing) {
    return NextResponse.json({ error: 'already_in_team' }, { status: 400 });
  }

  // Check user has an active subscription (Team/Agency requires at least Pro)
  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json({ error: 'Team name required (min 2 chars)' }, { status: 400 });
  }

  const baseSlug = slugify(name.trim());
  let slug = baseSlug;
  let attempt = 0;
  let team;

  // Retry loop handles race condition where slug is taken between check and create
  for (;;) {
    try {
      team = await prisma.team.create({
        data: {
          name: name.trim(),
          slug,
          members: {
            create: { userId: session.user.id, role: 'owner' },
          },
        },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          invitations: true,
        },
      });
      break;
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === 'P2002' && attempt < 5) {
        attempt++;
        slug = `${baseSlug}-${attempt}`;
        continue;
      }
      throw e;
    }
  }

  return NextResponse.json({ team, role: 'owner' }, { status: 201 });
}

// PATCH — update team name
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
  });
  if (!membership) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json({ error: 'Team name required' }, { status: 400 });
  }

  await prisma.team.update({
    where: { id: membership.teamId },
    data: { name: name.trim() },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — leave or delete team
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
    include: { team: { include: { members: true } } },
  });
  if (!membership) {
    return NextResponse.json({ error: 'Not in a team' }, { status: 400 });
  }

  if (membership.role === 'owner') {
    // Owner deletes the entire team
    await prisma.team.delete({ where: { id: membership.teamId } });
    return NextResponse.json({ ok: true, deleted: true });
  }

  // Members just leave
  await prisma.teamMember.delete({ where: { id: membership.id } });
  return NextResponse.json({ ok: true, left: true });
}
