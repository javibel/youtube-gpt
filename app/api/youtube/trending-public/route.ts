import { NextResponse } from 'next/server';

export const maxDuration = 15;
export const revalidate = 1800; // Cache 30 min (ISR)

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!.trim();

const CATEGORY_MAP: Record<string, { es: string; en: string }> = {
  '1': { es: 'Cine y animación', en: 'Film & Animation' },
  '10': { es: 'Música', en: 'Music' },
  '17': { es: 'Deportes', en: 'Sports' },
  '20': { es: 'Gaming', en: 'Gaming' },
  '22': { es: 'Gente y blogs', en: 'People & Blogs' },
  '23': { es: 'Comedia', en: 'Comedy' },
  '24': { es: 'Entretenimiento', en: 'Entertainment' },
  '25': { es: 'Noticias', en: 'News & Politics' },
  '26': { es: 'Estilo de vida', en: 'Howto & Style' },
  '27': { es: 'Educación', en: 'Education' },
  '28': { es: 'Ciencia y tecnología', en: 'Science & Technology' },
};

const REGION_TO_HL: Record<string, string> = {
  ES: 'es', MX: 'es', AR: 'es', CO: 'es',
  US: 'en', GB: 'en', CA: 'en',
  BR: 'pt', FR: 'fr', DE: 'de', JP: 'ja', IN: 'hi',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const region = url.searchParams.get('region') || 'US';

  if (!/^[A-Z]{2}$/.test(region)) {
    return NextResponse.json({ error: 'invalid_region' }, { status: 400 });
  }

  try {
    const hl = REGION_TO_HL[region] || 'en';
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&regionCode=${region}&hl=${hl}&maxResults=20&key=${YOUTUBE_API_KEY}`;

    const res = await fetch(apiUrl, { next: { revalidate: 1800 } });
    if (!res.ok) {
      return NextResponse.json({ error: 'YouTube API error' }, { status: 500 });
    }

    const data = await res.json();

    function parseDuration(iso: string | undefined): number {
      if (!iso) return 0;
      const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!m) return 0;
      return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0');
    }

    const items = (data.items || []).map((item: {
      id: string;
      snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } }; publishedAt: string; categoryId: string };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
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
        thumbnail: item.snippet.thumbnails?.medium?.url || '',
        publishedAt: item.snippet.publishedAt,
        categoryLabel: CATEGORY_MAP[catId] || { es: 'Otro', en: 'Other' },
        views,
        likes,
        comments,
        vph: Math.round(views / hoursAge),
        durationSec: parseDuration(item.contentDetails?.duration),
      };
    });

    return NextResponse.json({ items, region, updatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
  }
}
