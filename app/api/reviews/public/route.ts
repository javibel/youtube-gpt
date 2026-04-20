import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const reviews = await prisma.review.findMany({
    where: { status: 'approved' },
    orderBy: { updatedAt: 'desc' },
    take: 12,
    select: {
      id: true,
      rating: true,
      text: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  return NextResponse.json({ reviews });
}
