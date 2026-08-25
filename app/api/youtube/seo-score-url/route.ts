import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { parseClaudeJson } from '@/lib/parse-claude-json';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface CheckItem {
  key: string;
  label: { es: string; en: string };
  passed: boolean;
  detail: { es: string; en: string };
  weight: number;
}

// ── Engagement benchmarks by YouTube category ──────────────────────────────
const ENGAGEMENT_BY_CATEGORY: Record<string, number> = {
  '1':  0.04, '2':  0.04, '10': 0.05, '15': 0.03, '17': 0.04,
  '19': 0.03, '20': 0.05, '22': 0.03, '23': 0.04, '24': 0.04,
  '25': 0.03, '26': 0.04, '27': 0.04, '28': 0.04, '29': 0.03,
};
const DEFAULT_ENGAGEMENT_THRESHOLD = 0.03;

// ── Extract videoId from URL or raw ID ─────────────────────────────────────
function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  // Already a plain videoId (11 chars, no slashes)
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  // Standard URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  return null;
}

// ── SEO analysis helpers (same logic as main endpoint) ─────────────────────

function checkTitle(title: string, desc: string): CheckItem[] {
  const len = title.length;
  const titleWords = title.toLowerCase().replace(/[^\w\sáéíóúñü]/g, '').split(/\s+/).filter(w => w.length > 2);
  const descLower = desc.toLowerCase();
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
        es: frontLoaded ? 'Las primeras líneas tienen contenido relevante' : 'Las primeras 2-3 líneas deben tener keywords y enganchar',
        en: frontLoaded ? 'First lines have relevant content' : 'First 2-3 lines should have keywords and hook',
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
        es: count === 0 ? 'Sin tags. Añade tu keyword principal como primer tag' : titleInTags ? 'Tu keyword principal aparece en los tags' : 'Tu keyword del título no está en los tags. Añádela como primer tag',
        en: count === 0 ? 'No tags. Add your main keyword as first tag' : titleInTags ? 'Your main keyword appears in tags' : 'Your title keyword is not in tags. Add it as first tag',
      },
      weight: 5,
    },
  ];
}

// ── POST: analyze any public video by URL ──────────────────────────────────

export async function POST(request: Request) {
  // F1 security: this endpoint is PUBLIC (no auth) and hits the YouTube API + Anthropic (costs
  // money per call). Rate-limit by IP — atomic in DB so it holds across serverless instances.
  // 20 analyses / 10 min is generous for a real lead-magnet user, blocks scripted abuse.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  try {
    const rl = await prisma.$queryRaw<{ hits: number }[]>`
      INSERT INTO rate_limits (key, hits, window_start)
      VALUES (${`seo-url:${ip}`}, 1, NOW())
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN rate_limits.window_start < NOW() - INTERVAL '10 minutes' THEN 1 ELSE rate_limits.hits + 1 END,
        window_start = CASE WHEN rate_limits.window_start < NOW() - INTERVAL '10 minutes' THEN NOW() ELSE rate_limits.window_start END
      RETURNING hits`;
    if (Number(rl[0]?.hits ?? 0) > 20) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  } catch {
    // If the rate-limit store is unavailable, fail open (don't block legit users on infra hiccup)
  }

  const body = await request.json().catch(() => ({}));
  const url = (body.url as string) || (body.videoId as string) || '';

  if (!url) {
    return NextResponse.json({ error: 'url_required' }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }

  try {
    // Fetch video data with public API key
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(videoId)}&key=${apiKey}`,
    );
    if (!res.ok) {
      return NextResponse.json({ error: 'youtube_api_error' }, { status: 500 });
    }

    const data = await res.json();
    const video = data.items?.[0];
    if (!video) {
      return NextResponse.json({ error: 'video_not_found' }, { status: 404 });
    }

    const snippet = video.snippet;
    const stats = video.statistics || {};
    const contentDetails = video.contentDetails || {};
    const title = snippet.title || '';
    const desc = snippet.description || '';
    const tags = snippet.tags || [];
    const categoryId = snippet.categoryId || '';

    const views = parseInt(stats.viewCount || '0', 10);
    const likes = parseInt(stats.likeCount || '0', 10);
    const comments = parseInt(stats.commentCount || '0', 10);

    const durationMatch = (contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const durationSec = durationMatch
      ? (parseInt(durationMatch[1] || '0') * 3600) + (parseInt(durationMatch[2] || '0') * 60) + parseInt(durationMatch[3] || '0')
      : 0;

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
        passed: contentDetails.caption === 'true',
        detail: {
          es: contentDetails.caption === 'true' ? 'Tiene subtítulos (mejora accesibilidad y SEO)' : 'Sin subtítulos. Añade CC para alcanzar más audiencia',
          en: contentDetails.caption === 'true' ? 'Has captions (improves accessibility and SEO)' : 'No captions. Add CC to reach more audience',
        },
        weight: 6,
      },
      {
        key: 'engagement',
        label: { es: 'Ratio de engagement', en: 'Engagement ratio' },
        passed: views > 0 ? engagementRatio > engagementThreshold : false,
        detail: {
          es: views > 0 ? `${engagementPct}% engagement (objetivo: >${thresholdPct}% para esta categoría)` : 'Sin datos suficientes',
          en: views > 0 ? `${engagementPct}% engagement (target: >${thresholdPct}% for this category)` : 'Not enough data',
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

    // AI tip + thumbnail Vision analysis (in parallel)
    const thumbUrl = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || '';
    const failedChecks = checklist.filter(c => !c.passed && c.weight > 0).map(c => c.key).join(', ');
    const engRate = views > 0 ? (((likes + comments) / views) * 100).toFixed(1) : '0';

    const [aiTipResult, thumbResult] = await Promise.allSettled([
      (async () => {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Analyze this YouTube video and give ONE specific, actionable tip to improve its SEO or CTR. Focus on the weakest area. Be concise (1-2 sentences).

Title: "${title}"
Description (first 300 chars): "${desc.slice(0, 300)}"
Tags: ${tags.slice(0, 10).join(', ') || 'none'}
Category: ${categoryId || 'unknown'}
Views: ${views} | Likes: ${likes} | Comments: ${comments} | Engagement: ${engRate}%
Duration: ${contentDetails.duration || 'unknown'}
Failed checks: ${failedChecks || 'none'}

Reply in this exact JSON format: {"es":"tip en español","en":"tip in english"}`,
          }],
        });
        const text = (msg.content[0] as { type: string; text: string }).text;
        return parseClaudeJson<{ es?: string; en?: string }>(text);
      })(),
      thumbUrl ? (async () => {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 250,
          messages: [{
            role: 'user',
            content: [
              { type: 'image' as const, source: { type: 'url' as const, url: thumbUrl } },
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
        return parseClaudeJson<{ rating?: string; es?: string; en?: string }>(text);
      })() : Promise.resolve(null),
    ]);

    const aiTipEs = aiTipResult.status === 'fulfilled' ? aiTipResult.value?.es : undefined;
    const aiTipEn = aiTipResult.status === 'fulfilled' ? aiTipResult.value?.en : undefined;
    if (aiTipEs && aiTipEn) {
      checklist.push({
        key: 'ai_tip',
        label: { es: 'Consejo IA', en: 'AI Tip' },
        passed: true,
        detail: { es: aiTipEs, en: aiTipEn },
        weight: 0,
      });
    }

    const thumbEs = thumbResult.status === 'fulfilled' ? thumbResult.value?.es : undefined;
    const thumbEn = thumbResult.status === 'fulfilled' ? thumbResult.value?.en : undefined;
    if (thumbResult.status === 'fulfilled' && thumbResult.value && thumbEs && thumbEn) {
      checklist.push({
        key: 'thumbnail_quality',
        label: { es: 'Calidad del thumbnail (IA)', en: 'Thumbnail quality (AI)' },
        passed: thumbResult.value.rating === 'good',
        detail: { es: thumbEs, en: thumbEn },
        weight: 7,
      });
    }

    // Recalculate score after AI checks
    const scoredChecks = checklist.filter(c => c.weight > 0);
    const maxScore = scoredChecks.reduce((s, c) => s + c.weight, 0);
    const rawScore = scoredChecks.filter(c => c.passed).reduce((s, c) => s + c.weight, 0);
    const score = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;

    return NextResponse.json({
      videoId,
      title,
      thumbnail: snippet.thumbnails?.medium?.url || '',
      publishedAt: snippet.publishedAt || '',
      views,
      score,
      checklist,
    });
  } catch (err) {
    console.error('[seo-score-url]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
