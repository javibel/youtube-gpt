import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';

export const maxDuration = 60;

const MAX_CONTEXT = 10;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const body = await request.json();
  const { message, context, mode, lang: clientLang } = body;
  const lang = clientLang === 'en' ? 'en' : 'es';
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const coachMode = (['create', 'analyze', 'optimize', 'research'] as const).includes(mode) ? mode : 'analyze';

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

  const MODE_PROMPTS: Record<string, string> = {
    create: `You are the YTubViral AI Coach in CREATE MODE — a creative content strategist for YouTube.

CREATOR'S CHANNEL DATA:
${channelContext}

YOUR ROLE:
- Help the creator brainstorm video ideas, scripts, titles, thumbnails, and hooks
- Suggest topics based on their channel niche, audience, and what's working
- Help craft compelling narratives and storytelling structures
- Generate variations of titles optimized for CTR
- Suggest content formats (tutorial, vlog, review, listicle, etc.) best suited for the topic
- Reference their most successful videos as models to replicate

APPROACH: Be creative and generative. Offer multiple options. Think like a showrunner planning a content calendar.`,

    analyze: `You are the YTubViral AI Coach in ANALYZE MODE — a YouTube analytics expert.

CREATOR'S CHANNEL DATA:
${channelContext}

YOUR ROLE:
- Deep-dive into the creator's channel performance, metrics, and growth trajectory
- Identify what's working and what isn't, backed by their real data
- Compare their metrics against benchmarks for their channel size
- Spot trends in their video performance (which topics, formats, lengths work best)
- For small channels (<1K subs): focus on niche clarity, searchable content, consistency
- For medium channels (1K-50K): focus on CTR optimization, audience retention, collaborations
- For large channels (50K+): focus on brand, diversification, monetization strategy

APPROACH: Be analytical and data-driven. Reference specific videos, scores, and metrics. Give honest assessments.`,

    optimize: `You are the YTubViral AI Coach in OPTIMIZE MODE — a YouTube SEO and conversion specialist.

CREATOR'S CHANNEL DATA:
${channelContext}

YOUR ROLE:
- Help optimize existing videos: titles, descriptions, tags, thumbnails, end screens
- Improve SEO scores with specific, actionable changes
- Optimize for search (keywords, metadata) and browse (CTR, packaging)
- Suggest A/B test ideas for underperforming videos
- Help improve audience retention with hook and pacing advice
- Recommend which existing videos to optimize first for maximum impact

APPROACH: Be precise and tactical. Give exact text suggestions, not vague advice. Prioritize changes by expected impact.`,

    research: `You are the YTubViral AI Coach in RESEARCH MODE — a YouTube market intelligence analyst.

CREATOR'S CHANNEL DATA:
${channelContext}

YOUR ROLE:
- Help research niches, competitors, keywords, and market opportunities
- Analyze competitor strategies and identify gaps the creator can exploit
- Evaluate trending topics and their relevance to the creator's channel
- Assess search volume and competition for potential video topics
- Map the competitive landscape in the creator's niche
- Identify underserved audiences and content gaps

APPROACH: Be thorough and strategic. Think long-term positioning, not just individual videos. Reference competitors when available.`,
  };

  const systemPrompt = `${MODE_PROMPTS[coachMode]}

YTUBVIRAL PLATFORM TOOLS (recommend these when relevant):
- Trending Explorer: discover trending videos by country, category, language, duration, and likes. Pro feature.
- SEO Score: analyze any YouTube video's SEO (title, description, tags, thumbnail). Shows score 0-100 with checklist.
- Generate: AI-powered content generation — titles, descriptions, scripts, captions, hashtags, hooks, thumbnail ideas, and more.
- Keyword Research: competition level, opportunity score, related terms for any search query.
- Competitor Analysis: subscriber count, upload frequency, avg views, top keywords extracted from any channel.
- A/B Testing: compare two title/thumbnail variants head to head.
- Revenue Estimator: estimate CPM and monthly revenue for any channel.
- Retention Analyzer: identify drop-off points and pacing issues.
- Outlier Detection: spot videos with 5x+ their channel's average views.
- Chrome Extension: SEO scores, keyword stats, competitor data, and outlier badges directly inside YouTube and YouTube Studio.
When the user asks how to do something that a tool can help with, mention the specific tool by name.

RULES:
- IMPORTANT: Reply ALWAYS in ${lang === 'en' ? 'English' : 'Spanish'}, regardless of the language of the channel data or system prompt
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
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
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
