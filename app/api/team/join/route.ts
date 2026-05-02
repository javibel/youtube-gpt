import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { token } = await req.json();
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const invitation = await prisma.teamInvitation.findUnique({
    where: { token },
    include: { team: { include: { members: true } } },
  });

  if (!invitation) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 400 });
  }

  // Check email matches
  if (invitation.email !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: 'email_mismatch' }, { status: 403 });
  }

  // Check not already a member of any team
  const existingMembership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  });
  if (existingMembership) {
    return NextResponse.json({ error: 'already_in_team' }, { status: 400 });
  }

  // Check team is not full
  if (invitation.team.members.length >= invitation.team.maxMembers) {
    return NextResponse.json({ error: 'team_full' }, { status: 400 });
  }

  // Add member and delete invitation
  await prisma.$transaction([
    prisma.teamMember.create({
      data: {
        teamId: invitation.teamId,
        userId: session.user.id,
        role: invitation.role,
      },
    }),
    prisma.teamInvitation.delete({ where: { id: invitation.id } }),
  ]);

  return NextResponse.json({ ok: true, teamName: invitation.team.name });
}
