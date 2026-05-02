import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getUserPlan, isPaid } from '@/lib/plans';

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

const QUESTION_PREFIXES_ES = ['cómo', 'qué', 'por qué', 'cuándo', 'cuál es', 'dónde', 'es posible', 'se puede'];
const QUESTION_PREFIXES_EN = ['how to', 'what is', 'why', 'when', 'can you', 'does', 'how do', 'what are'];

interface QuestionResult {
  question: string;
  competition: 'low' | 'medium' | 'high';
  competitionScore: number;
  totalResults: number;
  topVideo: {
    videoId: string;
    title: string;
    channelName: string;
    thumbnail: string;
    views: number;
  } | null;
}

async function fetchAutocomplete(query: string, lang: string): Promise<string[]> {
  try {
    const hl = lang === 'en' ? 'en' : 'es';
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}&hl=${hl}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const text = await res.text();
    const bracketMatch = text.match(/\["[^"]*",\s*\[(\[[\s\S]*?\])\s*\]/);
    if (bracketMatch) {
      const inner = JSON.parse(`[${bracketMatch[1]}]`);
      return inner.map((item: [string]) => item[0]).filter(Boolean);
    }
  } catch { /* fail silently */ }
  return [];
}

async function getTopVideoForQuery(query: string): Promise<QuestionResult['topVideo'] & { totalResults: number } | null> {
  try {
    const searchRes = await fetch(
      `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&order=relevance&key=${YT_API_KEY}`
    );
    const searchData = await searchRes.json();
    const item = searchData.items?.[0];
    const totalResults = searchData.pageInfo?.totalResults || 0;
    if (!item) return null;

    const videoId = item.id?.videoId;
    if (!videoId) return null;

    const statsRes = await fetch(
      `${YT_BASE}/videos?part=statistics,snippet&id=${videoId}&key=${YT_API_KEY}`
    );
    const statsData = await statsRes.json();
    const v = statsData.items?.[0];
    if (!v) return null;

    return {
      videoId,
      title: v.snippet?.title || '',
      channelName: v.snippet?.channelTitle || '',
      thumbnail: v.snippet?.thumbnails?.medium?.url || '',
      views: parseInt(v.statistics?.viewCount || '0', 10),
      totalResults,
    };
  } catch {
    return null;
  }
}

function scoreCompetition(views: number, totalResults: number): { competition: 'low' | 'medium' | 'high'; competitionScore: number } {
  if (views > 1_000_000 || totalResults > 5_000_000) {
    return { competition: 'high', competitionScore: Math.min(95, 72 + Math.floor(views / 2_000_000) * 3) };
  }
  if (views > 100_000 || totalResults > 500_000) {
    return { competition: 'medium', competitionScore: Math.min(71, 42 + Math.floor(views / 100_000) * 4) };
  }
  return { competition: 'low', competitionScore: Math.max(8, Math.min(41, Math.floor(views / 5_000))) };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  if (!YT_API_KEY) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
  }

  const { keyword, lang = 'es' } = await request.json();
  if (!keyword?.trim()) {
    return NextResponse.json({ error: 'Missing keyword' }, { status: 400 });
  }

  const kwNorm = keyword.trim().toLowerCase();
  const cacheKey = `questions:${kwNorm}:${lang}`;
  const cached = await prisma.youtubeCache.findUnique({ where: { key: cacheKey } });
  if (cached && cached.expiresAt > new Date()) {
    return NextResponse.json(cached.data);
  }

  try {
    const prefixes = lang === 'en' ? QUESTION_PREFIXES_EN : QUESTION_PREFIXES_ES;

    // Fetch autocomplete for all question prefixes in parallel
    const allSuggestions = await Promise.all(
      prefixes.map(prefix => fetchAutocomplete(`${prefix} ${kwNorm}`, lang))
    );

    // Deduplicate and collect unique questions
    const seen = new Set<string>();
    const questions: string[] = [];
    for (const suggestions of allSuggestions) {
      for (const s of suggestions) {
        const norm = s.toLowerCase().trim();
        if (!seen.has(norm) && norm !== kwNorm && norm.length > kwNorm.length + 3) {
          seen.add(norm);
          questions.push(s);
        }
      }
    }

    // Also add direct autocomplete (without prefix) filtered to question-like results
    const directSuggestions = await fetchAutocomplete(kwNorm, lang);
    const questionWords = lang === 'en'
      ? ['how', 'what', 'why', 'when', 'where', 'which', 'can', 'does', 'do', 'is', 'are', 'will', 'should']
      : ['cómo', 'qué', 'por qué', 'cuándo', 'dónde', 'cuál', 'se puede', 'es posible', 'hay', 'tiene'];
    for (const s of directSuggestions) {
      const lower = s.toLowerCase().trim();
      if (!seen.has(lower) && questionWords.some(w => lower.startsWith(w))) {
        seen.add(lower);
        questions.push(s);
      }
    }

    // Limit to top 12 questions, get top video for each (in batches of 4 to control API usage)
    const topQuestions = questions.slice(0, 12);
    const results: QuestionResult[] = [];

    for (let i = 0; i < topQuestions.length; i += 4) {
      const batch = topQuestions.slice(i, i + 4);
      const videoPromises = batch.map(q => getTopVideoForQuery(q));
      const videos = await Promise.all(videoPromises);

      for (let j = 0; j < batch.length; j++) {
        const videoData = videos[j];
        const views = videoData?.views || 0;
        const totalResults = videoData?.totalResults || 0;
        const { competition, competitionScore } = scoreCompetition(views, totalResults);

        results.push({
          question: batch[j],
          competition,
          competitionScore,
          totalResults,
          topVideo: videoData ? {
            videoId: videoData.videoId,
            title: videoData.title,
            channelName: videoData.channelName,
            thumbnail: videoData.thumbnail,
            views: videoData.views,
          } : null,
        });
      }
    }

    // Sort: low competition first (better opportunities)
    results.sort((a, b) => a.competitionScore - b.competitionScore);

    const response = { keyword, lang, questions: results };

    // Cache for 24h
    await prisma.youtubeCache.upsert({
      where: { key: cacheKey },
      create: { key: cacheKey, data: response as unknown as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
      update: { data: response as unknown as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
    });

    return NextResponse.json(response);
  } catch (err) {
    console.error('[research/questions]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
