import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';

export const maxDuration = 30;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;

// YouTube category IDs → labels
const CATEGORY_MAP: Record<string, { es: string; en: string }> = {
  '1': { es: 'Cine y animación', en: 'Film & Animation' },
  '2': { es: 'Coches y vehículos', en: 'Autos & Vehicles' },
  '10': { es: 'Música', en: 'Music' },
  '15': { es: 'Mascotas y animales', en: 'Pets & Animals' },
  '17': { es: 'Deportes', en: 'Sports' },
  '19': { es: 'Viajes y eventos', en: 'Travel & Events' },
  '20': { es: 'Gaming', en: 'Gaming' },
  '22': { es: 'Gente y blogs', en: 'People & Blogs' },
  '23': { es: 'Comedia', en: 'Comedy' },
  '24': { es: 'Entretenimiento', en: 'Entertainment' },
  '25': { es: 'Noticias', en: 'News & Politics' },
  '26': { es: 'Estilo de vida', en: 'Howto & Style' },
  '27': { es: 'Educación', en: 'Education' },
  '28': { es: 'Ciencia y tecnología', en: 'Science & Technology' },
};

interface TrendingItem {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  thumbnail: string;
  publishedAt: string;
  categoryId: string;
  categoryLabel: { es: string; en: string };
  views: number;
  likes: number;
  comments: number;
  vph: number; // views per hour since publish
  engagementRate: number;
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

  const url = new URL(request.url);
  const region = url.searchParams.get('region') || 'US';
  const categoryId = url.searchParams.get('category') || '';

  // Validate region (2-letter ISO)
  if (!/^[A-Z]{2}$/.test(region)) {
    return NextResponse.json({ error: 'invalid_region' }, { status: 400 });
  }

  try {
    // Fetch trending from YouTube
    let apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&regionCode=${region}&maxResults=50&key=${YOUTUBE_API_KEY}`;
    if (categoryId && CATEGORY_MAP[categoryId]) {
      apiUrl += `&videoCategoryId=${categoryId}`;
    }

    const res = await fetch(apiUrl);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err.error?.message || 'YouTube API error' }, { status: 500 });
    }

    const data = await res.json();
    const items: TrendingItem[] = (data.items || []).map((item: {
      id: string;
      snippet: { title: string; channelTitle: string; channelId: string; thumbnails?: { medium?: { url: string } }; publishedAt: string; categoryId: string };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
    }) => {
      const views = parseInt(item.statistics.viewCount || '0', 10);
      const likes = parseInt(item.statistics.likeCount || '0', 10);
      const comments = parseInt(item.statistics.commentCount || '0', 10);
      const hoursAge = Math.max(1, (Date.now() - new Date(item.snippet.publishedAt).getTime()) / 3600000);
      const catId = item.snippet.categoryId || '22';

      return {
        videoId: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        channelId: item.snippet.channelId,
        thumbnail: item.snippet.thumbnails?.medium?.url || '',
        publishedAt: item.snippet.publishedAt,
        categoryId: catId,
        categoryLabel: CATEGORY_MAP[catId] || { es: 'Otro', en: 'Other' },
        views,
        likes,
        comments,
        vph: Math.round(views / hoursAge),
        engagementRate: views > 0 ? Math.round(((likes + comments) / views) * 10000) / 100 : 0,
      };
    });

    // Get user's channel data for relevance scoring
    const yt = await prisma.youtubeToken.findUnique({
      where: { userId: session.user.id },
      select: { channelName: true, subscribers: true },
    });

    // Get user's recent video categories for relevance
    const userCategories = new Set<string>();
    if (yt) {
      const recentScores = await prisma.videoSeoScore.findMany({
        where: { userId: session.user.id },
        orderBy: { analyzedAt: 'desc' },
        take: 10,
        select: { checklist: true },
      });
      // We don't store category in SEO scores — skip for now
    }

    return NextResponse.json({
      items,
      region,
      categoryId: categoryId || null,
      categories: CATEGORY_MAP,
      totalResults: items.length,
    });
  } catch (e) {
    console.error('[youtube/trending] error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
