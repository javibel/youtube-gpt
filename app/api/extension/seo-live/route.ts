import { NextResponse } from 'next/server';
import { getExtensionUser } from '@/lib/extension-auth';

function checkTitle(title: string) {
  const len = title.length;
  return [
    { key: 'title_length', ok: len >= 30 && len <= 70, w: 8 },
    { key: 'title_number', ok: /\d/.test(title), w: 5 },
    { key: 'title_caps', ok: title !== title.toUpperCase(), w: 4 },
    { key: 'title_emoji', ok: /[\p{Emoji_Presentation}]/u.test(title), w: 3 },
    { key: 'title_power', ok: /\b(cómo|how|best|mejor|secret|secreto|ultimate|top|hack|error|mistake)\b/i.test(title), w: 4 },
  ];
}

function checkDesc(desc: string) {
  const wc = desc.split(/\s+/).filter(Boolean).length;
  return [
    { key: 'desc_length', ok: wc >= 100, w: 10 },
    { key: 'desc_links', ok: /https?:\/\//.test(desc), w: 5 },
    { key: 'desc_timestamps', ok: /\d{1,2}:\d{2}/.test(desc), w: 7 },
    { key: 'desc_hashtags', ok: /#\w+/.test(desc), w: 4 },
    { key: 'desc_cta', ok: /suscri|subscribe|like|comenta|comment/i.test(desc), w: 3 },
  ];
}

function checkTags(tags: string[]) {
  return [
    { key: 'tags_count', ok: tags.length >= 5 && tags.length <= 20, w: 8 },
    { key: 'tags_long', ok: tags.some(t => t.split(/\s+/).length >= 3), w: 4 },
  ];
}

export async function POST(request: Request) {
  const extUser = await getExtensionUser(request);
  if (!extUser) {
    return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title = (body.title as string) || '';
  const description = (body.description as string) || '';
  const tags = Array.isArray(body.tags) ? body.tags : [];

  const checks = [
    ...checkTitle(title),
    ...checkDesc(description),
    ...checkTags(tags),
  ];

  const maxW = checks.reduce((s, c) => s + c.w, 0);
  const rawW = checks.filter(c => c.ok).reduce((s, c) => s + c.w, 0);
  const score = maxW > 0 ? Math.round((rawW / maxW) * 100) : 0;

  return NextResponse.json({ score, checks, titleLength: title.length });
}
