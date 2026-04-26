import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getExtensionUser } from '@/lib/extension-auth';

const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

const STOP_WORDS = new Set([
  'the','a','an','in','on','at','to','for','of','and','or','is','are','was','were',
  'with','this','that','my','your','how','what','why','when','i','you','he','she','we',
  'do','did','be','it','its','has','have','had','not','but','they','them','their',
  'el','la','los','las','un','una','de','del','en','con','por','para','que','y','o',
  'es','son','era','mi','tu','su','como','qué','por','más','muy','me','te','se','nos',
  'al','le','lo','si','ya','hay','sin','sobre','entre','desde','hasta','esto','ese',
]);

function extractKeywords(titles: string[]): string[] {
  const bigramFreq: Record<string, number> = {};

  for (const title of titles) {
    const words = title
      .toLowerCase()
      .replace(/[^a-záéíóúüña-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    // Build bigrams from consecutive non-stopword tokens
    for (let i = 0; i < words.length - 1; i++) {
      const w1 = words[i];
      const w2 = words[i + 1];
      if (STOP_WORDS.has(w1) || STOP_WORDS.has(w2)) continue;
      if (w1.length < 3 || w2.length < 3) continue;
      const bigram = `${w1} ${w2}`;
      bigramFreq[bigram] = (bigramFreq[bigram] || 0) + 1;
    }
  }

  // Take bigrams that appear at least twice, or top ones if not enough
  const sorted = Object.entries(bigramFreq).sort((a, b) => b[1] - a[1]);
  const frequent = sorted.filter(([, c]) => c >= 2).slice(0, 12).map(([k]) => k);
  if (frequent.length >= 6) return frequent;

  // Fallback: fill with top bigrams even if count = 1
  return sorted.slice(0, 12).map(([k]) => k);
}

function calcUploadFrequency(dates: string[], lang: 'es' | 'en'): string {
  if (dates.length < 2) return lang === 'es' ? 'Datos insuficientes' : 'Insufficient data';
  const sorted = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24));
  }
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (avg <= 1.5)  return lang === 'es' ? 'Diario'         : 'Daily';
  if (avg <= 4)    return lang === 'es' ? 'Varios/semana'  : 'Several/week';
  if (avg <= 9)    return lang === 'es' ? 'Semanal'        : 'Weekly';
  if (avg <= 18)   return lang === 'es' ? 'Bisemanal'      : 'Biweekly';
  if (avg <= 35)   return lang === 'es' ? 'Mensual'        : 'Monthly';
  return lang === 'es' ? 'Irregular'        : 'Irregular';
}

async function resolveChannelId(input: string): Promise<string | null> {
  const trimmed = input.trim();

  // Direct channel ID (UCxxxxxxxx)
  const ucMatch = trimmed.match(/(?:\/channel\/)?(UC[\w-]{22})/);
  if (ucMatch) return ucMatch[1];

  // @handle
  const handleMatch = trimmed.match(/@([\w.-]+)/);
  if (handleMatch) {
    const res = await fetch(
      `${YT_BASE}/channels?part=id&forHandle=${encodeURIComponent(handleMatch[1])}&key=${YT_API_KEY}`
    );
    const data = await res.json();
    return data.items?.[0]?.id || null;
  }

  // /c/name or /user/name — search by query
  const nameMatch = trimmed.match(/\/(?:c|user)\/([\w.-]+)/);
  if (nameMatch) {
    const res = await fetch(
      `${YT_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(nameMatch[1])}&maxResults=1&key=${YT_API_KEY}`
    );
    const data = await res.json();
    return data.items?.[0]?.snippet?.channelId || null;
  }

  return null;
}

export async function POST(request: Request) {
  const session = await auth();
  const extAuth = !session?.user ? await getExtensionUser(request) : null;
  if (!session?.user && !extAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (extAuth && !extAuth.isPro) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { subscription: { select: { status: true } } },
    });
    if (user?.subscription?.status !== 'active') {
      return NextResponse.json({ error: 'pro_required' }, { status: 403 });
    }
  }
  if (!YT_API_KEY) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
  }

  const { url, lang = 'es' } = await request.json();
  if (!url?.trim()) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  try {
    const channelId = await resolveChannelId(url);
    if (!channelId) {
      return NextResponse.json({ error: 'channel_not_found' }, { status: 404 });
    }

    // Channel info
    const channelRes = await fetch(
      `${YT_BASE}/channels?part=snippet,statistics&id=${channelId}&key=${YT_API_KEY}`
    );
    const channelData = await channelRes.json();
    const ch = channelData.items?.[0];
    if (!ch) return NextResponse.json({ error: 'channel_not_found' }, { status: 404 });

    // Top 10 videos by view count
    const searchRes = await fetch(
      `${YT_BASE}/search?part=snippet&channelId=${channelId}&order=viewCount&type=video&maxResults=10&key=${YT_API_KEY}`
    );
    const searchData = await searchRes.json();
    const videoIds = (searchData.items || [])
      .map((v: { id: { videoId: string } }) => v.id.videoId)
      .filter(Boolean)
      .join(',');

    let topVideos: {
      videoId: string; title: string; thumbnail: string;
      publishedAt: string; views: number; likes: number;
    }[] = [];

    if (videoIds) {
      const statsRes = await fetch(
        `${YT_BASE}/videos?part=statistics,snippet&id=${videoIds}&key=${YT_API_KEY}`
      );
      const statsData = await statsRes.json();
      topVideos = (statsData.items || []).map((v: {
        id: string;
        snippet: { title: string; thumbnails: { medium: { url: string } }; publishedAt: string };
        statistics: { viewCount?: string; likeCount?: string };
      }) => ({
        videoId: v.id,
        title: v.snippet?.title || '',
        thumbnail: v.snippet?.thumbnails?.medium?.url || '',
        publishedAt: v.snippet?.publishedAt || '',
        views: parseInt(v.statistics?.viewCount || '0', 10),
        likes: parseInt(v.statistics?.likeCount || '0', 10),
      }));
      topVideos.sort((a, b) => b.views - a.views);
    }

    // Recent 20 videos for upload frequency
    const recentRes = await fetch(
      `${YT_BASE}/search?part=snippet&channelId=${channelId}&order=date&type=video&maxResults=20&key=${YT_API_KEY}`
    );
    const recentData = await recentRes.json();
    const recentItems: { snippet: { publishedAt: string; title: string } }[] = recentData.items || [];
    const recentDates: string[] = recentItems.map(v => v.snippet?.publishedAt).filter(Boolean);
    const recentTitles: string[] = recentItems.map(v => v.snippet?.title).filter(Boolean);

    const uploadFrequency = calcUploadFrequency(recentDates, lang as 'es' | 'en');
    // Use all recent titles + top video titles for broader keyword coverage
    const allTitles = [...recentTitles, ...topVideos.map(v => v.title)];
    const keywords = extractKeywords(allTitles);

    return NextResponse.json({
      channel: {
        id: channelId,
        name: ch.snippet?.title || '',
        description: ch.snippet?.description?.slice(0, 200) || '',
        thumbnail: ch.snippet?.thumbnails?.medium?.url || '',
        country: ch.snippet?.country || null,
        subscribers: parseInt(ch.statistics?.subscriberCount || '0', 10),
        totalViews: parseInt(ch.statistics?.viewCount || '0', 10),
        videoCount: parseInt(ch.statistics?.videoCount || '0', 10),
      },
      topVideos,
      keywords,
      uploadFrequency,
      avgViews: topVideos.length
        ? Math.round(topVideos.reduce((s, v) => s + v.views, 0) / topVideos.length)
        : 0,
    });
  } catch (err) {
    console.error('[youtube/competitor]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
