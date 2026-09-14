import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import { getMessagesTask } from '@/lib/ai/task-runtime';

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();

interface CompetitorThumb {
  videoId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  views: number;
  publishedAt: string;
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.keyword !== 'string' || (body.thumbnailUrl != null && typeof body.thumbnailUrl !== 'string')) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const { keyword, thumbnailUrl, lang = 'es' } = body;

  if (!keyword?.trim()) {
    return NextResponse.json({ error: 'Missing keyword' }, { status: 400 });
  }

  // Fetch top 8 competitor videos for this keyword
  const competitors: CompetitorThumb[] = [];
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&maxResults=8&order=relevance&key=${YT_API_KEY}`
    );
    const searchData = await searchRes.json();
    const items = searchData.items || [];
    const videoIds = items.map((i: { id: { videoId: string } }) => i.id?.videoId).filter(Boolean);

    if (videoIds.length > 0) {
      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(',')}&key=${YT_API_KEY}`
      );
      const statsData = await statsRes.json();
      for (const v of (statsData.items || [])) {
        competitors.push({
          videoId: v.id,
          title: v.snippet?.title || '',
          channelName: v.snippet?.channelTitle || '',
          thumbnail: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || '',
          views: parseInt(v.statistics?.viewCount || '0', 10),
          publishedAt: v.snippet?.publishedAt || '',
        });
      }
    }
  } catch { /* continue without competitors */ }

  // CTR analysis via Claude Vision (if user provides a thumbnail URL)
  let ctrAnalysis: {
    score: number;
    breakdown: { category: string; score: number; tip: string }[];
    summary: string;
  } | null = null;

  if (thumbnailUrl) {
    try {
      const competitorContext = competitors.slice(0, 5).map(c =>
        `"${c.title}" by ${c.channelName} (${c.views} views)`
      ).join('\n');

      const task = await getMessagesTask({ userId: session.user.id, taskType: 'youtube.thumbnail-preview', language: lang === 'en' ? 'en' : 'es', instructionsVersion: 'thumbnail-preview-v1',
        outputSchema: { type: 'object', additionalProperties: false, required: ['score', 'breakdown', 'summary'], properties: {
          score: { type: 'number', minimum: 0, maximum: 100 }, summary: { type: 'string', minLength: 1 },
          breakdown: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['category', 'score', 'tip'], properties: {
            category: { type: 'string' }, score: { type: 'number', minimum: 0, maximum: 100 }, tip: { type: 'string' },
          } } },
        } },
      });
      const data = await task.create({ max_tokens: 600, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'url', url: thumbnailUrl } }, { type: 'text', text: `Analyze this YouTube thumbnail for CTR potential. The keyword is "${keyword}". Reply in ${lang === 'en' ? 'English' : 'Spanish'}.

Top competing videos for this keyword:
${competitorContext}

Output ONLY valid JSON:
{"score":0-100,"breakdown":[{"category":"Contrast & Colors","score":0-100,"tip":"..."},{"category":"Text Readability","score":0-100,"tip":"..."},{"category":"Faces & Emotion","score":0-100,"tip":"..."},{"category":"Curiosity Gap","score":0-100,"tip":"..."},{"category":"Brand Consistency","score":0-100,"tip":"..."}],"summary":"2 sentence overall assessment vs competitors"}` },
      ] }] });
      ctrAnalysis = JSON.parse(data.content[0].text);
    } catch { /* skip analysis */ }
  }

  return NextResponse.json({
    keyword,
    competitors,
    ctrAnalysis,
  });
}
