import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';

export const maxDuration = 60;

interface TrafficRow { insightTrafficSourceType: string; views: number; estimatedMinutesWatched: number }
interface CountryRow { country: string; views: number; estimatedMinutesWatched: number }
interface VideoRow { video: string; views: number; estimatedMinutesWatched: number; averageViewDuration: number; likes: number; subscribersGained: number }
interface DailyRow { day: string; views: number; estimatedMinutesWatched: number; subscribersGained: number; subscribersLost: number }

async function queryAnalytics(token: string, channelId: string, params: Record<string, string>) {
  const base = 'https://youtubeanalytics.googleapis.com/v2/reports';
  const qs = new URLSearchParams({ ids: `channel==${channelId}`, ...params });
  const res = await fetch(`${base}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Analytics API ${res.status}`);
  }
  return res.json();
}

function toRows<T>(data: { columnHeaders: { name: string }[]; rows?: unknown[][] }): T[] {
  if (!data.rows?.length) return [];
  const headers = data.columnHeaders.map(h => h.name);
  return data.rows.map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj as T;
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const yt = await prisma.youtubeToken.findUnique({ where: { userId: session.user.id } });
  if (!yt?.channelId) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const token = await getAccessToken(session.user.id);
  if (!token) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  const now = new Date();
  const endDate = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10); // 2 days ago (analytics delay)
  const startDate28 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const startDate90 = new Date(now.getTime() - 92 * 86400000).toISOString().slice(0, 10);

  try {
    // Run queries in parallel
    const [overviewRes, trafficRes, countryRes, topVideosRes, dailyRes] = await Promise.all([
      // Overview metrics (28 days)
      queryAnalytics(token, yt.channelId, {
        startDate: startDate28,
        endDate,
        metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares',
      }),
      // Traffic sources (28 days)
      queryAnalytics(token, yt.channelId, {
        startDate: startDate28,
        endDate,
        metrics: 'views,estimatedMinutesWatched',
        dimensions: 'insightTrafficSourceType',
        sort: '-views',
      }),
      // Top countries (28 days)
      queryAnalytics(token, yt.channelId, {
        startDate: startDate28,
        endDate,
        metrics: 'views,estimatedMinutesWatched',
        dimensions: 'country',
        sort: '-views',
        maxResults: '10',
      }),
      // Top videos (28 days)
      queryAnalytics(token, yt.channelId, {
        startDate: startDate28,
        endDate,
        metrics: 'views,estimatedMinutesWatched,averageViewDuration,likes,subscribersGained',
        dimensions: 'video',
        sort: '-views',
        maxResults: '10',
      }),
      // Daily timeline (90 days)
      queryAnalytics(token, yt.channelId, {
        startDate: startDate90,
        endDate,
        metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost',
        dimensions: 'day',
        sort: 'day',
      }),
    ]);

    // Parse overview (single row)
    const ovHeaders = overviewRes.columnHeaders?.map((h: { name: string }) => h.name) || [];
    const ovRow = overviewRes.rows?.[0] || [];
    const overview: Record<string, number> = {};
    ovHeaders.forEach((h: string, i: number) => { overview[h] = Number(ovRow[i]) || 0; });

    // Parse traffic sources
    const traffic = toRows<TrafficRow>(trafficRes);

    // Parse countries
    const countries = toRows<CountryRow>(countryRes);

    // Parse top videos — resolve video titles
    const topVideos = toRows<VideoRow>(topVideosRes);
    let videoTitles: Record<string, string> = {};
    if (topVideos.length > 0) {
      const ids = topVideos.map(v => v.video).join(',');
      const vidsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (vidsRes.ok) {
        const vidsData = await vidsRes.json();
        for (const item of (vidsData.items || [])) {
          videoTitles[item.id] = item.snippet?.title || item.id;
        }
      }
    }

    // Parse daily
    const daily = toRows<DailyRow>(dailyRes);

    return NextResponse.json({
      overview,
      traffic,
      countries,
      topVideos: topVideos.map(v => ({ ...v, title: videoTitles[v.video] || v.video })),
      daily,
      channelName: yt.channelName || 'Channel',
      period: { start: startDate28, end: endDate },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Analytics error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
