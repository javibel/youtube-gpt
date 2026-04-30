import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface CheckItem {
  key: string;
  label: { es: string; en: string };
  passed: boolean;
  detail: { es: string; en: string };
  weight: number;
}

// ── Token refresh (shared pattern from channel/route.ts) ────────────────────

async function getAccessToken(userId: string): Promise<string | null> {
  const yt = await prisma.youtubeToken.findUnique({ where: { userId } });
  if (!yt?.accessToken) return null;

  if (yt.expiresAt > new Date(Date.now() + 60_000)) return yt.accessToken;

  if (!yt.refreshToken) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: yt.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) return null;

  const expiresAt = new Date(Date.now() + ((data.expires_in as number) || 3600) * 1000);
  await prisma.youtubeToken.update({
    where: { userId },
    data: { accessToken: data.access_token as string, expiresAt },
  });
  return data.access_token as string;
}

// ── SEO analysis helpers ────────────────────────────────────────────────────

function checkTitle(title: string): CheckItem[] {
  const len = title.length;
  return [
    {
      key: 'title_length',
      label: { es: 'Longitud del título', en: 'Title length' },
      passed: len >= 30 && len <= 70,
      detail: {
        es: len < 30 ? `Demasiado corto (${len} chars). Apunta a 40-60.` : len > 70 ? `Demasiado largo (${len} chars). Máximo 60-70.` : `Bien (${len} chars)`,
        en: len < 30 ? `Too short (${len} chars). Aim for 40-60.` : len > 70 ? `Too long (${len} chars). Max 60-70.` : `Good (${len} chars)`,
      },
      weight: 8,
    },
    {
      key: 'title_number',
      label: { es: 'Número en el título', en: 'Number in title' },
      passed: /\d/.test(title),
      detail: {
        es: /\d/.test(title) ? 'Tiene números (mejora CTR)' : 'Sin números. Los títulos con números tienen +36% CTR',
        en: /\d/.test(title) ? 'Has numbers (improves CTR)' : 'No numbers. Titles with numbers get +36% CTR',
      },
      weight: 5,
    },
    {
      key: 'title_caps',
      label: { es: 'Capitalización', en: 'Capitalization' },
      passed: title !== title.toUpperCase(),
      detail: {
        es: title === title.toUpperCase() ? 'TODO MAYÚSCULAS penaliza desde sept 2025' : 'Capitalización correcta',
        en: title === title.toUpperCase() ? 'ALL CAPS penalized since Sept 2025' : 'Capitalization OK',
      },
      weight: 4,
    },
  ];
}

function checkDescription(desc: string): CheckItem[] {
  const wordCount = desc.split(/\s+/).filter(Boolean).length;
  const hasLinks = /https?:\/\//.test(desc);
  const hasTimestamps = /\d{1,2}:\d{2}/.test(desc);
  const hasHashtags = /#\w+/.test(desc);

  return [
    {
      key: 'desc_length',
      label: { es: 'Longitud de descripción', en: 'Description length' },
      passed: wordCount >= 100,
      detail: {
        es: wordCount < 50 ? `Muy corta (${wordCount} palabras). Mínimo 100-200.` : wordCount < 100 ? `Algo corta (${wordCount}). Apunta a 150+.` : `Bien (${wordCount} palabras)`,
        en: wordCount < 50 ? `Very short (${wordCount} words). Minimum 100-200.` : wordCount < 100 ? `Somewhat short (${wordCount}). Aim for 150+.` : `Good (${wordCount} words)`,
      },
      weight: 10,
    },
    {
      key: 'desc_links',
      label: { es: 'Enlaces en descripción', en: 'Links in description' },
      passed: hasLinks,
      detail: {
        es: hasLinks ? 'Tiene enlaces' : 'Sin enlaces. Añade redes sociales y recursos',
        en: hasLinks ? 'Has links' : 'No links. Add social media and resources',
      },
      weight: 5,
    },
    {
      key: 'desc_timestamps',
      label: { es: 'Timestamps', en: 'Timestamps' },
      passed: hasTimestamps,
      detail: {
        es: hasTimestamps ? 'Tiene timestamps (mejora SEO y retención)' : 'Sin timestamps. Añádelos para mejorar navegación',
        en: hasTimestamps ? 'Has timestamps (improves SEO and retention)' : 'No timestamps. Add them for better navigation',
      },
      weight: 7,
    },
    {
      key: 'desc_hashtags',
      label: { es: 'Hashtags', en: 'Hashtags' },
      passed: hasHashtags,
      detail: {
        es: hasHashtags ? 'Tiene hashtags' : 'Sin hashtags. Añade 1-3 hashtags relevantes',
        en: hasHashtags ? 'Has hashtags' : 'No hashtags. Add 1-3 relevant hashtags',
      },
      weight: 4,
    },
  ];
}

function checkTags(tags: string[]): CheckItem[] {
  const count = tags.length;
  return [
    {
      key: 'tags_count',
      label: { es: 'Número de tags', en: 'Tag count' },
      passed: count >= 5 && count <= 20,
      detail: {
        es: count === 0 ? 'Sin tags. Añade 5-15 tags relevantes' : count < 5 ? `Pocos tags (${count}). Apunta a 5-15` : count > 20 ? `Demasiados tags (${count}). YouTube recomienda máx 15` : `Bien (${count} tags)`,
        en: count === 0 ? 'No tags. Add 5-15 relevant tags' : count < 5 ? `Few tags (${count}). Aim for 5-15` : count > 20 ? `Too many tags (${count}). YouTube recommends max 15` : `Good (${count} tags)`,
      },
      weight: 8,
    },
  ];
}

function checkVideo(
  snippet: { title: string; description: string; tags?: string[]; thumbnails?: Record<string, unknown>; categoryId?: string },
  stats: { viewCount?: string; likeCount?: string; commentCount?: string },
  contentDetails: { duration?: string; caption?: string },
  hasCaptions: boolean,
): { checklist: CheckItem[]; score: number } {
  const title = snippet.title || '';
  const desc = snippet.description || '';
  const tags = snippet.tags || [];

  const views = parseInt(stats.viewCount || '0', 10);
  const likes = parseInt(stats.likeCount || '0', 10);
  const comments = parseInt(stats.commentCount || '0', 10);

  // Parse duration (PT1H2M3S format)
  const durationMatch = (contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const durationSec = durationMatch
    ? (parseInt(durationMatch[1] || '0') * 3600) + (parseInt(durationMatch[2] || '0') * 60) + parseInt(durationMatch[3] || '0')
    : 0;

  const checklist: CheckItem[] = [
    ...checkTitle(title),
    ...checkDescription(desc),
    ...checkTags(tags),
    {
      key: 'thumbnail',
      label: { es: 'Thumbnail personalizado', en: 'Custom thumbnail' },
      passed: snippet.thumbnails ? Object.keys(snippet.thumbnails).length >= 4 : false,
      detail: {
        es: 'Los thumbnails personalizados obtienen hasta +30% CTR',
        en: 'Custom thumbnails get up to +30% CTR',
      },
      weight: 8,
    },
    {
      key: 'captions',
      label: { es: 'Subtítulos', en: 'Captions/Subtitles' },
      passed: hasCaptions || contentDetails.caption === 'true',
      detail: {
        es: hasCaptions ? 'Tiene subtítulos (mejora accesibilidad y SEO)' : 'Sin subtítulos. Añade CC para alcanzar más audiencia',
        en: hasCaptions ? 'Has captions (improves accessibility and SEO)' : 'No captions. Add CC to reach more audience',
      },
      weight: 6,
    },
    {
      key: 'engagement',
      label: { es: 'Ratio de engagement', en: 'Engagement ratio' },
      passed: views > 0 ? ((likes + comments) / views) > 0.03 : false,
      detail: {
        es: views > 0 ? `${(((likes + comments) / views) * 100).toFixed(1)}% engagement` : 'Sin datos suficientes',
        en: views > 0 ? `${(((likes + comments) / views) * 100).toFixed(1)}% engagement` : 'Not enough data',
      },
      weight: 7,
    },
    {
      key: 'duration',
      label: { es: 'Duración óptima', en: 'Optimal duration' },
      passed: durationSec >= 480 && durationSec <= 1200,
      detail: {
        es: durationSec < 480 ? `Corto (${Math.floor(durationSec / 60)} min). 8-20 min es ideal` : durationSec > 1200 ? `Largo (${Math.floor(durationSec / 60)} min). Puede afectar retención` : `Buena duración (${Math.floor(durationSec / 60)} min)`,
        en: durationSec < 480 ? `Short (${Math.floor(durationSec / 60)} min). 8-20 min is ideal` : durationSec > 1200 ? `Long (${Math.floor(durationSec / 60)} min). May affect retention` : `Good duration (${Math.floor(durationSec / 60)} min)`,
      },
      weight: 5,
    },
  ];

  const maxScore = checklist.reduce((s, c) => s + c.weight, 0);
  const rawScore = checklist.filter(c => c.passed).reduce((s, c) => s + c.weight, 0);
  const score = Math.round((rawScore / maxScore) * 100);

  return { checklist, score };
}

// ── GET: list all video scores for the user ─────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scores = await prisma.videoSeoScore.findMany({
    where: { userId: session.user.id },
    orderBy: { analyzedAt: 'desc' },
  });

  return NextResponse.json({ scores });
}

// ── POST: analyze a video or all user videos ────────────────────────────────

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pro check
  const sub = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { status: true },
  });
  if (sub?.status !== 'active') {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const accessToken = await getAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedVideoId = body.videoId as string | undefined;

  try {
    let videoIds: string[] = [];

    if (requestedVideoId) {
      videoIds = [requestedVideoId];
    } else {
      // Fetch user's last 10 videos
      const searchRes = await fetch(
        'https://www.googleapis.com/youtube/v3/search?part=id&forMine=true&type=video&order=date&maxResults=10',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const searchData = await searchRes.json();
      if (!searchRes.ok) {
        return NextResponse.json({ error: searchData.error?.message || 'YouTube API error' }, { status: 500 });
      }
      videoIds = (searchData.items || []).map((item: { id: { videoId: string } }) => item.id.videoId);
    }

    if (videoIds.length === 0) {
      return NextResponse.json({ scores: [] });
    }

    // Fetch full video details
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails,status&id=${videoIds.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const videosData = await videosRes.json();

    const results: {
      videoId: string;
      title: string;
      thumbnail: string;
      publishedAt: string;
      views: number;
      score: number;
      checklist: CheckItem[];
    }[] = [];

    for (const video of videosData.items || []) {
      // Check captions
      let hasCaptions = false;
      try {
        const captionsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${video.id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const captionsData = await captionsRes.json();
        hasCaptions = (captionsData.items || []).length > 0;
      } catch {
        // Captions API may fail for some videos
      }

      const { checklist, score } = checkVideo(
        video.snippet,
        video.statistics,
        video.contentDetails,
        hasCaptions,
      );

      // AI analysis of title quality
      let aiTip: { es: string; en: string } | null = null;
      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: `Analyze this YouTube video title for SEO and CTR optimization. Give ONE specific, actionable tip to improve it. Be concise (1 sentence).

Title: "${video.snippet.title}"
Tags: ${(video.snippet.tags || []).slice(0, 10).join(', ') || 'none'}

Reply in this exact JSON format: {"es":"tip en español","en":"tip in english"}`,
          }],
        });
        const text = (msg.content[0] as { type: string; text: string }).text;
        const parsed = JSON.parse(text);
        if (parsed.es && parsed.en) aiTip = parsed;
      } catch {
        // AI tip is optional
      }

      if (aiTip) {
        checklist.push({
          key: 'ai_tip',
          label: { es: 'Consejo IA', en: 'AI Tip' },
          passed: true,
          detail: aiTip,
          weight: 0,
        });
      }

      // Upsert score in DB
      await prisma.videoSeoScore.upsert({
        where: { userId_videoId: { userId: session.user.id, videoId: video.id } },
        create: {
          userId: session.user.id,
          videoId: video.id,
          score,
          checklist: JSON.parse(JSON.stringify(checklist)),
        },
        update: {
          score,
          checklist: JSON.parse(JSON.stringify(checklist)),
          analyzedAt: new Date(),
        },
      });

      results.push({
        videoId: video.id,
        title: video.snippet?.title || '',
        thumbnail: video.snippet?.thumbnails?.medium?.url || '',
        publishedAt: video.snippet?.publishedAt || '',
        views: parseInt(video.statistics?.viewCount || '0', 10),
        score,
        checklist,
      });
    }

    return NextResponse.json({ scores: results });
  } catch (err) {
    console.error('[youtube/seo-score]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
