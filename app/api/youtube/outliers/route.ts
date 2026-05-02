import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan, isPaid } from '@/lib/plans';

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

export interface OutlierVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
  likes: number;
  multiplier: number;
  type: 'viral' | 'evergreen';
}

export interface OutlierResult {
  channelId: string;
  medianViews: number;
  totalVideosAnalyzed: number;
  outliers: OutlierVideo[];
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  if (!YT_API_KEY) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
  }

  const url = new URL(request.url);
  const channelId = url.searchParams.get('channelId');
  const period = url.searchParams.get('period') || 'all'; // 7d, 30d, 90d, all
  const threshold = parseFloat(url.searchParams.get('threshold') || '10'); // multiplier threshold

  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 });
  }

  try {
    // Fetch up to 50 recent videos
    const allVideoIds: string[] = [];
    let pageToken = '';

    for (let page = 0; page < 2; page++) {
      const searchUrl = `${YT_BASE}/search?part=snippet&channelId=${channelId}&order=date&type=video&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}&key=${YT_API_KEY}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();

      const items = searchData.items || [];
      for (const item of items) {
        if (item.id?.videoId) allVideoIds.push(item.id.videoId);
      }

      pageToken = searchData.nextPageToken || '';
      if (!pageToken || allVideoIds.length >= 50) break;
    }

    if (allVideoIds.length === 0) {
      return NextResponse.json({ channelId, medianViews: 0, totalVideosAnalyzed: 0, outliers: [] });
    }

    // Fetch video stats in batches of 50
    const videoDetails: {
      videoId: string; title: string; thumbnail: string;
      publishedAt: string; views: number; likes: number;
    }[] = [];

    for (let i = 0; i < allVideoIds.length; i += 50) {
      const batch = allVideoIds.slice(i, i + 50).join(',');
      const statsRes = await fetch(
        `${YT_BASE}/videos?part=statistics,snippet&id=${batch}&key=${YT_API_KEY}`
      );
      const statsData = await statsRes.json();

      for (const v of (statsData.items || [])) {
        videoDetails.push({
          videoId: v.id,
          title: v.snippet?.title || '',
          thumbnail: v.snippet?.thumbnails?.medium?.url || '',
          publishedAt: v.snippet?.publishedAt || '',
          views: parseInt(v.statistics?.viewCount || '0', 10),
          likes: parseInt(v.statistics?.likeCount || '0', 10),
        });
      }
    }

    // Filter by date period
    const now = Date.now();
    const periodMs: Record<string, number> = {
      '7d': 7 * 86400000,
      '30d': 30 * 86400000,
      '90d': 90 * 86400000,
    };
    const cutoff = periodMs[period] ? now - periodMs[period] : 0;
    const filtered = cutoff > 0
      ? videoDetails.filter(v => new Date(v.publishedAt).getTime() >= cutoff)
      : videoDetails;

    if (filtered.length < 3) {
      return NextResponse.json({ channelId, medianViews: 0, totalVideosAnalyzed: filtered.length, outliers: [] });
    }

    // Calculate median views
    const viewCounts = filtered.map(v => v.views);
    const med = median(viewCounts);

    if (med === 0) {
      return NextResponse.json({ channelId, medianViews: 0, totalVideosAnalyzed: filtered.length, outliers: [] });
    }

    // Detect outliers (views >= threshold * median)
    const sixMonthsAgo = now - 180 * 86400000;
    const outliers: OutlierVideo[] = filtered
      .filter(v => v.views >= threshold * med)
      .map(v => {
        const multiplier = Math.round((v.views / med) * 10) / 10;
        const publishedTime = new Date(v.publishedAt).getTime();
        const isOld = publishedTime < sixMonthsAgo;
        return {
          ...v,
          multiplier,
          type: isOld ? 'evergreen' as const : 'viral' as const,
        };
      })
      .sort((a, b) => b.multiplier - a.multiplier);

    return NextResponse.json({
      channelId,
      medianViews: med,
      totalVideosAnalyzed: filtered.length,
      outliers,
    });
  } catch (err) {
    console.error('[youtube/outliers]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
