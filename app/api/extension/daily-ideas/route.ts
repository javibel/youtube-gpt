import { NextResponse } from 'next/server';
import { getExtensionUser } from '@/lib/extension-auth';
import { prisma } from '@/lib/prisma';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const ext = await getExtensionUser(request);
  if (!ext) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });

  const idea = await prisma.dailyIdea.findUnique({
    where: { userId_date: { userId: ext.user.id, date: todayUTC() } },
  });

  if (!idea) {
    // Distinguish "no channel connected" from "connected, today's batch not generated yet"
    // so the extension shows the right message (was wrongly telling connected users to connect).
    const yt = await prisma.youtubeToken.findUnique({
      where: { userId: ext.user.id },
      select: { channelId: true },
    });
    return NextResponse.json({ ideas: null, channelConnected: !!yt?.channelId });
  }

  return NextResponse.json({ ideas: idea.ideas, date: idea.date, channelConnected: true });
}
