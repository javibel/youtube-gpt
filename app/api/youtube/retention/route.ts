import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import { parseClaudeJson } from '@/lib/parse-claude-json';

export const maxDuration = 60;

interface RetentionPoint { elapsedVideoTimeRatio: number; audienceWatchRatio: number }

export async function POST(request: Request) {
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
    retention: number[];
    avgRetention: number;
    hookScore: number;
    dropOffPoints: { time: number; drop: number; retentionBefore: number; retentionAfter: number }[];
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

      // Hook Score: retention in the first ~5% of the video (approx first 30s for a 10min video)
      const hookWindow = Math.max(1, Math.ceil(rows.length * 0.05));
      const hookValues = retentionValues.slice(0, hookWindow);
      const hookScore = hookValues.length > 0
        ? Math.round((hookValues.reduce((s, v) => s + v, 0) / hookValues.length) * 100)
        : 0;

      // Find significant drop-off points (>10% drop between consecutive points)
      const dropOffs: { time: number; drop: number; retentionBefore: number; retentionAfter: number }[] = [];
      for (let i = 1; i < retentionValues.length; i++) {
        const drop = retentionValues[i - 1] - retentionValues[i];
        if (drop > 0.10) {
          const timePct = rows[i].elapsedVideoTimeRatio;
          const detail = videoDetails[vid];
          dropOffs.push({
            time: detail ? Math.round(timePct * detail.duration) : Math.round(timePct * 100),
            drop: Math.round(drop * 100),
            retentionBefore: Math.round(retentionValues[i - 1] * 100),
            retentionAfter: Math.round(retentionValues[i] * 100),
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
        hookScore,
        dropOffPoints: dropOffs.slice(0, 5),
      });
    } catch { /* continue */ }
  }

  if (!videoRetentions.length) {
    return NextResponse.json({ error: 'no_retention_data' }, { status: 400 });
  }

  // Generate AI tips
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  let aiTips: string[] = [];
  let dropOffReasons: Record<string, { timestamp: string; reason: string }[]> = {};

  if (apiKey && videoRetentions.length > 0) {
    const context = videoRetentions.map(v => {
      const drops = v.dropOffPoints.map(d =>
        `drop ${d.drop}% at ${Math.floor(d.time / 60)}:${(d.time % 60).toString().padStart(2, '0')} (${d.retentionBefore}%→${d.retentionAfter}%)`
      ).join(', ');
      return `"${v.title}" — hook score ${v.hookScore}%, avg retention ${v.avgRetention}%, ${v.views} views, duration ${Math.floor(v.duration / 60)}min, ${drops || 'no major drops'}`;
    }).join('\n');

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Analyze these YouTube video retention data. Reply in ${userLang === 'en' ? 'English' : 'Spanish'}. Output ONLY valid JSON with this structure:
{"tips":["tip1","tip2","tip3"],"dropOffReasons":{"VIDEO_ID":[{"timestamp":"M:SS","reason":"short explanation"}]}}

For each video's drop-off points, explain the likely reason (intro too long, topic change, dead air, CTA placement, pacing issue, etc). Give 3-4 actionable tips based on patterns across all videos. Focus on the hook score (first 30s) and biggest drops.

${context}`,
          }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        try {
          const parsed = parseClaudeJson<{ tips?: string[]; dropOffReasons?: typeof dropOffReasons }>(text);
          aiTips = Array.isArray(parsed.tips) ? parsed.tips : [];
          dropOffReasons = parsed.dropOffReasons || {};
        } catch {
          // Fallback: try parsing as plain array
          try {
            const arr = parseClaudeJson<string[]>(text);
            if (Array.isArray(arr)) aiTips = arr;
          } catch { /* */ }
        }
      }
    } catch { /* */ }
  }

  return NextResponse.json({ videos: videoRetentions, aiTips, dropOffReasons });
}
