import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';

export interface ChannelContext {
  hasChannel: boolean;
  channelName: string;
  subscribers: number;
  totalViews: number;
  videoCount: number;
  recentVideos: { title: string; views: string; publishedAt: string }[];
  avgSeoScore: number | null;
  growthTrend: string;
  competitors: { channelName: string; subscribers: number }[];
  summary: string; // Pre-formatted text for injection into prompts
}

/**
 * Build a channel context summary for a user.
 * Extracted from the Coach route for reuse in AI Generator prompts.
 * Returns null if the user has no YouTube channel connected.
 */
export async function getChannelContext(userId: string): Promise<ChannelContext | null> {
  const yt = await prisma.youtubeToken.findUnique({ where: { userId } });
  if (!yt?.channelId) return null;

  // Fetch recent videos from YouTube API
  const token = await getAccessToken(userId);
  let recentVideos: { title: string; views: string; publishedAt: string }[] = [];

  if (token) {
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=id&forMine=true&type=video&order=date&maxResults=10`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const ids = (searchData.items || []).map((i: { id: { videoId: string } }) => i.id.videoId).join(',');
        if (ids) {
          const vidsRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (vidsRes.ok) {
            const vidsData = await vidsRes.json();
            recentVideos = (vidsData.items || []).map((v: { snippet: { title: string; publishedAt: string }; statistics: { viewCount: string } }) => ({
              title: v.snippet.title,
              views: v.statistics.viewCount,
              publishedAt: v.snippet.publishedAt,
            }));
          }
        }
      }
    } catch { /* non-critical */ }
  }

  // SEO scores
  const seoScores = await prisma.videoSeoScore.findMany({
    where: { userId },
    orderBy: { analyzedAt: 'desc' },
    take: 10,
    select: { score: true },
  });

  const avgSeoScore = seoScores.length > 0
    ? Math.round(seoScores.reduce((s, v) => s + v.score, 0) / seoScores.length)
    : null;

  // Growth data
  const snapshots = await prisma.channelSnapshot.findMany({
    where: { userId },
    orderBy: { recordedAt: 'desc' },
    take: 30,
    select: { subscribers: true, totalViews: true, recordedAt: true },
  });

  const growthTrend = snapshots.length >= 2
    ? `subs went from ${snapshots[snapshots.length - 1].subscribers} to ${snapshots[0].subscribers}`
    : '';

  // Competitors
  const competitors = await prisma.trackedCompetitor.findMany({
    where: { userId },
    select: { channelName: true, subscribers: true },
    take: 5,
  });

  // Build summary text
  const parts = [
    `Channel: ${yt.channelName || 'Unknown'}`,
    `Subscribers: ${yt.subscribers || '0'}`,
    `Total views: ${yt.totalViews || '0'}`,
    `Total videos: ${yt.videoCount || '0'}`,
    recentVideos.length > 0
      ? `Recent videos:\n${recentVideos.map(v => `- "${v.title}" (${v.views} views, ${v.publishedAt.slice(0, 10)})`).join('\n')}`
      : '',
    avgSeoScore !== null
      ? `Average SEO score: ${avgSeoScore}/100 (range ${Math.min(...seoScores.map(s => s.score))}-${Math.max(...seoScores.map(s => s.score))})`
      : '',
    growthTrend ? `Growth: ${growthTrend}` : '',
    competitors.length > 0
      ? `Competitors: ${competitors.map(c => `${c.channelName} (${c.subscribers} subs)`).join(', ')}`
      : '',
  ].filter(Boolean);

  return {
    hasChannel: true,
    channelName: yt.channelName || 'Unknown',
    subscribers: Number(yt.subscribers) || 0,
    totalViews: Number(yt.totalViews) || 0,
    videoCount: Number(yt.videoCount) || 0,
    recentVideos,
    avgSeoScore,
    growthTrend,
    competitors,
    summary: parts.join('\n'),
  };
}
