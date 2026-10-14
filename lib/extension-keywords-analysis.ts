import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { consumeExtensionKeywordContext, type ExtensionKeywordContext } from '@/lib/extension-keywords-native-authorization';
import { boundedKeywordJSON, deriveKeywordPayload, projectKeywordPayload, keywordSearch, keywordStats, keywordSuggestions,
  keywordTrendPoints, keywordCacheDate, keywordVolumeCache, nativeKeywordCacheKey, nativeKeywordVolumeKey } from '@/lib/extension-keywords-payload';

export async function analyzeExtensionKeywords(context: ExtensionKeywordContext): Promise<Response> {
  const { keyword, language, step, reply } = consumeExtensionKeywordContext(context), key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw Error('Keyword source unavailable');
  const cacheKey = nativeKeywordCacheKey(keyword, language), cached = await step(() => prisma.youtubeCache.findUnique({ where: { key: cacheKey } }));
  if (cached && keywordCacheDate(cached, cacheKey).getTime() > Date.now()) {
    const data = projectKeywordPayload(cached.data, keyword, language);
    if (cached.expiresAt.getTime() > Date.parse(data.collectedAt) + 86400000) throw Error('Keyword cache horizon unavailable');
    return reply(data, cached.expiresAt);
  }
  const volumeKey = nativeKeywordVolumeKey(keyword, language), volumeRow = await step(() => prisma.youtubeCache.findUnique({ where: { key: volumeKey } }));
  const storedVolume = volumeRow && keywordCacheDate(volumeRow, volumeKey).getTime() > Date.now() ? keywordVolumeCache(volumeRow, volumeKey, keyword, language) : null;
  const fetchSource = (url: string) => step(async () => {
    const response = await fetch(url, { cache: 'no-store', redirect: 'error', credentials: 'omit' });
    if (!response.ok) throw Error('Keyword source unavailable'); return response;
  });
  const readJSON = (r: Response) => step(async () => boundedKeywordJSON(await r.json()));
  const readText = (r: Response) => step(async () => { const text = await r.text(); if (new TextEncoder().encode(text).length > 65536) throw Error('Keyword source too large'); return text; });
  const yt = (kind: string, params: Record<string, string>) => 'https://www.googleapis.com/youtube/v3/' + kind + '?' + new URLSearchParams({ ...params, key }).toString();
  const search = async (order: string, max: number) => keywordSearch(await readJSON(await fetchSource(yt('search', { part: 'snippet', q: keyword, type: 'video', maxResults: String(max), order }))), max);
  const stats = async (ids: string[]) => ids.length ? keywordStats(await readJSON(await fetchSource(yt('videos', { part: 'statistics,snippet', id: ids.join(',') }))), ids, Date.now()) : { videos: [], unavailableIds: [] };
  const top = await search('viewCount', 5), topData = await stats(top.ids), recent = await search('date', 15), recentData = await stats(recent.ids);
  const auto = async (query: string) => keywordSuggestions(await readText(await fetchSource('https://suggestqueries.google.com/complete/search?' + new URLSearchParams({ client: 'youtube', ds: 'yt', q: query, hl: language }).toString())), query);
  const relatedKeywords = await auto(keyword), words = keyword.split(/\s+/), prefix = words.length > 2 ? words.slice(0, 2).join(' ') : words[0], suggestions = await auto(prefix);
  const base = Math.min(40, relatedKeywords.length / 8 * 40), index = suggestions.findIndex(s => s.toLowerCase().includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(s.toLowerCase()));
  const autocompleteScore = index < 0 ? base : Math.min(100, Math.max(0, base + 60 * (8 - index) / 8));
  let trendsScore: number | null = storedVolume?.score ?? null, trendsCollectedAt = storedVolume?.collectedAt ?? '';
  if (!storedVolume) {
    const request = JSON.stringify({ comparisonItem: [{ keyword, geo: 'ES', time: 'today 12-m' }], category: 0, property: 'youtube' });
    const response = await readText(await fetchSource('https://trends.google.com/trends/api/explore?' + new URLSearchParams({ hl: 'es', tz: '-60', req: request }).toString()));
    const raw = boundedKeywordJSON(JSON.parse(response.replace(/^\)\]\}'/, ''))) as { widgets?: unknown };
    if (!raw || !Array.isArray(raw.widgets) || raw.widgets.length > 50) throw Error('Keyword Trends envelope unavailable');
    const widgets = raw.widgets.filter((w: any) => w && w.id === 'TIMESERIES') as { token?: unknown; request?: unknown }[];
    if (widgets.length > 1) throw Error('Keyword Trends ambiguous');
    if (widgets.length) {
      const widget = widgets[0];
      if (typeof widget.token !== 'string' || !widget.token || widget.token.length > 2048 || /[\x00-\x1f\x7f]/.test(widget.token)
        || !widget.request || typeof widget.request !== 'object' || Array.isArray(widget.request)) throw Error('Keyword Trends widget unavailable');
      boundedKeywordJSON(widget.request, 16384);
      const url = 'https://trends.google.com/trends/api/widgetdata/multiline?' + new URLSearchParams({ hl: 'es', tz: '-60', req: JSON.stringify(widget.request), token: widget.token }).toString();
      trendsScore = keywordTrendPoints(JSON.parse((await readText(await fetchSource(url))).replace(/^\)\]\}'/, '')));
    }
    trendsCollectedAt = new Date(Date.now()).toISOString();
  }
  const collectedAt = new Date(Date.now()).toISOString();
  const data = deriveKeywordPayload({ profile: 'keywords-native-v1', keyword, language, collectedAt, totalResults: top.totalResults,
    topVideos: topData.videos.sort((a, b) => b.views - a.views), recentVideos: recentData.videos, relatedKeywords, trendsScore, trendsCollectedAt, autocompleteScore,
    coverage: { top: { requestedIds: top.ids, unavailableIds: topData.unavailableIds }, recent: { requestedIds: recent.ids, unavailableIds: recentData.unavailableIds } } }, keyword, language);
  projectKeywordPayload(data, keyword, language);
  if (!storedVolume) {
    const volume = { profile: 'keywords-volume-v1', keyword: keyword.toLowerCase(), language, collectedAt: trendsCollectedAt, trendsScore } as Prisma.InputJsonValue;
    const expiresAt = new Date(Date.parse(trendsCollectedAt) + 7 * 86400000);
    await step(() => prisma.youtubeCache.upsert({ where: { key: volumeKey }, create: { key: volumeKey, data: volume, expiresAt }, update: { data: volume, expiresAt } }));
  }
  const value = data as unknown as Prisma.InputJsonValue, expiresAt = new Date(Date.parse(collectedAt) + 86400000);
  await step(() => prisma.youtubeCache.upsert({ where: { key: cacheKey }, create: { key: cacheKey, data: value, expiresAt }, update: { data: value, expiresAt } }));
  return reply(data);
}
