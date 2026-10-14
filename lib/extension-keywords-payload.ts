const fail = (): never => { throw Error('Keyword payload unavailable'); };
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : fail();
export function boundedKeywordJSON(v: unknown, limit = 131072) {
  const raw = JSON.stringify(v); if (!raw || new TextEncoder().encode(raw).length > limit) fail(); return v;
}
const count = (v: unknown): number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fail();
const text = (v: unknown, max: number): string => typeof v === 'string' && v.length <= max && !/[\x00-\x1f\x7f]/.test(v) ? v : fail();
const id = (v: unknown) => typeof v === 'string' && /^[\w-]{11}$/.test(v) ? v : fail();
const list = (v: unknown, max: number): any[] => Array.isArray(v) && v.length <= max ? v : fail();
export function keywordDate(v: unknown, before = Date.now()): string {
  const s = text(v, 64), at = Date.parse(s);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) || !Number.isFinite(at) || at < 0 || at > before) fail();
  const [y, m, d] = s.slice(0, 10).split('-').map(Number), date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || Number(s.slice(11, 13)) > 23 || Number(s.slice(14, 16)) > 59 || Number(s.slice(17, 19)) > 59) fail();
  return s;
}
const iso = (v: unknown, before = Date.now()) => { const s = keywordDate(v, before); if (new Date(s).toISOString() !== s) fail(); return s; };
const thumbnail = (v: unknown) => { const s = text(v, 2048); if (!s) return s; let u: URL; try { u = new URL(s); } catch { return fail(); } if (u.protocol !== 'https:' || u.username || u.password || u.port) fail(); return s; };
const decimal = (v: unknown) => typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v) ? count(Number(v)) : fail();
export function keywordSearch(v: unknown, max: number) {
  boundedKeywordJSON(v); const r = record(v), items = list(r.items, max), ids = items.map(x => id(record(record(x).id).videoId));
  if (new Set(ids).size !== ids.length) fail();
  const totalResults = count(record(r.pageInfo).totalResults); if (!ids.length && totalResults !== 0) fail();
  return { ids, totalResults };
}
export function keywordStats(v: unknown, requested: string[], before: number) {
  boundedKeywordJSON(v); const seen = new Set<string>();
  const videos = list(record(v).items, requested.length).map(value => {
    const r = record(value), videoId = id(r.id), s = record(r.snippet), stats = record(r.statistics);
    if (!requested.includes(videoId) || seen.has(videoId)) fail(); seen.add(videoId);
    return { videoId, title: text(s.title, 1000), channelName: text(s.channelTitle, 1000),
      thumbnail: thumbnail(s.thumbnails?.medium?.url ?? ''), publishedAt: keywordDate(s.publishedAt, before),
      views: decimal(stats.viewCount), likes: stats.likeCount === undefined ? null : decimal(stats.likeCount) };
  });
  return { videos, unavailableIds: requested.filter(x => !seen.has(x)) };
}
export function keywordSuggestions(raw: string, query: string) {
  if (new TextEncoder().encode(raw).length > 65536) fail();
  const match = raw.trim().match(/^window\.google\.ac\.h\(([\s\S]*)\);?$/); if (!match) fail();
  const v = list(JSON.parse(match![1]), 3); if (v.length < 2 || v[0] !== query) fail();
  const suggestions = list(v[1], 100).map(x => { const entry = list(x, 8); const s = text(entry[0], 200); if (!s || s !== s.trim()) fail(); return s; });
  return [...new Set(suggestions)].slice(0, 8);
}
export function keywordTrendPoints(v: unknown): number | null {
  boundedKeywordJSON(v); const points = list(record(record(v).default).timelineData, 1000);
  if (!points.length) return null;
  const values = points.map(p => { const value = list(record(p).value, 1); if (value.length !== 1 || !Number.isFinite(value[0]) || value[0] < 0 || value[0] > 100) fail(); return value[0] as number; });
  return Math.round(values.reduce((n, x) => n + x, 0) / values.length);
}
export const nativeKeywordCacheKey = (keyword: string, language: string) => 'kw-native-v1:' + language + ':' + keyword.toLowerCase();
export const nativeKeywordVolumeKey = (keyword: string, language: string) => 'vol-native-v1:' + language + ':' + keyword.toLowerCase();
export function keywordCacheDate(row: unknown, key: string): Date {
  const r = record(row); if (r.key !== key || !(r.expiresAt instanceof Date) || !Number.isFinite(r.expiresAt.getTime())) fail(); return r.expiresAt;
}
export function keywordVolumeCache(row: unknown, key: string, keyword: string, language: string) {
  const expires = keywordCacheDate(row, key), d = record(record(row).data); boundedKeywordJSON(d, 4096);
  if (d.profile !== 'keywords-volume-v1' || d.keyword !== keyword.toLowerCase() || d.language !== language) fail();
  const collectedAt = iso(d.collectedAt); if (expires.getTime() > Date.parse(collectedAt) + 7 * 86400000 || expires.getTime() <= Date.now()) fail();
  const score = d.trendsScore; if (score !== null && (!Number.isSafeInteger(score) || score < 0 || score > 100)) fail();
  return { score: score as number | null, collectedAt };
}
const buckets = [
  [80, 'Muy Alto', 'Very High', '100K+ busq/mes', '100K+ searches/mo'],
  [60, 'Alto', 'High', '10K-100K busq/mes', '10K-100K searches/mo'],
  [40, 'Medio', 'Medium', '1K-10K busq/mes', '1K-10K searches/mo'],
  [20, 'Bajo', 'Low', '100-1K busq/mes', '100-1K searches/mo'],
  [0, 'Muy Bajo', 'Very Low', '<100 busq/mes', '<100 searches/mo'],
] as const;
const norm = (v: number) => v > 0 ? Math.min(100, Math.max(0, Math.log10(v) / 7 * 100)) : 0;
function projectedVideo(v: unknown, before: number) {
  const r = record(v); return { videoId: id(r.videoId), title: text(r.title, 1000), channelName: text(r.channelName, 1000),
    thumbnail: thumbnail(r.thumbnail), publishedAt: keywordDate(r.publishedAt, before), views: count(r.views), likes: r.likes === null ? null : count(r.likes) };
}
function coverage(v: unknown, max: number, videos: ReturnType<typeof projectedVideo>[]) {
  const r = record(v), requestedIds = list(r.requestedIds, max).map(id), unavailableIds = list(r.unavailableIds, max).map(id);
  if (new Set(requestedIds).size !== requestedIds.length || new Set(unavailableIds).size !== unavailableIds.length
    || videos.some(x => !requestedIds.includes(x.videoId) || unavailableIds.includes(x.videoId))
    || new Set(videos.map(x => x.videoId)).size !== videos.length || unavailableIds.some(x => !requestedIds.includes(x))
    || videos.length + unavailableIds.length !== requestedIds.length) fail();
  return { requestedIds, unavailableIds };
}
export function deriveKeywordPayload(value: unknown, keyword: string, language: string) {
  const r = record(value); boundedKeywordJSON(r);
  if (r.profile !== 'keywords-native-v1' || typeof r.keyword !== 'string' || r.keyword !== r.keyword.trim() || !r.keyword || r.keyword.length > 200
    || /[\x00-\x1f\x7f]/.test(r.keyword) || r.keyword.toLowerCase() !== keyword.toLowerCase() || r.language !== language || !['en', 'es'].includes(language)) fail();
  const collectedAt = iso(r.collectedAt), at = Date.parse(collectedAt), trendsCollectedAt = iso(r.trendsCollectedAt, at);
  const topVideos = list(r.topVideos, 5).map(x => projectedVideo(x, at)), recentVideos = list(r.recentVideos, 15).map(x => projectedVideo(x, at));
  const cov = record(r.coverage), top = coverage(cov.top, 5, topVideos), recent = coverage(cov.recent, 15, recentVideos);
  const totalResults = count(r.totalResults); if (!top.requestedIds.length && totalResults !== 0) fail();
  if (topVideos.some((v, i) => i > 0 && v.views > topVideos[i - 1].views)) fail();
  const relatedKeywords = list(r.relatedKeywords, 8).map(x => { const s = text(x, 200); if (!s || s !== s.trim()) fail(); return s; }); if (new Set(relatedKeywords).size !== relatedKeywords.length) fail();
  const trendsScore = r.trendsScore; if (trendsScore !== null && (!Number.isSafeInteger(trendsScore) || trendsScore < 0 || trendsScore > 100)) fail();
  const ac = r.autocompleteScore; if (typeof ac !== 'number' || !Number.isFinite(ac) || ac < 0 || ac > 100) fail();
  const total = topVideos.reduce((n, v) => n + BigInt(v.views), 0n), avgViews = topVideos.length ? Number((total + BigInt(Math.floor(topVideos.length / 2))) / BigInt(topVideos.length)) : top.unavailableIds.length ? null : 0;
  const ready = topVideos.length > 0 && top.unavailableIds.length === 0;
  let competition: 'low' | 'medium' | 'high' | 'unavailable' = 'unavailable', competitionScore: number | null = null, opportunityScore: number | null = null;
  let volumeEstimate: { score: number; label: string; labelEn: string; range: string; rangeEn: string } | null = null;
  if (ready && avgViews !== null) {
    competition = avgViews > 1000000 || totalResults > 5000000 ? 'high' : avgViews > 100000 || totalResults > 500000 ? 'medium' : 'low';
    competitionScore = competition === 'high' ? Math.min(95, 72 + Math.floor(avgViews / 2000000) * 3) : competition === 'medium' ? Math.min(71, 42 + Math.floor(avgViews / 100000) * 4) : Math.min(41, Math.max(8, Math.floor(avgViews / 5000)));
    opportunityScore = Math.max(5, Math.min(98, 100 - competitionScore + (topVideos[0].views > 500000 ? 12 : topVideos[0].views > 100000 ? 6 : 0)));
    const raw = trendsScore === null ? .50 * norm(avgViews) + .28 * norm(totalResults) + .22 * ac : .35 * norm(avgViews) + .30 * trendsScore + .20 * norm(totalResults) + .15 * ac;
    const score = Math.round(Math.max(0, Math.min(100, raw))), b = buckets.find(x => score >= x[0])!;
    volumeEstimate = { score, label: b[1], labelEn: b[2], range: b[3], rangeEn: b[4] };
  }
  const trendingNow = recentVideos.map(v => { const age = Math.max(1, (at - Date.parse(v.publishedAt)) / 3600000); return { ...v, ageHours: Math.round(age), vph: Math.round(v.views / age * 10) / 10 }; }).filter(v => v.ageHours <= 720).sort((a, b) => b.vph - a.vph).slice(0, 6);
  return { profile: 'keywords-native-v1', keyword: r.keyword as string, language, collectedAt, totalResults, topVideos, recentVideos, trendingNow,
    relatedKeywords, trendsScore: trendsScore as number | null, trendsCollectedAt, autocompleteScore: ac, coverage: { top, recent },
    collectionStatus: top.unavailableIds.length || recent.unavailableIds.length ? 'partial' : 'complete', avgViews, competition, competitionScore, opportunityScore, volumeEstimate,
    estimateStatus: !ready ? top.unavailableIds.length ? 'unavailable-partial' : 'unavailable-no-videos' : trendsScore === null ? 'heuristic-partial-unconfirmed' : 'heuristic-unconfirmed' };
}
export function projectKeywordPayload(value: unknown, keyword: string, language: string) {
  const data = deriveKeywordPayload(value, keyword, language), r = record(value);
  if (Object.keys(r).length !== Object.keys(data).length || Object.keys(data).some(k => !Object.hasOwn(r, k))) fail();
  for (const k of ['trendingNow', 'collectionStatus', 'avgViews', 'competition', 'competitionScore', 'opportunityScore', 'volumeEstimate', 'estimateStatus'])
    if (JSON.stringify(r[k]) !== JSON.stringify(data[k as keyof typeof data])) fail();
  return data;
}
