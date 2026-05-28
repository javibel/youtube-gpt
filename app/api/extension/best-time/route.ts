import { NextResponse } from 'next/server';
import { getExtensionUser } from '@/lib/extension-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const ext = await getExtensionUser(request);
  if (!ext) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });

  const cached = await prisma.bestTimeAnalysis.findUnique({
    where: { userId: ext.user.id },
  });

  if (!cached) return NextResponse.json({ data: null });

  return NextResponse.json({
    data: {
      topSlots: cached.topSlots,
      aiTip: cached.aiTip,
      videoCount: cached.videoCount,
      analyzedAt: cached.analyzedAt.toISOString(),
    },
  });
}
