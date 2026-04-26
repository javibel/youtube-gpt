import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const feedbacks = await prisma.userFeedback.findMany({
    where: { submittedAt: { not: null } },
    orderBy: { submittedAt: 'desc' },
    take: 50,
    include: { user: { select: { email: true, name: true } } },
  });

  const pending = await prisma.userFeedback.count({
    where: { submittedAt: null },
  });

  return NextResponse.json({ feedbacks, pending });
}
