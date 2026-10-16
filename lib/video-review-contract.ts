import { retentionObject, retentionCommand, retentionChannelId, retentionVideoId } from '@/lib/retention-contract';
import { auditVideo, auditInsights, auditCount, type AuditVideo } from '@/lib/audit-contract';
export { retentionObject as videoReviewObject, retentionCommand as videoReviewCommand, retentionChannelId as videoReviewChannelId } from '@/lib/retention-contract';
export { auditInsights as videoReviewInsights } from '@/lib/audit-contract';
export const reviewTemplate = 'private_video_editorial_v2';
export type VideoReviewInput = Readonly<{ lang: 'es' | 'en'; videoId: string | null; thumbnails: boolean }>;
export type ReviewVideo = AuditVideo & { descriptionExcerpt: string | null; thumbnailUrl: string | null; captions: 'available' | 'unavailable' | 'not-reported' };
export type VideoReviewResult = { channel: { id: string; name: string }; selectedVideoIds: string[]; unavailableVideoIds: string[]; videos: ReviewVideo[]; source: 'video-id' | 'uploads-first-page'; hasMore: boolean;
  insights: ReturnType<typeof auditInsights> | null; visualInsights: ReturnType<typeof auditInsights> | null; adviceStatus: 'ready' | 'unavailable' | 'not-applicable'; visualStatus: 'ready' | 'unavailable' | 'not-requested' | 'not-applicable'; persisted: boolean;
  reviewAnalysis: { commandRef: string; userId: string; email: string; sessionRef: string; lang: 'es' | 'en'; videoId: string | null; thumbnails: boolean; channelId: string; coverage: 'not-reported'; asOf: number; expiresAt: number } };
const fail = (): never => { throw Error('videoReview_unconfirmed'); };
const exact = (v: Record<string, unknown>, keys: string) => { if (Object.keys(v).sort().join(',') !== keys) fail(); };
const image = (v: unknown, id: string): v is string => typeof v === 'string' && v.length < 200 && new RegExp('^https://i\\.ytimg\\.com/(?:vi|vi_webp)/' + id + '/(?:default|mqdefault|hqdefault|sddefault|maxresdefault)\\.(?:jpg|webp)$').test(v);
export function videoReviewInput(value: unknown): VideoReviewInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_input'); const v = retentionObject(value);
  if (Object.keys(v).sort().join(',') !== 'lang,thumbnails,videoId' || !['es', 'en'].includes(v.lang as string) || v.videoId !== null && !retentionVideoId(v.videoId) || typeof v.thumbnails !== 'boolean') throw Error('invalid_input'); return Object.freeze({ lang: v.lang as 'es' | 'en', videoId: v.videoId as string | null, thumbnails: v.thumbnails });
}
export function videoReviewVideo(value: unknown, channelId: string, at: number): ReviewVideo {
  const row = retentionObject(value), snippet = retentionObject(row.snippet), details = row.contentDetails === undefined ? {} : retentionObject(row.contentDetails);
  const common = auditVideo({ ...row, statistics: row.statistics === undefined ? {} : row.statistics, contentDetails: details }, channelId, at);
  let thumbnailUrl: string | null = null;
  if (snippet.thumbnails !== undefined) { const thumbnails = retentionObject(snippet.thumbnails); for (const key of ['high', 'medium', 'default']) if (thumbnails[key] !== undefined) { const t = retentionObject(thumbnails[key]); if (!image(t.url, common.videoId)) fail(); if (!thumbnailUrl) thumbnailUrl = t.url as string; } }
  if (details.caption !== undefined && !['true', 'false'].includes(details.caption as string)) fail();
  return { ...common, descriptionExcerpt: snippet.description === undefined ? null : Array.from(snippet.description as string).slice(0, 300).join(''), thumbnailUrl, captions: details.caption === undefined ? 'not-reported' : details.caption === 'true' ? 'available' : 'unavailable' };
}
export function videoReviewResult(value: unknown): VideoReviewResult {
  const v = retentionObject(value), a = retentionObject(v.reviewAnalysis), channel = retentionObject(v.channel);
  exact(v, 'adviceStatus,channel,hasMore,insights,persisted,reviewAnalysis,selectedVideoIds,source,unavailableVideoIds,videos,visualInsights,visualStatus');
  exact(a, 'asOf,channelId,commandRef,coverage,email,expiresAt,lang,sessionRef,thumbnails,userId,videoId');
  if (!retentionCommand(a.commandRef) || !retentionCommand(a.sessionRef) || !retentionChannelId(a.channelId) || typeof a.userId !== 'string' || typeof a.email !== 'string' || a.coverage !== 'not-reported'
    || !Number.isSafeInteger(a.asOf) || !Number.isSafeInteger(a.expiresAt) || (a.asOf as number) < 0 || (a.expiresAt as number) <= (a.asOf as number) || (a.expiresAt as number) - (a.asOf as number) > 55000) fail();
  videoReviewInput({ lang: a.lang, videoId: a.videoId, thumbnails: a.thumbnails }); exact(channel, 'id,name');
  if (channel.id !== a.channelId || typeof channel.name !== 'string' || !channel.name.trim() || channel.name.length > 500 || typeof v.hasMore !== 'boolean' || typeof v.persisted !== 'boolean'
    || v.source !== (a.videoId ? 'video-id' : 'uploads-first-page') || a.videoId && v.hasMore) fail();
  if (!Array.isArray(v.selectedVideoIds) || v.selectedVideoIds.length > 3 || !v.selectedVideoIds.every(retentionVideoId) || new Set(v.selectedVideoIds).size !== v.selectedVideoIds.length
    || a.videoId && JSON.stringify(v.selectedVideoIds) !== JSON.stringify([a.videoId]) || !Array.isArray(v.unavailableVideoIds) || !v.unavailableVideoIds.every(retentionVideoId) || new Set(v.unavailableVideoIds).size !== v.unavailableVideoIds.length
    || v.unavailableVideoIds.some(id => !(v.selectedVideoIds as string[]).includes(id)) || !Array.isArray(v.videos) || v.videos.length + v.unavailableVideoIds.length !== v.selectedVideoIds.length) fail();
  const ids: string[] = [];
  for (const entry of v.videos as unknown[]) {
    const row = retentionObject(entry); exact(row, 'captions,channelId,comments,description,descriptionExcerpt,durationSeconds,likes,publishedAt,tags,thumbnailUrl,title,videoId,views');
    if (!retentionVideoId(row.videoId) || row.channelId !== a.channelId || ids.includes(row.videoId) || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 500) fail(); ids.push(row.videoId as string);
    const at = typeof row.publishedAt === 'string' ? Date.parse(row.publishedAt) : NaN; if (!Number.isFinite(at) || at < 0 || at > (a.asOf as number) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(row.publishedAt as string) || new Date(at).toISOString().replace('.000Z', 'Z') !== (row.publishedAt as string).replace('.000Z', 'Z')) fail();
    for (const key of ['views', 'likes', 'comments', 'durationSeconds']) if (row[key] !== null) auditCount(row[key]);
    if (row.tags !== null && (!Array.isArray(row.tags) || row.tags.length > 100 || row.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 500) || row.tags.join('').length > 500)) fail();
    if (row.description !== null) { const d = retentionObject(row.description); exact(d, 'characters,hasLinks,hasTimestampText,words'); if (auditCount(d.characters) > 10000 || auditCount(d.words) > auditCount(d.characters) || typeof d.hasLinks !== 'boolean' || typeof d.hasTimestampText !== 'boolean') fail(); }
    if (row.descriptionExcerpt !== null && (typeof row.descriptionExcerpt !== 'string' || Array.from(row.descriptionExcerpt).length > 300) || (row.description === null) !== (row.descriptionExcerpt === null)
      || row.thumbnailUrl !== null && !image(row.thumbnailUrl, row.videoId as string) || !['available', 'unavailable', 'not-reported'].includes(row.captions as string)) fail();
  }
  if (JSON.stringify(ids) !== JSON.stringify((v.selectedVideoIds as string[]).filter(id => !(v.unavailableVideoIds as string[]).includes(id)))) fail();
  const visual = a.thumbnails && (v.videos as ReviewVideo[]).some(v => v.thumbnailUrl), hasData = ids.length > 0;
  if (!['ready', 'unavailable', 'not-applicable'].includes(v.adviceStatus as string) || (hasData ? v.adviceStatus === 'not-applicable' : v.adviceStatus !== 'not-applicable')
    || !['ready', 'unavailable', 'not-applicable', 'not-requested'].includes(v.visualStatus as string) || (visual ? !['ready', 'unavailable'].includes(v.visualStatus as string) : v.visualStatus !== (a.thumbnails ? 'not-applicable' : 'not-requested'))
    || (v.adviceStatus === 'ready') !== (v.insights !== null) || (v.visualStatus === 'ready') !== (v.visualInsights !== null) || v.persisted && (v.adviceStatus === 'unavailable' || v.visualStatus === 'unavailable')) fail();
  if (v.insights !== null) auditInsights(v.insights); if (v.visualInsights !== null) auditInsights(v.visualInsights); return v as unknown as VideoReviewResult;
}
export type ReviewHistory = { entries: { id: string; recordedAt: string; review: VideoReviewResult }[]; legacy: { id: string; videoId: string; title: string | null; recordedAt: string }[]; omitted: number;
  historyAnalysis: { commandRef: string; userId: string; email: string; sessionRef: string; lang: 'es' | 'en'; asOf: number; expiresAt: number; limit: 5; historicalOnly: true } };
export function reviewHistoryResult(value: unknown): ReviewHistory {
  const v = retentionObject(value), a = retentionObject(v.historyAnalysis); exact(v, 'entries,historyAnalysis,legacy,omitted'); exact(a, 'asOf,commandRef,email,expiresAt,historicalOnly,lang,limit,sessionRef,userId');
  if (!retentionCommand(a.commandRef) || !retentionCommand(a.sessionRef) || typeof a.userId !== 'string' || typeof a.email !== 'string' || !['es', 'en'].includes(a.lang as string) || !Number.isSafeInteger(a.asOf) || !Number.isSafeInteger(a.expiresAt) || (a.asOf as number) < 0 || (a.expiresAt as number) <= (a.asOf as number) || (a.expiresAt as number) - (a.asOf as number) > 25000 || a.limit !== 5 || a.historicalOnly !== true) fail();
  auditCount(v.omitted); if (!Array.isArray(v.entries) || v.entries.length > 5 || !Array.isArray(v.legacy) || v.legacy.length > 5) fail(); const ids = new Set<string>();
  for (const entry of [...v.entries as unknown[], ...v.legacy as unknown[]]) { const row = retentionObject(entry); if (typeof row.id !== 'string' || !row.id || row.id.length > 128 || ids.has(row.id) || typeof row.recordedAt !== 'string' || !Number.isFinite(Date.parse(row.recordedAt)) || Date.parse(row.recordedAt) > (a.asOf as number)) fail(); ids.add(row.id as string); }
  for (const entry of v.entries as unknown[]) { const row = retentionObject(entry); exact(row, 'id,recordedAt,review'); const data = videoReviewResult(row.review); if (!data.persisted || data.reviewAnalysis.userId !== a.userId || new Date(data.reviewAnalysis.asOf).toISOString() !== row.recordedAt || row.id !== 'private_video_review_' + data.reviewAnalysis.commandRef) fail(); }
  for (const entry of v.legacy as unknown[]) { const row = retentionObject(entry); exact(row, 'id,recordedAt,title,videoId'); if (typeof row.videoId !== 'string' || row.videoId.length > 128 || row.title !== null && (typeof row.title !== 'string' || row.title.length > 500)) fail(); }
  return v as unknown as ReviewHistory;
}
