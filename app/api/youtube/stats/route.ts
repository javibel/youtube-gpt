import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Get snapshots from last 90 days, ordered ascending
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const snapshots = await prisma.channelSnapshot.findMany({
    where: {
      userId: session.user.id,
      recordedAt: { gte: ninetyDaysAgo },
    },
    orderBy: { recordedAt: 'asc' },
    select: {
      subscribers: true,
      totalViews: true,
      videoCount: true,
      recordedAt: true,
    },
  });

  if (snapshots.length === 0) {
    return NextResponse.json({ data: null });
  }

  // Convert BigInt to number for JSON serialization
  const points = snapshots.map(s => ({
    subscribers: s.subscribers,
    totalViews: Number(s.totalViews),
    videoCount: s.videoCount,
    recordedAt: s.recordedAt.toISOString(),
  }));

  // Calculate growth metrics
  const latest = points[points.length - 1];
  const now = Date.now();

  // Find comparison points (7d, 30d ago)
  function findClosest(daysAgo: number) {
    const target = now - daysAgo * 24 * 60 * 60 * 1000;
    let best = points[0];
    let bestDiff = Math.abs(new Date(best.recordedAt).getTime() - target);
    for (const p of points) {
      const diff = Math.abs(new Date(p.recordedAt).getTime() - target);
      if (diff < bestDiff) { best = p; bestDiff = diff; }
    }
    return best;
  }

  const week = findClosest(7);
  const month = findClosest(30);

  const growth = {
    subs7d: latest.subscribers - week.subscribers,
    subs30d: latest.subscribers - month.subscribers,
    views7d: latest.totalViews - week.totalViews,
    views30d: latest.totalViews - month.totalViews,
    videos7d: latest.videoCount - week.videoCount,
    videos30d: latest.videoCount - month.videoCount,
  };

  return NextResponse.json({
    data: {
      points,
      growth,
      latest,
    },
  });
}
