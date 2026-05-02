import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// PATCH — update member role
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id, role: 'owner' },
  });
  if (!membership) {
    return NextResponse.json({ error: 'Only team owner can change roles' }, { status: 403 });
  }

  const { memberId, role } = await req.json();
  if (!memberId || !['admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  // Can't change own role
  const target = await prisma.teamMember.findFirst({
    where: { id: memberId, teamId: membership.teamId },
  });
  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }
  if (target.userId === session.user.id) {
    return NextResponse.json({ error: 'Cannot change own role' }, { status: 400 });
  }

  await prisma.teamMember.update({
    where: { id: memberId },
    data: { role },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — remove member
export async function DELETE(req: NextRequest) {
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

  const { memberId } = await req.json();
  if (!memberId) {
    return NextResponse.json({ error: 'Member ID required' }, { status: 400 });
  }

  const target = await prisma.teamMember.findFirst({
    where: { id: memberId, teamId: membership.teamId },
  });
  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  // Can't remove self (use DELETE /api/team for that)
  if (target.userId === session.user.id) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
  }

  // Admins can't remove other admins or the owner
  if (membership.role === 'admin' && target.role !== 'member') {
    return NextResponse.json({ error: 'Admins can only remove members' }, { status: 403 });
  }

  await prisma.teamMember.delete({ where: { id: memberId } });

  return NextResponse.json({ ok: true });
}
