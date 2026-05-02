import { NextResponse } from 'next/server';
import { getExtensionUser } from '@/lib/extension-auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  const extUser = await getExtensionUser(request);
  if (!extUser) {
    return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  }

  // Get YouTube token info (cached channel data)
  const yt = await prisma.youtubeToken.findUnique({
    where: { userId: extUser.user.id },
    select: {
      channelId: true,
      channelName: true,
      channelThumb: true,
      subscribers: true,
      totalViews: true,
      videoCount: true,
    },
  });

  if (!yt?.channelId) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const subs = parseInt(yt.subscribers || '0', 10);
  const totalViews = parseInt(yt.totalViews || '0', 10);
  const videoCount = parseInt(yt.videoCount || '0', 10);

  // Get last 30 snapshots for sparkline (daily snapshots)
  const snapshots = await prisma.channelSnapshot.findMany({
    where: { userId: extUser.user.id },
    orderBy: { recordedAt: 'desc' },
    take: 30,
    select: {
      subscribers: true,
      totalViews: true,
      videoCount: true,
      recordedAt: true,
    },
  });

  // Calculate growth deltas
  const latest = snapshots[0];
  const weekAgo = snapshots.find(s => {
    const diff = Date.now() - s.recordedAt.getTime();
    return diff >= 6 * 24 * 60 * 60 * 1000; // ~6 days
  });
  const monthAgo = snapshots.find(s => {
    const diff = Date.now() - s.recordedAt.getTime();
    return diff >= 27 * 24 * 60 * 60 * 1000; // ~27 days
  });

  const subsNow = latest?.subscribers ?? subs;
  const growth7d = weekAgo ? subsNow - weekAgo.subscribers : 0;
  const growth30d = monthAgo ? subsNow - monthAgo.subscribers : 0;

  const viewsNow = latest ? Number(latest.totalViews) : totalViews;
  const viewsGrowth7d = weekAgo ? viewsNow - Number(weekAgo.totalViews) : 0;
  const viewsGrowth30d = monthAgo ? viewsNow - Number(monthAgo.totalViews) : 0;

  // Monetization progress
  // Requirements: 1000 subs + 4000 hours watch time (we approximate from views)
  const subsPct = Math.min(100, Math.round((subsNow / 1000) * 100));
  // Estimate watch hours from views (rough: avg 4 min per view = 0.067h)
  const estWatchHours = Math.round(totalViews * 0.067);
  const watchPct = Math.min(100, Math.round((estWatchHours / 4000) * 100));

  // ETA calculation (days to reach 1000 subs based on 30d growth rate)
  let subsEtaDays: number | null = null;
  if (subsNow < 1000 && growth30d > 0) {
    const remaining = 1000 - subsNow;
    const dailyRate = growth30d / 30;
    subsEtaDays = Math.ceil(remaining / dailyRate);
  }

  // Sparkline data (reversed to chronological order, subs only)
  const sparkline = snapshots.map(s => ({
    subs: s.subscribers,
    views: Number(s.totalViews),
    date: s.recordedAt.toISOString().slice(0, 10),
  })).reverse();

  return NextResponse.json({
    channel: {
      name: yt.channelName || '',
      thumb: yt.channelThumb || '',
      subs: subsNow,
      totalViews: viewsNow,
      videoCount,
    },
    growth: {
      subs7d: growth7d,
      subs30d: growth30d,
      views7d: viewsGrowth7d,
      views30d: viewsGrowth30d,
    },
    monetization: {
      subsPct,
      watchPct,
      subsEtaDays,
      estWatchHours,
    },
    sparkline,
    isPro: extUser.isPro,
  });
}
