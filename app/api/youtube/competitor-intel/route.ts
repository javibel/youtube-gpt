import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';

const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const YT_BASE = 'https://www.googleapis.com/youtube/v3';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim();

export const maxDuration = 60;

interface TrendingVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  views: number;
  likes: number;
  vph: number; // views per hour
  ageHours: number;
}

interface MissedOpportunity {
  topic: string;
  coveredBy: string[];
  totalViews: number;
  suggestion: string;
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
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';

  // Get tracked competitors
  const competitors = await prisma.trackedCompetitor.findMany({
    where: { userId: session.user.id },
    select: { channelId: true, channelName: true },
  });

  if (competitors.length === 0) {
    return NextResponse.json({ trending: [], opportunities: [], newUploads: [] });
  }

  // Fetch recent videos from each competitor (last 7 days)
  const allVideos: TrendingVideo[] = [];
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();

  for (const comp of competitors.slice(0, 10)) {
    try {
      const searchRes = await fetch(
        `${YT_BASE}/search?part=snippet&channelId=${comp.channelId}&type=video&order=date&maxResults=5&publishedAfter=${sevenDaysAgo}&key=${YT_API_KEY}`
      );
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();
      const items = searchData.items || [];
      const videoIds = items.map((i: { id: { videoId: string } }) => i.id?.videoId).filter(Boolean);

      if (videoIds.length === 0) continue;

      const statsRes = await fetch(
        `${YT_BASE}/videos?part=statistics,snippet&id=${videoIds.join(',')}&key=${YT_API_KEY}`
      );
      if (!statsRes.ok) continue;
      const statsData = await statsRes.json();

      for (const v of (statsData.items || [])) {
        const publishedAt = v.snippet?.publishedAt || '';
        const ageMs = now - new Date(publishedAt).getTime();
        const ageHours = Math.max(1, ageMs / 3600000);
        const views = parseInt(v.statistics?.viewCount || '0', 10);

        allVideos.push({
          videoId: v.id,
          title: v.snippet?.title || '',
          thumbnail: v.snippet?.thumbnails?.medium?.url || '',
          channelName: comp.channelName,
          channelId: comp.channelId,
          publishedAt,
          views,
          likes: parseInt(v.statistics?.likeCount || '0', 10),
          vph: Math.round(views / ageHours),
          ageHours: Math.round(ageHours),
        });
      }
    } catch { /* continue */ }
  }

  // Sort by VPH (trending first)
  const trending = allVideos
    .sort((a, b) => b.vph - a.vph)
    .slice(0, 15);

  // New uploads (last 48h, sorted by recency)
  const newUploads = allVideos
    .filter(v => v.ageHours <= 48)
    .sort((a, b) => a.ageHours - b.ageHours)
    .slice(0, 10);

  // Missed opportunities via AI
  let opportunities: MissedOpportunity[] = [];

  if (ANTHROPIC_API_KEY && trending.length >= 3) {
    // Get user's recent video titles for comparison
    const yt = await prisma.youtubeToken.findUnique({ where: { userId: session.user.id } });
    let userTitles: string[] = [];

    if (yt?.channelId) {
      try {
        const userVidsRes = await fetch(
          `${YT_BASE}/search?part=snippet&channelId=${yt.channelId}&type=video&order=date&maxResults=20&key=${YT_API_KEY}`
        );
        if (userVidsRes.ok) {
          const data = await userVidsRes.json();
          userTitles = (data.items || []).map((i: { snippet: { title: string } }) => i.snippet?.title).filter(Boolean);
        }
      } catch { /* */ }
    }

    const competitorTopics = trending.map(v => `"${v.title}" (${v.channelName}, ${v.views} views, ${v.vph} VPH)`).join('\n');
    const userTopics = userTitles.length > 0
      ? `\n\nUser's recent videos:\n${userTitles.map(t => `- ${t}`).join('\n')}`
      : '\n\nUser has no connected YouTube channel yet.';

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `Analyze competitor videos and find missed opportunities. Reply in ${lang === 'en' ? 'English' : 'Spanish'}. Output ONLY valid JSON array:
[{"topic":"topic name","coveredBy":["channel1"],"totalViews":123456,"suggestion":"actionable suggestion"}]

Find 3-5 topic areas/themes that competitors cover but the user doesn't. Focus on high-performing topics (high VPH). Be specific about the topic, not generic.

Competitor trending videos:
${competitorTopics}${userTopics}`,
          }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) opportunities = parsed;
        } catch { /* */ }
      }
    } catch { /* */ }
  }

  return NextResponse.json({ trending, newUploads, opportunities });
}
