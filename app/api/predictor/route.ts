import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';

export const maxDuration = 60;

interface VideoData {
  title: string;
  views: number;
  likes: number;
  comments: number;
  duration: number; // seconds
  publishedAt: string;
  tags: string[];
  descriptionLength: number;
  hasCustomThumbnail: boolean;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const title = (body.title as string || '').trim();
  const description = (body.description as string || '').trim();
  const tags = (body.tags as string || '').trim();

  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }

  const yt = await prisma.youtubeToken.findUnique({ where: { userId: session.user.id } });
  if (!yt?.channelId) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const token = await getAccessToken(session.user.id);
  if (!token) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  // Fetch last 30 videos for baseline
  let videos: VideoData[] = [];
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id&forMine=true&type=video&order=date&maxResults=30`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!searchRes.ok) throw new Error('search failed');
    const searchData = await searchRes.json();
    const ids = (searchData.items || []).map((i: { id: { videoId: string } }) => i.id.videoId).join(',');

    if (ids) {
      const vidsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (vidsRes.ok) {
        const vidsData = await vidsRes.json();
        videos = (vidsData.items || []).map((v: {
          snippet: { title: string; publishedAt: string; tags?: string[]; description: string; thumbnails?: Record<string, unknown> };
          statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
          contentDetails: { duration?: string };
        }) => {
          const durMatch = (v.contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          const durSec = durMatch
            ? (parseInt(durMatch[1] || '0') * 3600) + (parseInt(durMatch[2] || '0') * 60) + parseInt(durMatch[3] || '0')
            : 0;
          return {
            title: v.snippet.title,
            views: parseInt(v.statistics.viewCount || '0', 10),
            likes: parseInt(v.statistics.likeCount || '0', 10),
            comments: parseInt(v.statistics.commentCount || '0', 10),
            duration: durSec,
            publishedAt: v.snippet.publishedAt,
            tags: v.snippet.tags || [],
            descriptionLength: v.snippet.description?.split(/\s+/).filter(Boolean).length || 0,
            hasCustomThumbnail: v.snippet.thumbnails ? Object.keys(v.snippet.thumbnails).length >= 4 : false,
          };
        });
      }
    }
  } catch {
    return NextResponse.json({ error: 'youtube_api_error' }, { status: 500 });
  }

  if (videos.length < 3) {
    return NextResponse.json({ error: 'not_enough_videos', videoCount: videos.length }, { status: 400 });
  }

  // Compute channel baselines
  const avgViews = Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length);
  const medianViews = videos.map(v => v.views).sort((a, b) => a - b)[Math.floor(videos.length / 2)];
  const avgLikes = Math.round(videos.reduce((s, v) => s + v.likes, 0) / videos.length);
  const avgComments = Math.round(videos.reduce((s, v) => s + v.comments, 0) / videos.length);
  const avgEngagement = avgViews > 0 ? ((avgLikes + avgComments) / avgViews) * 100 : 0;
  const topVideo = videos.reduce((best, v) => v.views > best.views ? v : best, videos[0]);
  const bottomVideo = videos.reduce((worst, v) => v.views < worst.views ? v : worst, videos[0]);

  // Build channel context for AI prediction
  const channelContext = {
    channelName: yt.channelName || 'Unknown',
    subscribers: yt.subscribers || 0,
    avgViews,
    medianViews,
    avgEngagement: avgEngagement.toFixed(1),
    topVideoViews: topVideo.views,
    topVideoTitle: topVideo.title,
    bottomVideoViews: bottomVideo.views,
    videoCount: videos.length,
  };

  // Call Claude for prediction
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
  }

  const userLang = body.lang === 'en' ? 'en' : 'es';

  const prompt = `You are a YouTube analytics predictor. Based on the creator's channel data and the proposed video details, predict its performance.

CHANNEL DATA:
- Channel: ${channelContext.channelName} (${channelContext.subscribers} subs)
- Last ${channelContext.videoCount} videos: avg ${channelContext.avgViews} views, median ${channelContext.medianViews} views
- Avg engagement: ${channelContext.avgEngagement}%
- Best video: "${channelContext.topVideoTitle}" (${channelContext.topVideoViews} views)
- Worst recent: ${channelContext.bottomVideoViews} views

PROPOSED VIDEO:
- Title: "${title}"
- Description length: ${description.split(/\s+/).filter(Boolean).length} words
- Tags: ${tags || 'none'}

Output ONLY a valid JSON object with these fields:
- estimatedViews: {low: number, mid: number, high: number} (realistic range based on channel data)
- estimatedEngagement: number (percentage, e.g. 4.2)
- titleScore: number (0-100, how good is this title for CTR)
- seoScore: number (0-100, based on title+description+tags)
- viralPotential: "low" | "medium" | "high"
- strengths: string[] (2-3 short bullet points in ${userLang})
- weaknesses: string[] (2-3 short bullet points in ${userLang})
- suggestion: string (1-2 sentences of key advice in ${userLang})

Be realistic. Base predictions on actual channel metrics, not optimistic guesses.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'AI service error' }, { status: 500 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    let prediction;
    try {
      prediction = JSON.parse(text);
    } catch {
      // Try to extract JSON from text
      const match = text.match(/\{[\s\S]*\}/);
      if (match) prediction = JSON.parse(match[0]);
      else return NextResponse.json({ error: 'prediction_failed' }, { status: 500 });
    }

    return NextResponse.json({
      prediction,
      baseline: {
        avgViews,
        medianViews,
        avgEngagement: parseFloat(avgEngagement.toFixed(1)),
        topVideoViews: topVideo.views,
        topVideoTitle: topVideo.title,
        videoCount: videos.length,
        subscribers: yt.subscribers || 0,
      },
    });
  } catch {
    return NextResponse.json({ error: 'prediction_failed' }, { status: 500 });
  }
}
