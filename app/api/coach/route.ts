import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';

export const maxDuration = 60;

const MAX_CONTEXT = 10;

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

  const body = await request.json();
  const { message, context } = body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  // Rate limit: 1 message per 5 seconds
  const throttleKey = `coach_throttle:${session.user.id}`;
  const throttleResult = await prisma.$queryRaw<{ hits: number }[]>`
    INSERT INTO rate_limits (key, hits, window_start)
    VALUES (${throttleKey}, 1, NOW())
    ON CONFLICT (key) DO UPDATE
    SET
      hits = CASE WHEN rate_limits.window_start < NOW() - INTERVAL '5 seconds' THEN 1 ELSE rate_limits.hits + 1 END,
      window_start = CASE WHEN rate_limits.window_start < NOW() - INTERVAL '5 seconds' THEN NOW() ELSE rate_limits.window_start END
    RETURNING hits
  `;
  if (Number(throttleResult[0].hits) > 1) {
    return NextResponse.json({ error: 'throttled' }, { status: 429 });
  }

  // Build channel context
  let channelContext = 'No YouTube channel connected.';

  const yt = await prisma.youtubeToken.findUnique({ where: { userId: session.user.id } });
  if (yt?.channelId) {
    // Fetch fresh channel data
    const token = await getAccessToken(session.user.id);
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

    // Get SEO scores
    const seoScores = await prisma.videoSeoScore.findMany({
      where: { userId: session.user.id },
      orderBy: { analyzedAt: 'desc' },
      take: 10,
      select: { videoId: true, score: true },
    });

    // Get growth data
    const snapshots = await prisma.channelSnapshot.findMany({
      where: { userId: session.user.id },
      orderBy: { recordedAt: 'desc' },
      take: 30,
      select: { subscribers: true, totalViews: true, recordedAt: true },
    });

    const growthInfo = snapshots.length >= 2
      ? `Growth trend (last ${snapshots.length} data points): subs went from ${snapshots[snapshots.length - 1].subscribers} to ${snapshots[0].subscribers}`
      : '';

    // Get competitors
    const competitors = await prisma.trackedCompetitor.findMany({
      where: { userId: session.user.id },
      select: { channelName: true, subscribers: true, videoCount: true },
      take: 5,
    });

    const competitorInfo = competitors.length > 0
      ? `Tracked competitors: ${competitors.map(c => `${c.channelName} (${c.subscribers} subs, ${c.videoCount} vids)`).join('; ')}`
      : '';

    channelContext = [
      `Channel: ${yt.channelName || 'Unknown'}`,
      `Subscribers: ${yt.subscribers || '0'}`,
      `Total views: ${yt.totalViews || '0'}`,
      `Total videos: ${yt.videoCount || '0'}`,
      recentVideos.length > 0
        ? `Last 10 videos:\n${recentVideos.map(v => `- "${v.title}" (${v.views} views, ${v.publishedAt.slice(0, 10)})`).join('\n')}`
        : '',
      seoScores.length > 0
        ? `SEO scores (0-100): avg ${Math.round(seoScores.reduce((s, v) => s + v.score, 0) / seoScores.length)}, range ${Math.min(...seoScores.map(s => s.score))}-${Math.max(...seoScores.map(s => s.score))}`
        : '',
      growthInfo,
      competitorInfo,
    ].filter(Boolean).join('\n');
  }

  const systemPrompt = `You are the YTubViral AI Coach — a personal YouTube growth advisor. You have access to the creator's real channel data below. Use this data to give specific, actionable advice.

CREATOR'S CHANNEL DATA:
${channelContext}

YOUR ROLE:
- Analyze their channel strategy, content, SEO, growth, and competition
- Give specific, data-backed recommendations (reference their actual videos, scores, and metrics)
- Prioritize advice by impact: what will move the needle most for their channel size
- Be direct and honest — if something isn't working, say so constructively
- For small channels (<1K subs): focus on niche clarity, searchable content, consistency
- For medium channels (1K-50K): focus on CTR optimization, audience retention, collaborations
- For large channels (50K+): focus on brand, diversification, monetization strategy

RULES:
- Reply in the same language the user writes in (Spanish or English)
- Be concise but thorough. Use plain text, no markdown formatting
- Reference specific videos and data points when possible
- If asked about something you don't have data for, say so honestly
- Never invent metrics or data you don't have`;

  const contextMessages = Array.isArray(context)
    ? context.slice(-MAX_CONTEXT).map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.content).slice(0, 2000),
      }))
    : [];

  const messages = [...contextMessages, { role: 'user', content: message.trim().slice(0, 2000) }];

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 800,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'AI service error' }, { status: 500 });
  }

  const data = await res.json();
  const reply: string = data.content?.[0]?.text ?? '';

  return NextResponse.json({ reply });
}
