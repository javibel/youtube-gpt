import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface CheckItem {
  key: string;
  label: { es: string; en: string };
  passed: boolean;
  detail: { es: string; en: string };
  weight: number;
}

// ── Engagement benchmarks by YouTube category ─────────────────────────────
// Source: industry averages. Higher-engagement niches have higher thresholds.
const ENGAGEMENT_BY_CATEGORY: Record<string, number> = {
  '1':  0.04,  // Film & Animation
  '2':  0.04,  // Autos & Vehicles
  '10': 0.05,  // Music
  '15': 0.03,  // Pets & Animals
  '17': 0.04,  // Sports
  '19': 0.03,  // Travel & Events
  '20': 0.05,  // Gaming
  '22': 0.03,  // People & Blogs
  '23': 0.04,  // Comedy
  '24': 0.04,  // Entertainment
  '25': 0.03,  // News & Politics
  '26': 0.04,  // Howto & Style
  '27': 0.04,  // Education
  '28': 0.04,  // Science & Technology
  '29': 0.03,  // Nonprofits & Activism
};
const DEFAULT_ENGAGEMENT_THRESHOLD = 0.03;

// ── SEO analysis helpers ────────────────────────────────────────────────────

function checkTitle(title: string, desc: string): CheckItem[] {
  const len = title.length;

  // Extract likely keyword (longest meaningful phrase from title, first ~40 chars)
  const titleWords = title.toLowerCase().replace(/[^\w\sáéíóúñü]/g, '').split(/\s+/).filter(w => w.length > 2);
  const descLower = desc.toLowerCase();
  // Check if main title words appear in description (keyword consistency)
  const keywordsInDesc = titleWords.filter(w => descLower.includes(w)).length;
  const keywordRatio = titleWords.length > 0 ? keywordsInDesc / titleWords.length : 0;

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
    {
      key: 'title_keyword_consistency',
      label: { es: 'Coherencia keyword título-descripción', en: 'Title-description keyword consistency' },
      passed: keywordRatio >= 0.5,
      detail: {
        es: keywordRatio >= 0.5
          ? `Bien: ${Math.round(keywordRatio * 100)}% de las palabras del título aparecen en la descripción`
          : `Solo ${Math.round(keywordRatio * 100)}% de las palabras del título aparecen en la descripción. Repite las keywords principales en las primeras líneas`,
        en: keywordRatio >= 0.5
          ? `Good: ${Math.round(keywordRatio * 100)}% of title words appear in description`
          : `Only ${Math.round(keywordRatio * 100)}% of title words appear in description. Repeat main keywords in the first lines`,
      },
      weight: 6,
    },
  ];
}

function checkDescription(desc: string): CheckItem[] {
  const wordCount = desc.split(/\s+/).filter(Boolean).length;
  const hasLinks = /https?:\/\//.test(desc);
  const hasTimestamps = /\d{1,2}:\d{2}/.test(desc);
  const hasHashtags = /#\w+/.test(desc);

  // Check if description front-loads keywords (first 200 chars are most important)
  const first200 = desc.slice(0, 200);
  const first200Words = first200.split(/\s+/).filter(Boolean).length;
  const frontLoaded = first200Words >= 20 && !/^(http|www|\n|\s*$)/.test(first200.trim());

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
      key: 'desc_frontload',
      label: { es: 'Primeras líneas optimizadas', en: 'Front-loaded description' },
      passed: frontLoaded,
      detail: {
        es: frontLoaded
          ? 'Las primeras líneas tienen contenido relevante (visible antes del "ver más")'
          : 'Las primeras 2-3 líneas deben tener keywords y enganchar. Es lo que aparece antes de "ver más"',
        en: frontLoaded
          ? 'First lines have relevant content (visible before "show more")'
          : 'First 2-3 lines should have keywords and hook. This shows before "show more"',
      },
      weight: 5,
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

function checkTags(tags: string[], title: string): CheckItem[] {
  const count = tags.length;

  // Check if title keyword appears in tags
  const titleLower = title.toLowerCase();
  const tagsLower = tags.map(t => t.toLowerCase());
  const titleInTags = tagsLower.some(t => titleLower.includes(t) || t.includes(titleLower.slice(0, 20)));

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
    {
      key: 'tags_keyword_match',
      label: { es: 'Keyword del título en tags', en: 'Title keyword in tags' },
      passed: count > 0 && titleInTags,
      detail: {
        es: count === 0
          ? 'Sin tags. Añade tu keyword principal como primer tag'
          : titleInTags ? 'Tu keyword principal aparece en los tags' : 'Tu keyword del título no está en los tags. Añádela como primer tag',
        en: count === 0
          ? 'No tags. Add your main keyword as first tag'
          : titleInTags ? 'Your main keyword appears in tags' : 'Your title keyword is not in tags. Add it as first tag',
      },
      weight: 5,
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
  const categoryId = snippet.categoryId || '';

  const views = parseInt(stats.viewCount || '0', 10);
  const likes = parseInt(stats.likeCount || '0', 10);
  const comments = parseInt(stats.commentCount || '0', 10);

  // Parse duration (PT1H2M3S format)
  const durationMatch = (contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const durationSec = durationMatch
    ? (parseInt(durationMatch[1] || '0') * 3600) + (parseInt(durationMatch[2] || '0') * 60) + parseInt(durationMatch[3] || '0')
    : 0;

  // Engagement threshold adjusted by category
  const engagementThreshold = ENGAGEMENT_BY_CATEGORY[categoryId] || DEFAULT_ENGAGEMENT_THRESHOLD;
  const engagementRatio = views > 0 ? (likes + comments) / views : 0;
  const engagementPct = (engagementRatio * 100).toFixed(1);
  const thresholdPct = (engagementThreshold * 100).toFixed(1);

  const checklist: CheckItem[] = [
    ...checkTitle(title, desc),
    ...checkDescription(desc),
    ...checkTags(tags, title),
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
      passed: views > 0 ? engagementRatio > engagementThreshold : false,
      detail: {
        es: views > 0
          ? `${engagementPct}% engagement (objetivo: >${thresholdPct}% para esta categoría)`
          : 'Sin datos suficientes',
        en: views > 0
          ? `${engagementPct}% engagement (target: >${thresholdPct}% for this category)`
          : 'Not enough data',
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
  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
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

      // AI analysis — enhanced with full video context + thumbnail Vision analysis
      let aiTip: { es: string; en: string } | null = null;
      let thumbnailAnalysis: { passed: boolean; detail: { es: string; en: string } } | null = null;
      const thumbUrl = video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.medium?.url || '';

      // Run AI tip + thumbnail analysis in parallel
      const [aiTipResult, thumbResult] = await Promise.allSettled([
        // 1. Enhanced AI tip with full context
        (async () => {
          const viewCount = parseInt(video.statistics?.viewCount || '0', 10);
          const likeCount = parseInt(video.statistics?.likeCount || '0', 10);
          const commentCount = parseInt(video.statistics?.commentCount || '0', 10);
          const engRate = viewCount > 0 ? (((likeCount + commentCount) / viewCount) * 100).toFixed(1) : '0';
          const failedChecks = checklist.filter(c => !c.passed && c.weight > 0).map(c => c.key).join(', ');

          const msg = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: `Analyze this YouTube video and give ONE specific, actionable tip to improve its SEO or CTR. Focus on the weakest area. Be concise (1-2 sentences).

Title: "${video.snippet.title}"
Description (first 300 chars): "${(video.snippet.description || '').slice(0, 300)}"
Tags: ${(video.snippet.tags || []).slice(0, 10).join(', ') || 'none'}
Category: ${video.snippet.categoryId || 'unknown'}
Views: ${viewCount} | Likes: ${likeCount} | Comments: ${commentCount} | Engagement: ${engRate}%
Duration: ${video.contentDetails?.duration || 'unknown'}
Failed checks: ${failedChecks || 'none'}

Reply in this exact JSON format: {"es":"tip en español","en":"tip in english"}`,
            }],
          });
          const text = (msg.content[0] as { type: string; text: string }).text;
          const parsed = JSON.parse(text);
          if (parsed.es && parsed.en) return parsed;
          return null;
        })(),

        // 2. Thumbnail analysis with Claude Vision
        thumbUrl ? (async () => {
          const msg = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 250,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image' as const,
                  source: { type: 'url' as const, url: thumbUrl },
                },
                {
                  type: 'text' as const,
                  text: `Analyze this YouTube thumbnail for CTR optimization. Evaluate:
1. Text readability (can you read text on mobile?)
2. Visual contrast and color impact
3. Human face/emotion presence
4. Overall clickability

Rate it as "good" or "needs_improvement" and give ONE specific actionable tip.

Reply in this exact JSON: {"rating":"good"|"needs_improvement","es":"evaluación + tip en español","en":"evaluation + tip in english"}`,
                },
              ],
            }],
          });
          const text = (msg.content[0] as { type: string; text: string }).text;
          return JSON.parse(text);
        })() : Promise.resolve(null),
      ]);

      if (aiTipResult.status === 'fulfilled' && aiTipResult.value) {
        aiTip = aiTipResult.value;
      }

      if (thumbResult.status === 'fulfilled' && thumbResult.value) {
        const tr = thumbResult.value;
        thumbnailAnalysis = {
          passed: tr.rating === 'good',
          detail: { es: tr.es, en: tr.en },
        };
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

      // Replace basic thumbnail check with Vision analysis if available
      if (thumbnailAnalysis) {
        checklist.push({
          key: 'thumbnail_quality',
          label: { es: 'Calidad del thumbnail (IA)', en: 'Thumbnail quality (AI)' },
          passed: thumbnailAnalysis.passed,
          detail: thumbnailAnalysis.detail,
          weight: 7,
        });
      }

      // Recalculate score after AI checks (thumbnail_quality has weight)
      const scoredChecks = checklist.filter(c => c.weight > 0);
      const finalMaxScore = scoredChecks.reduce((s, c) => s + c.weight, 0);
      const finalRawScore = scoredChecks.filter(c => c.passed).reduce((s, c) => s + c.weight, 0);
      const finalScore = finalMaxScore > 0 ? Math.round((finalRawScore / finalMaxScore) * 100) : score;

      // Upsert score in DB
      const videoTitle = video.snippet?.title || '';
      const videoThumb = video.snippet?.thumbnails?.medium?.url || '';
      const videoPubAt = video.snippet?.publishedAt || '';
      const videoViews = parseInt(video.statistics?.viewCount || '0', 10);

      await prisma.videoSeoScore.upsert({
        where: { userId_videoId: { userId: session.user.id, videoId: video.id } },
        create: {
          userId: session.user.id,
          videoId: video.id,
          title: videoTitle,
          thumbnail: videoThumb,
          publishedAt: videoPubAt,
          views: videoViews,
          score: finalScore,
          checklist: JSON.parse(JSON.stringify(checklist)),
        },
        update: {
          title: videoTitle,
          thumbnail: videoThumb,
          publishedAt: videoPubAt,
          views: videoViews,
          score: finalScore,
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
        score: finalScore,
        checklist,
      });
    }

    return NextResponse.json({ scores: results });
  } catch (err) {
    console.error('[youtube/seo-score]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
