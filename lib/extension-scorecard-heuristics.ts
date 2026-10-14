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

export function checkVideo(snippet: { title: string; description: string; tags?: string[]; thumbnails?: Record<string, unknown> }, stats: { viewCount?: string; likeCount?: string; commentCount?: string }, contentDetails: { duration?: string; caption?: string }) {
  const title = snippet.title || '';
  const desc = snippet.description || '';
  const tags = snippet.tags || [];
  const views = parseInt(stats.viewCount || '0', 10);
  const likes = parseInt(stats.likeCount || '0', 10);
  const comments = parseInt(stats.commentCount || '0', 10);

  const durationMatch = (contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const durationSec = durationMatch
    ? (parseInt(durationMatch[1] || '0') * 3600) + (parseInt(durationMatch[2] || '0') * 60) + parseInt(durationMatch[3] || '0')
    : 0;

  const checks = [
    ...checkTitle(title),
    ...checkDesc(desc),
    ...checkTags(tags),
    { key: 'thumbnail', ok: snippet.thumbnails ? Object.keys(snippet.thumbnails).length >= 4 : false, w: 8 },
    { key: 'captions', ok: contentDetails.caption === 'true', w: 6 },
    { key: 'engagement', ok: views > 0 ? ((likes + comments) / views) > 0.03 : false, w: 7 },
    { key: 'duration', ok: durationSec >= 480 && durationSec <= 1200, w: 5 },
  ];

  const maxW = checks.reduce((s, c) => s + c.w, 0);
  const rawW = checks.filter(c => c.ok).reduce((s, c) => s + c.w, 0);
  return { score: Math.round((rawW / maxW) * 100), checks };
}

