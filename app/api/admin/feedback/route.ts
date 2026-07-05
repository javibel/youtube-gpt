import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guards';

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

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
