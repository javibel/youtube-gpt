import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

// GET: list tracked competitors with latest snapshots
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { status: true },
  });
  if (sub?.status !== 'active') {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const competitors = await prisma.trackedCompetitor.findMany({
    where: { userId: session.user.id },
    orderBy: { addedAt: 'asc' },
    include: {
      snapshots: {
        orderBy: { recordedAt: 'asc' },
        where: { recordedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      },
    },
  });

  const result = competitors.map(c => {
    const snaps = c.snapshots.map(s => ({
      subscribers: s.subscribers,
      totalViews: Number(s.totalViews),
      videoCount: s.videoCount,
      recordedAt: s.recordedAt.toISOString(),
    }));

    // Growth calculations
    const latest = snaps.length > 0 ? snaps[snaps.length - 1] : null;
    const now = Date.now();
    function findClosest(daysAgo: number) {
      if (snaps.length === 0) return null;
      const target = now - daysAgo * 24 * 60 * 60 * 1000;
      let best = snaps[0];
      let bestDiff = Math.abs(new Date(best.recordedAt).getTime() - target);
      for (const p of snaps) {
        const diff = Math.abs(new Date(p.recordedAt).getTime() - target);
        if (diff < bestDiff) { best = p; bestDiff = diff; }
      }
      return best;
    }
    const week = findClosest(7);
    const month = findClosest(30);

    return {
      id: c.id,
      channelId: c.channelId,
      channelName: c.channelName,
      channelThumb: c.channelThumb,
      subscribers: c.subscribers,
      totalViews: Number(c.totalViews),
      videoCount: c.videoCount,
      addedAt: c.addedAt.toISOString(),
      snapshots: snaps,
      growth: latest && week && month ? {
        subs7d: latest.subscribers - week.subscribers,
        subs30d: latest.subscribers - month.subscribers,
        views7d: latest.totalViews - week.totalViews,
        views30d: latest.totalViews - month.totalViews,
      } : null,
    };
  });

  return NextResponse.json({ competitors: result });
}

// POST: add a competitor to track
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { status: true },
  });
  if (sub?.status !== 'active') {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  // Check limit (10 max)
  const count = await prisma.trackedCompetitor.count({
    where: { userId: session.user.id },
  });
  if (count >= 10) {
    return NextResponse.json({ error: 'limit_reached' }, { status: 400 });
  }

  const body = await request.json();
  const url: string = body.url || '';

  // Extract channel identifier from URL
  let channelId: string | null = null;
  let handle: string | null = null;

  const idMatch = url.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  const handleMatch = url.match(/youtube\.com\/@([\w.-]+)/);
  const customMatch = url.match(/youtube\.com\/c\/([\w.-]+)/);

  if (idMatch) {
    channelId = idMatch[1];
  } else if (handleMatch) {
    handle = handleMatch[1];
  } else if (customMatch) {
    handle = customMatch[1];
  } else if (url.startsWith('UC') && url.length >= 20) {
    channelId = url;
  } else if (url.startsWith('@')) {
    handle = url.slice(1);
  } else {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  if (!YT_API_KEY) {
    return NextResponse.json({ error: 'api_key_missing' }, { status: 500 });
  }

  try {
    // Resolve handle to channel ID if needed
    if (!channelId && handle) {
      const searchRes = await fetch(
        `${YT_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=1&key=${YT_API_KEY}`
      );
      const searchData = await searchRes.json();
      channelId = searchData.items?.[0]?.snippet?.channelId || null;
      if (!channelId) {
        return NextResponse.json({ error: 'channel_not_found' }, { status: 404 });
      }
    }

    // Check not already tracked
    const existing = await prisma.trackedCompetitor.findUnique({
      where: { userId_channelId: { userId: session.user.id, channelId: channelId! } },
    });
    if (existing) {
      return NextResponse.json({ error: 'already_tracked' }, { status: 409 });
    }

    // Fetch channel info
    const chRes = await fetch(
      `${YT_BASE}/channels?part=snippet,statistics&id=${channelId}&key=${YT_API_KEY}`
    );
    const chData = await chRes.json();
    const ch = chData.items?.[0];
    if (!ch) {
      return NextResponse.json({ error: 'channel_not_found' }, { status: 404 });
    }

    const subs = parseInt(ch.statistics.subscriberCount || '0', 10);
    const views = BigInt(ch.statistics.viewCount || '0');
    const vids = parseInt(ch.statistics.videoCount || '0', 10);

    const competitor = await prisma.trackedCompetitor.create({
      data: {
        userId: session.user.id,
        channelId: channelId!,
        channelName: ch.snippet.title,
        channelThumb: ch.snippet.thumbnails?.default?.url || null,
        subscribers: subs,
        totalViews: views,
        videoCount: vids,
      },
    });

    // Create initial snapshot
    await prisma.competitorSnapshot.create({
      data: {
        competitorId: competitor.id,
        subscribers: subs,
        totalViews: views,
        videoCount: vids,
      },
    });

    return NextResponse.json({
      ok: true,
      competitor: {
        id: competitor.id,
        channelId: channelId,
        channelName: ch.snippet.title,
        channelThumb: ch.snippet.thumbnails?.default?.url,
        subscribers: subs,
        totalViews: Number(views),
        videoCount: vids,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: remove a tracked competitor
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const id: string = body.id || '';
  if (!id) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }

  // Verify ownership
  const comp = await prisma.trackedCompetitor.findUnique({ where: { id } });
  if (!comp || comp.userId !== session.user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await prisma.trackedCompetitor.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
