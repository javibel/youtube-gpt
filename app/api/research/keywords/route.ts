import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { handleExtensionKeywords, type ExtensionKeywordContext } from '@/lib/extension-keywords-native-authorization';
import { analyzeExtensionKeywords } from '@/lib/extension-keywords-analysis';
import { fetchGoogleTrends, estimateSearchVolume } from '@/lib/volume-estimate';
import { getUserPlan, isPaid } from '@/lib/plans';

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

interface VideoItem {
  videoId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
  likes: number;
}

interface TrendingItem {
  videoId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  views: number;
  ageHours: number;
  vph: number;
}

export async function POST(request: Request) {
  if (request.headers.has('authorization')) return handleExtensionKeywords(request, analyzeExtensionKeywords);
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Native extension purpose is separate and remains available to Free users.
  // The web branch keeps its existing session and Pro checks.
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'pro_required' }, { status: 403 });
    }
    const plan = await getUserPlan(user.id);
    if (!isPaid(plan)) {
      return NextResponse.json({ error: 'pro_required' }, { status: 403 });
    }
  }

  if (!YT_API_KEY) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
  }

  const { keyword } = await request.json();
  if (!keyword?.trim()) {
    return NextResponse.json({ error: 'Missing keyword' }, { status: 400 });
  }
  if (keyword.trim().length > 200) {
    return NextResponse.json({ error: 'Keyword too long (max 200 characters)' }, { status: 400 });
  }

  return analyzeKeywords(keyword);
}

async function analyzeKeywords(keyword: string, native?: ExtensionKeywordContext) {
  const step = <T,>(operation: () => Promise<T>): Promise<T> => native ? native.step(operation) : operation();
  const reply = (data: unknown, expiresAt?: Date) => native ? native.reply(data, expiresAt) : Promise.resolve(NextResponse.json(data));
  const fetchSource = (url: string, init?: RequestInit) => step(() => fetch(url, native ? { ...init, cache: 'no-store', redirect: 'error' } : init));
  if (!YT_API_KEY) { if (native) throw Error('Keyword source unavailable'); return NextResponse.json({ error: 'no_api_key' }, { status: 503 }); }
  const kwNorm = keyword.trim().toLowerCase();
  const cacheKey = `kw:${kwNorm}`;
  const cached = await step(() => prisma.youtubeCache.findUnique({ where: { key: cacheKey } }));
  if (cached && cached.expiresAt > new Date()) {
    return reply(cached.data, cached.expiresAt);
  }

  try {
    // Start Google Trends fetch early (runs in parallel with YouTube calls)
    const volCacheKey = `vol:${kwNorm}`;
    const volCached = await step(() => prisma.youtubeCache.findUnique({ where: { key: volCacheKey } }));
    const trendsPromise = volCached && volCached.expiresAt > new Date()
      ? Promise.resolve((volCached.data as { trendsScore?: number })?.trendsScore ?? null)
      : fetchGoogleTrends(keyword, native?.step).catch(() => null);

    // 1. Search top videos for keyword
    const searchRes = await fetchSource(
      `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&maxResults=5&order=viewCount&key=${YT_API_KEY}`
    );
    const searchData = await step(() => searchRes.json());

    if (!searchRes.ok) {
      if (native) throw Error('Keyword source unavailable');
      return NextResponse.json(
        { error: searchData.error?.message || 'YouTube API error' },
        { status: 500 }
      );
    }

    const items = searchData.items || [];
    const videoIds = items.map((item: { id: { videoId: string } }) => item.id.videoId).join(',');
    const totalResults: number = searchData.pageInfo?.totalResults || 0;

    // 2. Get video stats
    let topVideos: VideoItem[] = [];
    if (videoIds) {
      const statsRes = await fetchSource(
        `${YT_BASE}/videos?part=statistics,snippet&id=${videoIds}&key=${YT_API_KEY}`
      );
      const statsData = await step(() => statsRes.json());
      if (native && !statsRes.ok) throw Error('Keyword source unavailable');
      topVideos = (statsData.items || []).map((v: {
        id: string;
        snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } }; publishedAt: string };
        statistics: { viewCount?: string; likeCount?: string };
      }) => ({
        videoId: v.id,
        title: v.snippet?.title || '',
        channelName: v.snippet?.channelTitle || '',
        thumbnail: v.snippet?.thumbnails?.medium?.url || '',
        publishedAt: v.snippet?.publishedAt || '',
        views: parseInt(v.statistics?.viewCount || '0', 10),
        likes: parseInt(v.statistics?.likeCount || '0', 10),
      }));
    }

    // P8 (vidIQ teardown) — "trending ahora" para esta keyword: vidIQ muestra los 10
    // vídeos que están ganando vistas AHORA para un término, no los más vistos de toda la
    // vida (eso ya es `topVideos` arriba). Aproximación barata sin snapshots históricos:
    // de los 15 más recientes, calcular vistas/hora desde su publicación y quedarnos con
    // los que más rápido suben. Falla en silencio — es un extra sobre el resultado
    // principal, no debe tumbar la respuesta si la API tropieza.
    let trendingNow: TrendingItem[] = [];
    try {
      const recentRes = await fetchSource(
        `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&maxResults=15&order=date&key=${YT_API_KEY}`
      );
      const recentData = await step(() => recentRes.json());
      const recentIds = (recentData.items || [])
        .map((item: { id: { videoId: string } }) => item.id.videoId)
        .join(',');
      if (recentRes.ok && recentIds) {
        const recentStatsRes = await fetchSource(
          `${YT_BASE}/videos?part=statistics,snippet&id=${recentIds}&key=${YT_API_KEY}`
        );
        const recentStatsData = await step(() => recentStatsRes.json());
        if (native && !recentStatsRes.ok) throw Error('Keyword source unavailable');
        trendingNow = (recentStatsData.items || [])
          .map((v: {
            id: string;
            snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } }; publishedAt: string };
            statistics: { viewCount?: string };
          }) => {
            const views = parseInt(v.statistics?.viewCount || '0', 10);
            const ageHours = Math.max(1, (Date.now() - new Date(v.snippet?.publishedAt || Date.now()).getTime()) / 3_600_000);
            return {
              videoId: v.id,
              title: v.snippet?.title || '',
              channelName: v.snippet?.channelTitle || '',
              thumbnail: v.snippet?.thumbnails?.medium?.url || '',
              views,
              ageHours: Math.round(ageHours),
              vph: Math.round((views / ageHours) * 10) / 10,
            };
          })
          .filter((v: TrendingItem) => v.ageHours <= 24 * 30) // últimos 30 días — "ahora", no un reupload viejo
          .sort((a: TrendingItem, b: TrendingItem) => b.vph - a.vph)
          .slice(0, 6);
      }
    } catch {
      // no-fatal — el resto de la respuesta (competencia, relacionadas) sigue siendo válido
    }

    // 3. Competition score based on avg views of top 5
    const avgViews =
      topVideos.length > 0
        ? topVideos.reduce((s, v) => s + v.views, 0) / topVideos.length
        : 0;

    let competition: 'low' | 'medium' | 'high';
    let competitionScore: number;

    if (avgViews > 1_000_000 || totalResults > 5_000_000) {
      competition = 'high';
      competitionScore = Math.min(95, 72 + Math.floor(avgViews / 2_000_000) * 3);
    } else if (avgViews > 100_000 || totalResults > 500_000) {
      competition = 'medium';
      competitionScore = 42 + Math.floor(avgViews / 100_000) * 4;
      competitionScore = Math.min(71, competitionScore);
    } else {
      competition = 'low';
      competitionScore = Math.max(8, Math.floor(avgViews / 5_000));
      competitionScore = Math.min(41, competitionScore);
    }

    // 4. Opportunity score (inverse of competition + demand bonus)
    const demandBonus = topVideos[0]?.views > 500_000 ? 12 : topVideos[0]?.views > 100_000 ? 6 : 0;
    const opportunityScore = Math.max(5, Math.min(98, 100 - competitionScore + demandBonus));

    // 5. Related keywords via YouTube autocomplete (no key needed)
    let relatedKeywords: string[] = [];
    try {
      const autoRes = await fetchSource(
        `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(keyword)}&hl=es`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const text = await step(() => autoRes.text());
      // Response format: window.google.ac.h(["keyword", [["suggestion", 0, [512,433]], ...], {...}])
      const pStart = text.indexOf('(');
      const pEnd = text.lastIndexOf(')');
      if (pStart !== -1 && pEnd !== -1) {
        const parsed = JSON.parse(text.slice(pStart + 1, pEnd));
        const suggestions = parsed[1] || [];
        relatedKeywords = suggestions.slice(0, 8).map((item: [string]) => item[0]).filter(Boolean);
      }
    } catch {
      // Autocomplete is unofficial — fail silently
    }

    // 6. Search volume estimation
    const trendsScore = await step(() => trendsPromise);
    const volumeEstimate = await step(() => estimateSearchVolume({
      keyword,
      totalResults,
      avgViews: Math.round(avgViews),
      relatedKeywords,
      trendsScore,
    }, native?.step));

    // Cache volume estimate separately (7-day TTL — volume changes slowly)
    if (!volCached || volCached.expiresAt <= new Date()) {
      const volData = { ...volumeEstimate, trendsScore } as unknown as Prisma.InputJsonValue;
      await step(() => prisma.youtubeCache.upsert({
        where: { key: volCacheKey },
        create: { key: volCacheKey, data: volData, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
        update: { data: volData, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
      }));
    }

    const result = {
      keyword,
      totalResults,
      competition,
      competitionScore,
      opportunityScore,
      avgViews: Math.round(avgViews),
      topVideos,
      trendingNow,
      relatedKeywords,
      volumeEstimate,
    };

    // Cache for 24h (upsert so concurrent requests don't error)
    const cacheData = result as unknown as Prisma.InputJsonValue;
    await step(() => prisma.youtubeCache.upsert({
      where: { key: cacheKey },
      create: { key: cacheKey, data: cacheData, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
      update: { data: cacheData, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
    }));

    return reply(result);
  } catch (err) {
    if (native) throw err;
    console.error('[research/keywords]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
