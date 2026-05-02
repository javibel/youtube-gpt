import { NextResponse } from 'next/server';
import { getExtensionUser } from '@/lib/extension-auth';

interface CheckResult {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
  weight: number;
}

function checkTitle(title: string, lang: string): CheckResult[] {
  const len = title.length;
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  return [
    {
      key: 'title_length',
      label: t('Longitud del título', 'Title length'),
      passed: len >= 30 && len <= 70,
      detail: len < 30 ? t(`Corto (${len}). Apunta a 40-60`, `Short (${len}). Aim for 40-60`) : len > 70 ? t(`Largo (${len}). Máximo 60-70`, `Long (${len}). Max 60-70`) : t(`Bien (${len})`, `Good (${len})`),
      weight: 8,
    },
    {
      key: 'title_number',
      label: t('Número en título', 'Number in title'),
      passed: /\d/.test(title),
      detail: /\d/.test(title) ? t('Tiene números (+36% CTR)', 'Has numbers (+36% CTR)') : t('Sin números', 'No numbers'),
      weight: 5,
    },
    {
      key: 'title_caps',
      label: t('Capitalización', 'Capitalization'),
      passed: title !== title.toUpperCase(),
      detail: title === title.toUpperCase() ? t('TODO MAYÚSCULAS penaliza', 'ALL CAPS penalized') : 'OK',
      weight: 4,
    },
  ];
}

function checkDescription(desc: string, lang: string): CheckResult[] {
  const wordCount = desc.split(/\s+/).filter(Boolean).length;
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  return [
    {
      key: 'desc_length',
      label: t('Descripción', 'Description'),
      passed: wordCount >= 100,
      detail: wordCount < 50 ? t(`Muy corta (${wordCount} palabras)`, `Very short (${wordCount} words)`) : wordCount < 100 ? t(`Algo corta (${wordCount})`, `Short (${wordCount})`) : t(`Bien (${wordCount})`, `Good (${wordCount})`),
      weight: 10,
    },
    {
      key: 'desc_links',
      label: t('Enlaces', 'Links'),
      passed: /https?:\/\//.test(desc),
      detail: /https?:\/\//.test(desc) ? t('Tiene enlaces', 'Has links') : t('Sin enlaces', 'No links'),
      weight: 5,
    },
    {
      key: 'desc_timestamps',
      label: 'Timestamps',
      passed: /\d{1,2}:\d{2}/.test(desc),
      detail: /\d{1,2}:\d{2}/.test(desc) ? t('Tiene timestamps', 'Has timestamps') : t('Sin timestamps', 'No timestamps'),
      weight: 7,
    },
    {
      key: 'desc_hashtags',
      label: 'Hashtags',
      passed: /#\w+/.test(desc),
      detail: /#\w+/.test(desc) ? t('Tiene hashtags', 'Has hashtags') : t('Sin hashtags', 'No hashtags'),
      weight: 4,
    },
  ];
}

function checkTags(tags: string[], lang: string): CheckResult[] {
  const count = tags.length;
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  return [
    {
      key: 'tags_count',
      label: 'Tags',
      passed: count >= 5 && count <= 20,
      detail: count === 0 ? t('Sin tags', 'No tags') : count < 5 ? t(`Pocos (${count})`, `Few (${count})`) : count > 20 ? t(`Demasiados (${count})`, `Too many (${count})`) : t(`Bien (${count})`, `Good (${count})`),
      weight: 8,
    },
  ];
}

export async function POST(request: Request) {
  const extUser = await getExtensionUser(request);
  if (!extUser) {
    return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const videoId = body.videoId as string | undefined;
  const lang = (body.lang as string) || 'es';
  if (!videoId) {
    return NextResponse.json({ error: 'videoId required' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
  }

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(videoId)}&key=${apiKey}`,
  );
  if (!res.ok) {
    return NextResponse.json({ error: 'YouTube API error' }, { status: 500 });
  }

  const data = await res.json();
  const video = data.items?.[0];
  if (!video) {
    return NextResponse.json({ error: 'video not found' }, { status: 404 });
  }

  const snippet = video.snippet;
  const stats = video.statistics || {};
  const contentDetails = video.contentDetails || {};
  const tags = snippet.tags || [];

  const views = parseInt(stats.viewCount || '0', 10);
  const likes = parseInt(stats.likeCount || '0', 10);
  const comments = parseInt(stats.commentCount || '0', 10);

  const durationMatch = (contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const durationSec = durationMatch
    ? (parseInt(durationMatch[1] || '0') * 3600) + (parseInt(durationMatch[2] || '0') * 60) + parseInt(durationMatch[3] || '0')
    : 0;

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const checklist: CheckResult[] = [
    ...checkTitle(snippet.title || '', lang),
    ...checkDescription(snippet.description || '', lang),
    ...checkTags(tags, lang),
    {
      key: 'thumbnail',
      label: t('Thumbnail', 'Thumbnail'),
      passed: snippet.thumbnails ? Object.keys(snippet.thumbnails).length >= 4 : false,
      detail: t('Thumbnail personalizado +30% CTR', 'Custom thumbnail +30% CTR'),
      weight: 8,
    },
    {
      key: 'captions',
      label: t('Subtítulos', 'Captions'),
      passed: contentDetails.caption === 'true',
      detail: contentDetails.caption === 'true' ? t('Tiene subtítulos', 'Has captions') : t('Sin subtítulos', 'No captions'),
      weight: 6,
    },
    {
      key: 'engagement',
      label: 'Engagement',
      passed: views > 0 ? ((likes + comments) / views) > 0.03 : false,
      detail: views > 0 ? `${(((likes + comments) / views) * 100).toFixed(1)}%` : t('Sin datos', 'No data'),
      weight: 7,
    },
    {
      key: 'duration',
      label: t('Duración', 'Duration'),
      passed: durationSec >= 480 && durationSec <= 1200,
      detail: durationSec < 480 ? t(`Corto (${Math.floor(durationSec / 60)} min)`, `Short (${Math.floor(durationSec / 60)} min)`) : durationSec > 1200 ? t(`Largo (${Math.floor(durationSec / 60)} min)`, `Long (${Math.floor(durationSec / 60)} min)`) : t(`Bien (${Math.floor(durationSec / 60)} min)`, `Good (${Math.floor(durationSec / 60)} min)`),
      weight: 5,
    },
  ];

  const maxScore = checklist.reduce((s, c) => s + c.weight, 0);
  const rawScore = checklist.filter(c => c.passed).reduce((s, c) => s + c.weight, 0);
  const score = Math.round((rawScore / maxScore) * 100);

  return NextResponse.json({
    videoId,
    title: snippet.title,
    score,
    checklist,
  });
}
