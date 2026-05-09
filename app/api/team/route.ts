import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';

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
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
    include: {
      team: {
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
            orderBy: { joinedAt: 'asc' },
          },
          invitations: {
            where: { expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ team: null });
  }

  return NextResponse.json({
    team: membership.team,
    role: membership.role,
  });
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
