import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import { parseClaudeJson } from '@/lib/parse-claude-json';

export const maxDuration = 60;

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim();

interface DemoRow { [key: string]: string | number }

async function queryAnalytics(token: string, channelId: string, params: Record<string, string>) {
  const base = 'https://youtubeanalytics.googleapis.com/v2/reports';
  const qs = new URLSearchParams({ ids: `channel==${channelId}`, ...params });
  const res = await fetch(`${base}?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Analytics API ${res.status}`);
  }
  return res.json();
}

function toRows(data: { columnHeaders: { name: string }[]; rows?: unknown[][] }): DemoRow[] {
  if (!data.rows?.length) return [];
  const headers = data.columnHeaders.map(h => h.name);
  return data.rows.map(row => {
    const obj: DemoRow = {};
    headers.forEach((h, i) => { obj[h] = row[i] as string | number; });
    return obj;
  });
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

  const yt = await prisma.youtubeToken.findUnique({ where: { userId: session.user.id } });
  if (!yt?.channelId) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const token = await getAccessToken(session.user.id);
  if (!token) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';

  const now = new Date();
  const endDate = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);

  try {
    // Parallel queries: demographics (ageGroup+gender combined), countries, traffic sources, subs timeline
    const [demoRes, countryRes, trafficRes, subsTimelineRes] = await Promise.all([
      // Demographics requires both ageGroup AND gender dimensions together
      queryAnalytics(token, yt.channelId, {
        startDate, endDate,
        metrics: 'viewerPercentage',
        dimensions: 'ageGroup,gender',
        sort: 'ageGroup',
      }),
      queryAnalytics(token, yt.channelId, {
        startDate, endDate,
        metrics: 'views,estimatedMinutesWatched,subscribersGained',
        dimensions: 'country',
        sort: '-views',
        maxResults: '15',
      }),
      // Traffic source reports support views, not subscribersGained
      queryAnalytics(token, yt.channelId, {
        startDate, endDate,
        metrics: 'views,estimatedMinutesWatched',
        dimensions: 'insightTrafficSourceType',
        sort: '-views',
      }),
      queryAnalytics(token, yt.channelId, {
        startDate, endDate,
        metrics: 'subscribersGained,subscribersLost',
        dimensions: 'day',
        sort: 'day',
      }),
    ]);

    // Aggregate demographics: rows have both ageGroup and gender
    const demoRows = toRows(demoRes);
    const ageMap: Record<string, number> = {};
    const genderMap: Record<string, number> = {};
    for (const r of demoRows) {
      const age = String(r.ageGroup || '').replace('age', '');
      const gender = String(r.gender || '');
      const pct = Number(r.viewerPercentage || 0);
      ageMap[age] = (ageMap[age] || 0) + pct;
      genderMap[gender] = (genderMap[gender] || 0) + pct;
    }
    const ageGroups = Object.entries(ageMap).map(([group, percentage]) => ({ group, percentage }));
    const genderSplit = Object.entries(genderMap).map(([gender, percentage]) => ({ gender, percentage }));

    const countries = toRows(countryRes).map(r => ({
      country: String(r.country || ''),
      views: Number(r.views || 0),
      watchTime: Number(r.estimatedMinutesWatched || 0),
      subsGained: Number(r.subscribersGained || 0),
    }));

    // Traffic sources (views-based, not subscriber-based)
    const subsSources = toRows(trafficRes).map(r => ({
      source: String(r.insightTrafficSourceType || ''),
      subsGained: Number(r.views || 0),
    })).filter(s => s.subsGained > 0);

    const subsTimeline = toRows(subsTimelineRes).map(r => ({
      day: String(r.day || ''),
      gained: Number(r.subscribersGained || 0),
      lost: Number(r.subscribersLost || 0),
    }));

    // Get tracked competitors for overlap analysis
    const competitors = await prisma.trackedCompetitor.findMany({
      where: { userId: session.user.id },
      select: { channelId: true, channelName: true, subscribers: true },
      take: 10,
    });

    // AI-powered audience insights + collaboration recommendations
    let aiInsights: {
      audienceProfile: string;
      interests: string[];
      collaborationSuggestions: { channel: string; reason: string }[];
      growthTips: string[];
    } | null = null;

    if (ANTHROPIC_API_KEY) {
      const topCountries = countries.slice(0, 5).map(c => `${c.country}: ${c.views} views`).join(', ');
      const topAge = ageGroups.sort((a, b) => b.percentage - a.percentage).slice(0, 3).map(a => `${a.group}: ${a.percentage.toFixed(1)}%`).join(', ');
      const genderStr = genderSplit.map(g => `${g.gender}: ${g.percentage.toFixed(1)}%`).join(', ');
      const compStr = competitors.map(c => `${c.channelName} (${c.subscribers} subs)`).join(', ');

      // Get user's channel info
      let channelTitle = yt.channelName || 'the channel';
      let recentTitles: string[] = [];
      if (YT_API_KEY) {
        try {
          const vidsRes = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${yt.channelId}&type=video&order=date&maxResults=10&key=${YT_API_KEY}`
          );
          if (vidsRes.ok) {
            const data = await vidsRes.json();
            recentTitles = (data.items || []).map((i: { snippet: { title: string } }) => i.snippet?.title).filter(Boolean);
          }
        } catch { /* */ }
      }

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
            max_tokens: 700,
            messages: [{
              role: 'user',
              content: `Analyze this YouTube channel's audience data and provide insights. Reply in ${lang === 'en' ? 'English' : 'Spanish'}. Output ONLY valid JSON:
{"audienceProfile":"2-3 sentence audience persona","interests":["interest1","interest2","interest3","interest4","interest5"],"collaborationSuggestions":[{"channel":"channel name or type","reason":"why collaborate"}],"growthTips":["tip1","tip2","tip3"]}

Channel: "${channelTitle}"
Recent videos: ${recentTitles.slice(0, 5).join(', ')}
Demographics: ${topAge}
Gender: ${genderStr}
Top countries: ${topCountries}
Tracked competitors: ${compStr || 'none'}
Sub sources: ${subsSources.slice(0, 5).map(s => `${s.source}: ${s.subsGained}`).join(', ')}

For collaboration suggestions, recommend 3 specific types of channels (not the tracked competitors) that would have audience overlap. For interests, infer from demographics + content what the audience cares about.`,
            }],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.content?.[0]?.text || '';
          try {
            aiInsights = parseClaudeJson(text);
          } catch { /* */ }
        }
      } catch { /* */ }
    }

    // Summary stats
    const totalSubsGained = subsTimeline.reduce((s, d) => s + d.gained, 0);
    const totalSubsLost = subsTimeline.reduce((s, d) => s + d.lost, 0);
    const netGrowth = totalSubsGained - totalSubsLost;

    return NextResponse.json({
      ageGroups,
      genderSplit,
      countries,
      subsSources,
      subsTimeline,
      summary: { totalSubsGained, totalSubsLost, netGrowth },
      aiInsights,
      channelName: yt.channelName || 'Channel',
      period: { start: startDate, end: endDate },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Analytics error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
