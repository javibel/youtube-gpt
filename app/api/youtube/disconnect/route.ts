import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await prisma.youtubeToken.deleteMany({ where: { userId: session.user.id } });
    return NextResponse.json({ ok: true, userId: session.user.id });
  } catch { return NextResponse.json({ error: 'Disconnect unavailable' }, { status: 503 }); }
}
