import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import { parseClaudeJson } from '@/lib/parse-claude-json';

export const maxDuration = 60;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim();

interface TrafficRow { insightTrafficSourceType: string; views: number; estimatedMinutesWatched: number }
interface CountryRow { country: string; views: number; estimatedMinutesWatched: number }
interface VideoRow { video: string; views: number; estimatedMinutesWatched: number; averageViewDuration: number; likes: number; subscribersGained: number }
interface DailyRow { day: string; views: number; estimatedMinutesWatched: number; subscribersGained: number; subscribersLost: number }

async function queryAnalytics(token: string, channelId: string, params: Record<string, string>) {
  const base = 'https://youtubeanalytics.googleapis.com/v2/reports';
  const qs = new URLSearchParams({ ids: `channel==${channelId}`, ...params });
  const res = await fetch(`${base}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Analytics API ${res.status}`);
  }
  return res.json();
}

function toRows<T>(data: { columnHeaders: { name: string }[]; rows?: unknown[][] }): T[] {
  if (!data.rows?.length) return [];
  const headers = data.columnHeaders.map(h => h.name);
  return data.rows.map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj as T;
  });
}

export async function GET(request: Request) {
  const lang = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'es';
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

  const now = new Date();
  const endDate = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10); // 2 days ago (analytics delay)
  const startDate28 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const startDate90 = new Date(now.getTime() - 92 * 86400000).toISOString().slice(0, 10);

  try {
    // Run queries in parallel
    const [overviewRes, trafficRes, countryRes, topVideosRes, dailyRes] = await Promise.all([
      // Overview metrics (28 days)
      queryAnalytics(token, yt.channelId, {
        startDate: startDate28,
        endDate,
        metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares',
      }),
      // Traffic sources (28 days)
      queryAnalytics(token, yt.channelId, {
        startDate: startDate28,
        endDate,
        metrics: 'views,estimatedMinutesWatched',
        dimensions: 'insightTrafficSourceType',
        sort: '-views',
      }),
      // Top countries (28 days)
      queryAnalytics(token, yt.channelId, {
        startDate: startDate28,
        endDate,
        metrics: 'views,estimatedMinutesWatched',
        dimensions: 'country',
        sort: '-views',
        maxResults: '10',
      }),
      // Top videos (28 days)
      queryAnalytics(token, yt.channelId, {
        startDate: startDate28,
        endDate,
        metrics: 'views,estimatedMinutesWatched,averageViewDuration,likes,subscribersGained',
        dimensions: 'video',
        sort: '-views',
        maxResults: '10',
      }),
      // Daily timeline (90 days)
      queryAnalytics(token, yt.channelId, {
        startDate: startDate90,
        endDate,
        metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost',
        dimensions: 'day',
        sort: 'day',
      }),
    ]);

    // Parse overview (single row)
    const ovHeaders = overviewRes.columnHeaders?.map((h: { name: string }) => h.name) || [];
    const ovRow = overviewRes.rows?.[0] || [];
    const overview: Record<string, number> = {};
    ovHeaders.forEach((h: string, i: number) => { overview[h] = Number(ovRow[i]) || 0; });

    // Parse traffic sources
    const traffic = toRows<TrafficRow>(trafficRes);

    // Parse countries
    const countries = toRows<CountryRow>(countryRes);

    // Parse top videos — resolve video titles
    const topVideos = toRows<VideoRow>(topVideosRes);
    let videoTitles: Record<string, string> = {};
    if (topVideos.length > 0) {
      const ids = topVideos.map(v => v.video).join(',');
      const vidsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (vidsRes.ok) {
        const vidsData = await vidsRes.json();
        for (const item of (vidsData.items || [])) {
          videoTitles[item.id] = item.snippet?.title || item.id;
        }
      }
    }

    // Parse daily
    const daily = toRows<DailyRow>(dailyRes);
    const resolvedTopVideos = topVideos.map(v => ({ ...v, title: videoTitles[v.video] || v.video }));

    // AI-written analysis of what the numbers mean
    let aiInsight: { es: string; en: string } | null = null;
    if (ANTHROPIC_API_KEY) {
      try {
        const topTraffic = traffic.slice(0, 3).map(tr => `${tr.insightTrafficSourceType}: ${tr.views} views`).join(', ');
        const topCountriesStr = countries.slice(0, 3).map(c => `${c.country}: ${c.views} views`).join(', ');
        const topVideosStr = resolvedTopVideos.slice(0, 3).map(v => `"${v.title}" (${v.views} views, ${v.subscribersGained} subs gained)`).join('\n');

        const prompt = `You are a YouTube growth expert. Analyze this channel's last-28-days analytics and explain what stands out, in plain language a creator can act on. Reply in ${lang === 'en' ? 'English' : 'Spanish'}.

Views: ${overview.views || 0} | Watch time: ${Math.round((overview.estimatedMinutesWatched || 0) / 60)}h | Avg view duration: ${overview.averageViewDuration || 0}s | Avg % viewed: ${overview.averageViewPercentage || 0}%
Subscribers: +${overview.subscribersGained || 0} / -${overview.subscribersLost || 0} | Likes: ${overview.likes || 0} | Comments: ${overview.comments || 0}
Top traffic sources: ${topTraffic || 'none'}
Top countries: ${topCountriesStr || 'none'}
Top videos:
${topVideosStr || 'none'}

Reply ONLY with valid JSON: {"es": "...", "en": "..."}
2-3 short paragraphs, under 180 words. Call out the single most actionable pattern (a traffic source to lean into, a country to target, a video's approach to repeat). No markdown, no headers.`;

        // Este insight es OPCIONAL y va detrás de 5 llamadas a YouTube dentro de un
        // route con maxDuration=60. Sin un tope propio, un Anthropic lento agota el
        // límite de la plataforma — y ese timeout no se puede capturar, así que se
        // perdería TODO el payload de analytics, no solo el insight. De ahí el abort.
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 15_000);
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
              max_tokens: 1200,
              messages: [{ role: 'user', content: prompt }],
            }),
            signal: ac.signal,
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.content?.[0]?.text || '';
            const parsed = parseClaudeJson<{ es?: string; en?: string }>(text);
            if (parsed.es && parsed.en) aiInsight = { es: parsed.es, en: parsed.en };
          }
        } finally {
          clearTimeout(timer);
        }
      } catch { /* AI insight is optional — don't fail the page */ }
    }

    return NextResponse.json({
      overview,
      traffic,
      countries,
      topVideos: resolvedTopVideos,
      daily,
      aiInsight,
      channelName: yt.channelName || 'Channel',
      period: { start: startDate28, end: endDate },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Analytics error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
