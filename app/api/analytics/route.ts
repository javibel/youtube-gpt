import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Simple token auth for dashboard
  const token = req.headers.get('x-dashboard-token') || req.nextUrl.searchParams.get('token');
  if (!token || token !== process.env.DASHBOARD_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const days = parseInt(req.nextUrl.searchParams.get('days') || '7');
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalViews, uniquePaths, viewsByPath, viewsByDay] = await Promise.all([
    // Total views
    prisma.pageView.count({ where: { createdAt: { gte: since } } }),

    // Unique paths
    prisma.pageView.groupBy({
      by: ['path'],
      where: { createdAt: { gte: since } },
      _count: true,
    }),

    // Views by path (top 20)
    prisma.pageView.groupBy({
      by: ['path'],
      where: { createdAt: { gte: since } },
      _count: true,
      orderBy: { _count: { path: 'desc' } },
      take: 20,
    }),

    // Views by day
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT DATE(created_at AT TIME ZONE 'UTC') as day, COUNT(*)::bigint as count
      FROM page_views
      WHERE created_at >= ${since}
      GROUP BY day
      ORDER BY day
    `,
  ]);

  // Top referrers
  const topReferrers = await prisma.pageView.groupBy({
    by: ['referrer'],
    where: {
      createdAt: { gte: since },
      referrer: { not: null },
    },
    _count: true,
    orderBy: { _count: { referrer: 'desc' } },
    take: 10,
  });

  // Top countries
  const topCountries = await prisma.pageView.groupBy({
    by: ['country'],
    where: {
      createdAt: { gte: since },
      country: { not: null },
    },
    _count: true,
    orderBy: { _count: { country: 'desc' } },
    take: 10,
  });

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    totalViews,
    uniquePages: uniquePaths.length,
    viewsByPath: viewsByPath.map(r => ({ path: r.path, views: r._count })),
    viewsByDay: viewsByDay.map(r => ({ day: String(r.day), views: Number(r.count) })),
    topReferrers: topReferrers.map(r => ({ referrer: r.referrer, views: r._count })),
    topCountries: topCountries.map(r => ({ country: r.country, views: r._count })),
  });
}
