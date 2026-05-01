import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';

export const maxDuration = 60;

interface RetentionPoint { elapsedVideoTimeRatio: number; audienceWatchRatio: number }

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

  const yt = await prisma.youtubeToken.findUnique({ where: { userId: session.user.id } });
  if (!yt?.channelId) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const token = await getAccessToken(session.user.id);
  if (!token) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const videoId = body.videoId as string | undefined;
  const userLang = body.lang === 'en' ? 'en' : 'es';

  // Fetch user's recent videos if no specific videoId
  let videoIds: string[] = [];

  if (videoId) {
    videoIds = [videoId];
  } else {
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=id&forMine=true&type=video&order=date&maxResults=10`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (searchRes.ok) {
        const data = await searchRes.json();
        videoIds = (data.items || []).map((i: { id: { videoId: string } }) => i.id.videoId);
      }
    } catch { /* */ }
  }

  if (!videoIds.length) {
    return NextResponse.json({ error: 'no_videos' }, { status: 400 });
  }

  // Fetch video details
  let videoDetails: Record<string, { title: string; views: number; duration: number }> = {};
  try {
    const vidsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (vidsRes.ok) {
      const data = await vidsRes.json();
      for (const item of (data.items || [])) {
        const durMatch = (item.contentDetails?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        const durSec = durMatch
          ? (parseInt(durMatch[1] || '0') * 3600) + (parseInt(durMatch[2] || '0') * 60) + parseInt(durMatch[3] || '0')
          : 0;
        videoDetails[item.id] = {
          title: item.snippet?.title || item.id,
          views: parseInt(item.statistics?.viewCount || '0', 10),
          duration: durSec,
        };
      }
    }
  } catch { /* */ }

  // Fetch retention data per video via YouTube Analytics API
  const now = new Date();
  const endDate = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);

  const videoRetentions: {
    videoId: string;
    title: string;
    views: number;
    duration: number;
    retention: number[]; // audience watch ratio at each point
    avgRetention: number;
    dropOffPoints: { time: number; drop: number }[];
  }[] = [];

  for (const vid of videoIds.slice(0, 5)) {
    try {
      const res = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?` +
        `ids=channel==${yt.channelId}` +
        `&startDate=${startDate}&endDate=${endDate}` +
        `&metrics=audienceWatchRatio` +
        `&dimensions=elapsedVideoTimeRatio` +
        `&filters=video==${vid}` +
        `&sort=elapsedVideoTimeRatio`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) continue;

      const data = await res.json();
      const rows: RetentionPoint[] = (data.rows || []).map((r: [number, number]) => ({
        elapsedVideoTimeRatio: r[0],
        audienceWatchRatio: r[1],
      }));

      if (rows.length < 5) continue;

      const retentionValues = rows.map(r => r.audienceWatchRatio);
      const avgRetention = retentionValues.reduce((s, v) => s + v, 0) / retentionValues.length;

      // Find significant drop-off points (>15% drop between consecutive points)
      const dropOffs: { time: number; drop: number }[] = [];
      for (let i = 1; i < retentionValues.length; i++) {
        const drop = retentionValues[i - 1] - retentionValues[i];
        if (drop > 0.15) {
          const timePct = rows[i].elapsedVideoTimeRatio;
          const detail = videoDetails[vid];
          dropOffs.push({
            time: detail ? Math.round(timePct * detail.duration) : Math.round(timePct * 100),
            drop: Math.round(drop * 100),
          });
        }
      }

      const detail = videoDetails[vid] || { title: vid, views: 0, duration: 0 };

      videoRetentions.push({
        videoId: vid,
        title: detail.title,
        views: detail.views,
        duration: detail.duration,
        retention: retentionValues.map(v => Math.round(v * 100)),
        avgRetention: Math.round(avgRetention * 100),
        dropOffPoints: dropOffs.slice(0, 3),
      });
    } catch { /* continue */ }
  }

  if (!videoRetentions.length) {
    return NextResponse.json({ error: 'no_retention_data' }, { status: 400 });
  }

  // Generate AI tips
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  let aiTips: string[] = [];

  if (apiKey && videoRetentions.length > 0) {
    const context = videoRetentions.map(v => {
      const drops = v.dropOffPoints.map(d => `drop ${d.drop}% at ${Math.floor(d.time / 60)}:${(d.time % 60).toString().padStart(2, '0')}`).join(', ');
      return `"${v.title}" — avg retention ${v.avgRetention}%, ${v.views} views, ${drops || 'no major drops'}`;
    }).join('\n');

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: `Based on these YouTube video retention data, give 3-4 specific, actionable tips to improve audience retention. Reply in ${userLang === 'en' ? 'English' : 'Spanish'}. Output ONLY a JSON array of strings.\n\n${context}`,
          }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        try {
          aiTips = JSON.parse(text);
          if (!Array.isArray(aiTips)) aiTips = [];
        } catch { /* */ }
      }
    } catch { /* */ }
  }

  return NextResponse.json({ videos: videoRetentions, aiTips });
}
