import { NextResponse } from 'next/server';
import { auth } from '@/auth';

const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

interface VideoItem {
  videoId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
  likes: number;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!YT_API_KEY) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
  }

  const { keyword } = await request.json();
  if (!keyword?.trim()) {
    return NextResponse.json({ error: 'Missing keyword' }, { status: 400 });
  }

  try {
    // 1. Search top videos for keyword
    const searchRes = await fetch(
      `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&maxResults=5&order=viewCount&key=${YT_API_KEY}`
    );
    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      return NextResponse.json(
        { error: searchData.error?.message || 'YouTube API error' },
        { status: 500 }
      );
    }

    const items = searchData.items || [];
    const videoIds = items.map((item: { id: { videoId: string } }) => item.id.videoId).join(',');
    const totalResults: number = searchData.pageInfo?.totalResults || 0;

    // 2. Get video stats
    let topVideos: VideoItem[] = [];
    if (videoIds) {
      const statsRes = await fetch(
        `${YT_BASE}/videos?part=statistics,snippet&id=${videoIds}&key=${YT_API_KEY}`
      );
      const statsData = await statsRes.json();
      topVideos = (statsData.items || []).map((v: {
        id: string;
        snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } }; publishedAt: string };
        statistics: { viewCount?: string; likeCount?: string };
      }) => ({
        videoId: v.id,
        title: v.snippet?.title || '',
        channelName: v.snippet?.channelTitle || '',
        thumbnail: v.snippet?.thumbnails?.medium?.url || '',
        publishedAt: v.snippet?.publishedAt || '',
        views: parseInt(v.statistics?.viewCount || '0', 10),
        likes: parseInt(v.statistics?.likeCount || '0', 10),
      }));
    }

    // 3. Competition score based on avg views of top 5
    const avgViews =
      topVideos.length > 0
        ? topVideos.reduce((s, v) => s + v.views, 0) / topVideos.length
        : 0;

    let competition: 'low' | 'medium' | 'high';
    let competitionScore: number;

    if (avgViews > 1_000_000 || totalResults > 5_000_000) {
      competition = 'high';
      competitionScore = Math.min(95, 72 + Math.floor(avgViews / 2_000_000) * 3);
    } else if (avgViews > 100_000 || totalResults > 500_000) {
      competition = 'medium';
      competitionScore = 42 + Math.floor(avgViews / 100_000) * 4;
      competitionScore = Math.min(71, competitionScore);
    } else {
      competition = 'low';
      competitionScore = Math.max(8, Math.floor(avgViews / 5_000));
      competitionScore = Math.min(41, competitionScore);
    }

    // 4. Opportunity score (inverse of competition + demand bonus)
    const demandBonus = topVideos[0]?.views > 500_000 ? 12 : topVideos[0]?.views > 100_000 ? 6 : 0;
    const opportunityScore = Math.max(5, Math.min(98, 100 - competitionScore + demandBonus));

    // 5. Related keywords via YouTube autocomplete (no key needed)
    let relatedKeywords: string[] = [];
    try {
      const autoRes = await fetch(
        `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(keyword)}&hl=es`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const text = await autoRes.text();
      // Response format: window.google.ac.h(["keyword", [["suggestion", 0, []], ...]])
      const bracketMatch = text.match(/\["[^"]*",\s*\[(\[[\s\S]*?\])\s*\]/);
      if (bracketMatch) {
        const inner = JSON.parse(`[${bracketMatch[1]}]`);
        relatedKeywords = inner.slice(0, 8).map((item: [string]) => item[0]).filter(Boolean);
      }
    } catch {
      // Autocomplete is unofficial — fail silently
    }

    return NextResponse.json({
      keyword,
      totalResults,
      competition,
      competitionScore,
      opportunityScore,
      avgViews: Math.round(avgViews),
      topVideos,
      relatedKeywords,
    });
  } catch (err) {
    console.error('[research/keywords]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
