export interface OptimizeDraft { videoId: string; title: string; description: string; tags: string[] }
export interface OptimizeCheck { key: string; ok: boolean; w: number }
export interface OptimizeScore { score: number; checks: OptimizeCheck[] }

export function validOptimizeDraft(value: unknown): value is OptimizeDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.videoId === 'string' && /^[\w-]{1,128}$/.test(v.videoId)
    && typeof v.title === 'string' && v.title.length <= 100
    && typeof v.description === 'string' && v.description.length <= 5000
    && Array.isArray(v.tags) && v.tags.length <= 100
    && v.tags.every(t => typeof t === 'string' && t.length <= 500);
}

// Preserve the existing Optimize criteria and weights for preview, GET and PUT.
export function computeScore(title: string, description: string, tags: string[]): OptimizeScore {
  const checks = [
    { key: 'title_length', ok: title.length >= 30 && title.length <= 70, w: 8 },
    { key: 'title_number', ok: /\d/.test(title), w: 5 },
    { key: 'title_caps', ok: title !== title.toUpperCase(), w: 4 },
    { key: 'title_emoji', ok: /[\p{Emoji_Presentation}]/u.test(title), w: 3 },
    { key: 'title_power', ok: /\b(cómo|how|best|mejor|secret|secreto|ultimate|top|hack|error|mistake)\b/i.test(title), w: 4 },
    { key: 'desc_length', ok: description.split(/\s+/).filter(Boolean).length >= 100, w: 10 },
    { key: 'desc_links', ok: /https?:\/\//.test(description), w: 5 },
    { key: 'desc_timestamps', ok: /\d{1,2}:\d{2}/.test(description), w: 7 },
    { key: 'desc_hashtags', ok: /#\w+/.test(description), w: 4 },
    { key: 'desc_cta', ok: /suscri|subscribe|like|comenta|comment/i.test(description), w: 3 },
    { key: 'tags_count', ok: tags.length >= 5 && tags.length <= 20, w: 8 },
    { key: 'tags_long', ok: tags.some(t => t.split(/\s+/).length >= 3), w: 4 },
    { key: 'tags_short', ok: tags.some(t => t.split(/\s+/).length === 1), w: 3 },
  ];
  return { score: Math.round(checks.filter(c => c.ok).reduce((s, c) => s + c.w, 0) / checks.reduce((s, c) => s + c.w, 0) * 100), checks };
}
