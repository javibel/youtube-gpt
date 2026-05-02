import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';

export const maxDuration = 60;

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim();

// Average CPM by country (USD) — conservative estimates
const COUNTRY_CPM: Record<string, number> = {
  US: 7.5, CA: 6.5, GB: 6.0, AU: 6.0, DE: 5.5, FR: 4.5, NL: 5.0,
  SE: 5.5, NO: 6.0, DK: 5.5, CH: 7.0, AT: 5.0, BE: 4.5, IE: 5.5,
  JP: 4.0, KR: 3.5, SG: 4.0, NZ: 5.0, FI: 5.0, IT: 3.5, ES: 3.0,
  PT: 2.5, BR: 1.5, MX: 2.0, AR: 1.0, CO: 1.5, CL: 2.0, PE: 1.0,
  IN: 0.8, PH: 0.7, ID: 0.6, TH: 0.8, VN: 0.5, PK: 0.5,
  PL: 2.5, CZ: 2.5, RO: 1.5, HU: 2.0, TR: 1.0, RU: 1.5,
  ZA: 2.0, EG: 0.8, NG: 0.5, KE: 0.5,
};
const DEFAULT_CPM = 2.0;

function getCPM(country: string): number {
  return COUNTRY_CPM[country.toUpperCase()] ?? DEFAULT_CPM;
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
  const startDate28 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const startDate90 = new Date(now.getTime() - 92 * 86400000).toISOString().slice(0, 10);

  try {
    // 1. Try to get real revenue data (only works for monetized channels)
    let hasRealRevenue = false;
    let realRevenue28 = 0;

    try {
      const revRes = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${yt.channelId}&startDate=${startDate28}&endDate=${endDate}&metrics=estimatedRevenue&dimensions=day&sort=day`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (revRes.ok) {
        const revData = await revRes.json();
        if (revData.rows?.length) {
          hasRealRevenue = true;
          realRevenue28 = revData.rows.reduce((s: number, r: unknown[]) => s + (Number(r[1]) || 0), 0);
        }
      }
    } catch { /* Not monetized or no access */ }

    // 2. Get views by country (28 days) for CPM-weighted estimation
    const [countryRes, videoRes, dailyRes] = await Promise.all([
      fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${yt.channelId}&startDate=${startDate28}&endDate=${endDate}&metrics=views,estimatedMinutesWatched&dimensions=country&sort=-views&maxResults=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
      // Top videos last 28 days
      fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${yt.channelId}&startDate=${startDate28}&endDate=${endDate}&metrics=views,estimatedMinutesWatched&dimensions=video&sort=-views&maxResults=15`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
      // Daily views 90 days for projection
      fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${yt.channelId}&startDate=${startDate90}&endDate=${endDate}&metrics=views,estimatedMinutesWatched&dimensions=month&sort=month`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
    ]);

    // Parse country data
    interface CountryRow { country: string; views: number; watchTime: number; cpm: number; estimatedRevenue: number }
    const countries: CountryRow[] = [];
    let totalViews28 = 0;
    let totalWatchTime28 = 0;

    if (countryRes.ok) {
      const cData = await countryRes.json();
      for (const row of cData.rows || []) {
        const country = String(row[0]);
        const views = Number(row[1]) || 0;
        const watchTime = Number(row[2]) || 0;
        const cpm = getCPM(country);
        countries.push({
          country,
          views,
          watchTime,
          cpm,
          estimatedRevenue: (views / 1000) * cpm,
        });
        totalViews28 += views;
        totalWatchTime28 += watchTime;
      }
    }

    // Weighted average CPM
    const weightedCPM = totalViews28 > 0
      ? countries.reduce((s, c) => s + c.cpm * (c.views / totalViews28), 0)
      : DEFAULT_CPM;

    const estimatedRevenue28 = hasRealRevenue ? realRevenue28 : (totalViews28 / 1000) * weightedCPM;

    // Parse video data — get titles from YouTube Data API
    interface VideoRevenue { videoId: string; title: string; views: number; watchTime: number; estimatedRevenue: number; thumbnail: string }
    const videos: VideoRevenue[] = [];

    if (videoRes.ok) {
      const vData = await videoRes.json();
      const videoIds = (vData.rows || []).map((r: unknown[]) => String(r[0]));
      const videoRows = vData.rows || [];

      // Fetch titles
      let titleMap: Record<string, { title: string; thumbnail: string }> = {};
      if (videoIds.length > 0 && YT_API_KEY) {
        try {
          const detRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}&key=${YT_API_KEY}`
          );
          if (detRes.ok) {
            const detData = await detRes.json();
            for (const item of detData.items || []) {
              titleMap[item.id] = {
                title: item.snippet?.title || item.id,
                thumbnail: item.snippet?.thumbnails?.medium?.url || '',
              };
            }
          }
        } catch { /* */ }
      }

      for (const row of videoRows) {
        const videoId = String(row[0]);
        const views = Number(row[1]) || 0;
        const watchTime = Number(row[2]) || 0;
        const info = titleMap[videoId] || { title: videoId, thumbnail: '' };
        videos.push({
          videoId,
          title: info.title,
          views,
          watchTime,
          estimatedRevenue: hasRealRevenue
            ? (views / totalViews28) * realRevenue28
            : (views / 1000) * weightedCPM,
          thumbnail: info.thumbnail,
        });
      }
    }

    // Monthly trend
    interface MonthData { month: string; views: number; watchTime: number; estimatedRevenue: number }
    const months: MonthData[] = [];
    if (dailyRes.ok) {
      const mData = await dailyRes.json();
      for (const row of mData.rows || []) {
        const month = String(row[0]);
        const views = Number(row[1]) || 0;
        const watchTime = Number(row[2]) || 0;
        months.push({
          month,
          views,
          watchTime,
          estimatedRevenue: hasRealRevenue
            ? (views / Math.max(totalViews28, 1)) * realRevenue28
            : (views / 1000) * weightedCPM,
        });
      }
    }

    // Annual projection
    const dailyAvgRevenue = estimatedRevenue28 / 28;
    const monthlyProjection = dailyAvgRevenue * 30;
    const yearlyProjection = dailyAvgRevenue * 365;

    // AI optimization potential
    let aiInsights: {
      optimizationPotential: string;
      missedRevenue: string;
      tips: string[];
      cpmStrategy: string;
    } | null = null;

    if (ANTHROPIC_API_KEY) {
      const topCountries = countries.slice(0, 5).map(c => `${c.country}: ${c.views} views, $${c.cpm} CPM`).join(', ');
      const avgWatchMin = totalViews28 > 0 ? (totalWatchTime28 / totalViews28).toFixed(1) : '0';

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
              content: `Analyze this YouTube channel's revenue data and suggest optimization. Reply in ${lang === 'en' ? 'English' : 'Spanish'}. Output ONLY valid JSON:
{"optimizationPotential":"1-2 sentences about how much more they could earn","missedRevenue":"estimated monthly $ they're leaving on the table","tips":["tip1","tip2","tip3"],"cpmStrategy":"1-2 sentences about how to attract higher-CPM audiences"}

Channel: "${yt.channelName || 'Unknown'}"
Monthly views: ${totalViews28} (28d)
Avg watch time per view: ${avgWatchMin} minutes
Weighted CPM: $${weightedCPM.toFixed(2)}
Top countries: ${topCountries}
${hasRealRevenue ? `Real revenue (28d): $${realRevenue28.toFixed(2)}` : 'Not monetized or no revenue data'}
Monthly projection: $${monthlyProjection.toFixed(2)}
Top video views: ${videos.slice(0, 3).map(v => `"${v.title}" (${v.views})`).join(', ')}`,
            }],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.content?.[0]?.text || '';
          try {
            aiInsights = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
          } catch { /* */ }
        }
      } catch { /* */ }
    }

    return NextResponse.json({
      hasRealRevenue,
      revenue28d: estimatedRevenue28,
      weightedCPM,
      totalViews28,
      totalWatchTime28,
      countries,
      videos,
      months,
      projection: {
        daily: dailyAvgRevenue,
        monthly: monthlyProjection,
        yearly: yearlyProjection,
      },
      aiInsights,
      channelName: yt.channelName || 'Channel',
      period: { start: startDate28, end: endDate },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Revenue error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
