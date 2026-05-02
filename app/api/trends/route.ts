import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';

// GET — list user's trend alerts
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const alerts = await prisma.trendAlert.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const unreadCount = alerts.filter(a => !a.read).length;

  return NextResponse.json({ alerts, unreadCount });
}

// PUT — mark alerts as read
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ids = body.ids as string[];

  if (Array.isArray(ids) && ids.length > 0) {
    await prisma.trendAlert.updateMany({
      where: { id: { in: ids }, userId: session.user.id },
      data: { read: true },
    });
  } else {
    // Mark all as read
    await prisma.trendAlert.updateMany({
      where: { userId: session.user.id, read: false },
      data: { read: true },
    });
  }

  return NextResponse.json({ ok: true });
}
