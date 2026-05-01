import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';

export const maxDuration = 60;

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find all Pro users with a connected YouTube channel
  const users = await prisma.youtubeToken.findMany({
    where: {
      channelId: { not: null },
      user: { subscription: { status: 'active' } },
    },
    select: { userId: true },
  });

  let snapped = 0;
  let errors = 0;

  for (const { userId } of users) {
    try {
      const token = await getAccessToken(userId);
      if (!token) continue;

      const res = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) continue;

      const data = await res.json();
      const stats = data.items?.[0]?.statistics;
      if (!stats) continue;

      const subscribers = parseInt(stats.subscriberCount || '0', 10);
      const totalViews = BigInt(stats.viewCount || '0');
      const videoCount = parseInt(stats.videoCount || '0', 10);

      // Only snapshot if at least 6h since last snapshot for this user
      const lastSnapshot = await prisma.channelSnapshot.findFirst({
        where: { userId },
        orderBy: { recordedAt: 'desc' },
      });

      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      if (lastSnapshot && lastSnapshot.recordedAt > sixHoursAgo) continue;

      await prisma.channelSnapshot.create({
        data: { userId, subscribers, totalViews, videoCount },
      });

      // Also update YoutubeToken with latest values
      await prisma.youtubeToken.update({
        where: { userId },
        data: {
          subscribers: stats.subscriberCount,
          totalViews: stats.viewCount,
          videoCount: stats.videoCount,
        },
      });

      snapped++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ ok: true, users: users.length, snapped, errors });
}
