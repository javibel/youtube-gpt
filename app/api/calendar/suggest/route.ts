import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';

export const maxDuration = 60;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim();
const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();

const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const lang = body.lang === 'en' ? 'en' : 'es';

  const userId = session.user.id;

  // Gather data in parallel
  const [bestTime, trendAlerts, competitors, existingEntries, ytToken] = await Promise.all([
    prisma.bestTimeAnalysis.findUnique({ where: { userId } }),
    prisma.trendAlert.findMany({
      where: { userId, relevance: { gte: 60 } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.trackedCompetitor.findMany({
      where: { userId },
      select: { channelId: true, channelName: true },
      take: 10,
    }),
    prisma.calendarEntry.findMany({
      where: { userId, date: { gte: new Date().toISOString().slice(0, 10) } },
      orderBy: { date: 'asc' },
      take: 30,
    }),
    prisma.youtubeToken.findUnique({ where: { userId }, select: { channelId: true, channelName: true } }),
  ]);

  // Best time slots
  let bestTimeInfo = 'No best time analysis available.';
  if (bestTime?.topSlots) {
    const slots = bestTime.topSlots as { day: number; hour: number; score: number }[];
    bestTimeInfo = slots
      .map((s, i) => `${i + 1}. ${DAY_NAMES_EN[s.day]} at ${s.hour}:00 UTC (score: ${s.score})`)
      .join('\n');
  }

  // Trending topics
  const trendingInfo = trendAlerts.length > 0
    ? trendAlerts.map(t => `- ${t.title} (relevance: ${t.relevance}, category: ${t.category})`).join('\n')
    : 'No trend alerts available.';

  // Competitor recent uploads (last 7 days)
  let competitorUploads = 'No competitor data.';
  if (competitors.length > 0 && YT_API_KEY) {
    try {
      const channelIds = competitors.map(c => c.channelId).join(',');
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${competitors[0].channelId}&type=video&order=date&maxResults=5&publishedAfter=${new Date(Date.now() - 7 * 86400000).toISOString()}&key=${YT_API_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        const titles = (data.items || []).map((i: { snippet: { title: string; channelTitle: string } }) =>
          `- ${i.snippet.channelTitle}: "${i.snippet.title}"`
        );
        if (titles.length > 0) competitorUploads = titles.join('\n');
      }
    } catch { /* */ }
  }

  // User's recent videos
  let recentTitles: string[] = [];
  if (ytToken?.channelId && YT_API_KEY) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${ytToken.channelId}&type=video&order=date&maxResults=10&key=${YT_API_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        recentTitles = (data.items || []).map((i: { snippet: { title: string } }) => i.snippet.title).filter(Boolean);
      }
    } catch { /* */ }
  }

  // Existing calendar entries
  const existingInfo = existingEntries.length > 0
    ? existingEntries.slice(0, 15).map(e => `- ${e.date}: "${e.title}" (${e.status})`).join('\n')
    : 'No upcoming entries.';

  // Calculate next 14 days dates for suggestions
  const today = new Date();
  const next14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today.getTime() + (i + 1) * 86400000);
    return d.toISOString().slice(0, 10);
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a YouTube content strategist. Based on the data below, suggest 5 video ideas with optimal publish dates for the next 2 weeks. Reply in ${lang === 'en' ? 'English' : 'Spanish'}. Output ONLY valid JSON array:
[{"title":"video title","date":"YYYY-MM-DD","hour":14,"reason":"why this date/topic","description":"brief content outline"}]

RULES:
- Pick dates from: ${next14.join(', ')}
- Prefer dates that match the best publish times
- Don't suggest topics the creator already has scheduled
- Incorporate trending topics when relevant
- Each suggestion should have a different topic
- Titles should be compelling YouTube titles (curiosity gap, numbers, etc.)
- Hour in UTC (0-23), aligned with best publish times

DATA:
Channel: "${ytToken?.channelName || 'Unknown'}"
Recent videos: ${recentTitles.slice(0, 8).join(', ') || 'none'}

Best publish times:
${bestTimeInfo}

Trending topics (relevant to channel):
${trendingInfo}

Recent competitor uploads:
${competitorUploads}

Already scheduled:
${existingInfo}`,
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `AI API ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    let suggestions: { title: string; date: string; hour: number; reason: string; description: string }[];
    try {
      // Extract JSON from possible markdown code block
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      suggestions = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'ai_parse_error' }, { status: 500 });
    }

    // Validate and sanitize
    suggestions = (Array.isArray(suggestions) ? suggestions : []).slice(0, 5).map(s => ({
      title: String(s.title || '').slice(0, 200),
      date: /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : next14[0],
      hour: Math.max(0, Math.min(23, Math.round(Number(s.hour) || 12))),
      reason: String(s.reason || '').slice(0, 300),
      description: String(s.description || '').slice(0, 500),
    }));

    return NextResponse.json({ suggestions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'AI error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
