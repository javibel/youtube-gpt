import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const idea = await prisma.dailyIdea.findUnique({
    where: { userId_date: { userId: session.user.id, date: todayUTC() } },
  });

  if (!idea) {
    return NextResponse.json({ ideas: null });
  }

  return NextResponse.json({ ideas: idea.ideas, date: idea.date });
}
