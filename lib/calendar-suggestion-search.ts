// Selected public search fields only. These copies describe this HTTP input;
// they do not establish operational provenance, consent, freshness or recovery authority.
export type SearchSelection = Readonly<{
  channelId: string | null; limit: 5 | 10; publishedAfter: string | null;
  publishedThrough: string; status: 'not_requested' | 'unconfirmed' | 'selected';
  videos: readonly Readonly<{ videoId: string; title: string; channelTitle: string; publishedAt: string }>[];
}>;
type Check = () => void;
function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))
    throw Error('Invalid declared publication time');
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !==
    (value.includes('.') ? value : value.replace('Z', '.000Z')))
    throw Error('Invalid declared publication time');
  return instant;
}
function label(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 500)
    throw Error('Invalid selected search text');
  return value;
}
export function captureSuggestionSearch(data: unknown, selection: SearchSelection, check: Check): SearchSelection {
  check();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid search response');
  const items = (data as { items?: unknown; error?: unknown }).items;
  const error = (data as { error?: unknown }).error;
  check();
  if (error !== undefined || !Array.isArray(items) || items.length > selection.limit || selection.channelId === null)
    throw Error('Unconfirmed selected search response');
  const lower = selection.publishedAfter === null ? -Infinity : timestamp(selection.publishedAfter);
  const upper = timestamp(selection.publishedThrough), ids = new Set<string>();
  let previous = Infinity;
  const videos = items.map(item => {
    check();
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Invalid selected search item');
    const { id, snippet } = item;
    check();
    const videoId = id?.videoId, title = snippet?.title, channelTitle = snippet?.channelTitle;
    const channelId = snippet?.channelId, publishedAt = snippet?.publishedAt;
    check();
    if (id?.kind !== 'youtube#video' || typeof videoId !== 'string' || !/^[-A-Za-z0-9_]{11}$/.test(videoId)
      || ids.has(videoId) || channelId !== selection.channelId) throw Error('Foreign or duplicate selected upload');
    const published = timestamp(publishedAt);
    if (published <= lower || published >= upper || published > previous) throw Error('Upload outside original selection');
    ids.add(videoId); previous = published;
    const captured = Object.freeze({ videoId, title: label(title), channelTitle: label(channelTitle), publishedAt: publishedAt as string });
    check();
    return captured;
  });
  check();
  return Object.freeze({ ...selection, status: 'selected' as const, videos: Object.freeze(videos) });
}
