import { retentionObject, retentionCommand, retentionChannelId, retentionVideoId } from '@/lib/retention-contract';
export { retentionObject as auditObject, retentionCommand as auditCommand, retentionChannelId as auditChannelId } from '@/lib/retention-contract';
export type AuditInput = Readonly<{ lang: 'es' | 'en' }>;
export type AuditActivity = { views: number; watchMinutes: number; gained: number; lost: number };
export type AuditVideo = { videoId: string; channelId: string; title: string; publishedAt: string; durationSeconds: number | null; views: number | null; likes: number | null; comments: number | null;
  tags: string[] | null; description: { characters: number; words: number; hasLinks: boolean; hasTimestampText: boolean } | null };
export type AuditResult = { channel: { id: string; name: string }; overview: (AuditActivity & { likes: number; comments: number; shares: number }) | null; days: (AuditActivity & { date: string })[];
  uploads: { playlistId: string; hasMore: boolean; selectedVideoIds: string[]; unavailableVideoIds: string[]; videos: AuditVideo[] };
  insights: { summary: string; tips: string[]; limitations: string[] } | null; adviceStatus: 'ready' | 'not-applicable' | 'unavailable';
  auditAnalysis: { commandRef: string; userId: string; email: string; sessionRef: string; lang: 'es' | 'en'; channelId: string; requestedStartDate: string; requestedEndDate: string;
    coverage: 'not-reported'; separateReads: true; uploadLimit: 20; source: 'uploads-playlist-first-page'; asOf: number; expiresAt: number } };
const fail = (): never => { throw Error('audit_unconfirmed'); };
export const auditPlaylistId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{2,128}$/.test(v);
export function auditInput(value: unknown): AuditInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_input'); const v = retentionObject(value);
  if (Object.keys(v).join(',') !== 'lang' || !['es', 'en'].includes(v.lang as string)) throw Error('invalid_input'); return Object.freeze({ lang: v.lang as 'es' | 'en' });
}
export function auditCount(v: unknown): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) fail(); return v as number; }
export function auditPublicCount(v: unknown): number | null {
  if (v === undefined) return null; if (typeof v !== 'string' || !/^\d{1,16}$/.test(v) || !Number.isSafeInteger(Number(v))) fail(); return Number(v);
}
export function auditDuration(v: unknown): number | null {
  if (v === undefined) return null; if (typeof v !== 'string') fail();
  const match = (v as string).match(/^P(?:(\d{1,8})D)?T(?:(\d{1,8})H)?(?:(\d{1,8})M)?(?:(\d{1,8})S)?$/);
  if (!match || !match.slice(2).some(s => s !== undefined)) fail();
  return auditCount(Number(match![1] ?? 0) * 86400 + Number(match![2] ?? 0) * 3600 + Number(match![3] ?? 0) * 60 + Number(match![4] ?? 0));
}
export function auditDay(v: unknown, start: string, end: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v + 'T00:00:00Z')) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v || v < start || v > end) fail(); return v as string;
}
export function auditTable(value: unknown, columns: [string, 'DIMENSION' | 'METRIC', 'STRING' | 'INTEGER'][], limit: number): unknown[][] {
  const v = retentionObject(value);
  if (v.kind !== 'youtubeAnalytics#resultTable' || !Array.isArray(v.columnHeaders) || v.columnHeaders.length !== columns.length
    || v.columnHeaders.some((c, i) => { const h = retentionObject(c); return h.name !== columns[i][0] || h.columnType !== columns[i][1] || h.dataType !== columns[i][2]; })
    || Object.hasOwn(v, 'rows') && !Array.isArray(v.rows)) fail(); const rows = v.rows ?? [];
  if (!Array.isArray(rows) || rows.length > limit || rows.some(r => !Array.isArray(r) || r.length !== columns.length)) fail(); return rows as unknown[][];
}
function publication(v: unknown, at: number): string {
  const time = typeof v === 'string' ? Date.parse(v) : NaN;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v) || !Number.isFinite(time) || time < 0 || time > at
    || new Date(time).toISOString().replace('.000Z', 'Z') !== v.replace('.000Z', 'Z')) fail(); return v as string;
}
export function auditVideo(value: unknown, channelId: string, at: number): AuditVideo {
  const v = retentionObject(value), snippet = retentionObject(v.snippet), stats = retentionObject(v.statistics), details = retentionObject(v.contentDetails);
  if (v.kind !== 'youtube#video' || !retentionVideoId(v.id) || snippet.channelId !== channelId || typeof snippet.title !== 'string' || !snippet.title.trim() || snippet.title.length > 500) fail();
  let description: AuditVideo['description'] = null;
  if (snippet.description !== undefined) {
    if (typeof snippet.description !== 'string' || snippet.description.length > 10000) fail(); const text = snippet.description as string;
    description = { characters: Array.from(text).length, words: text.split(/\s+/u).filter(Boolean).length, hasLinks: /https?:\/\//i.test(text), hasTimestampText: /\b\d{1,2}:\d{2}\b/.test(text) };
  }
  let tags: string[] | null = null;
  if (snippet.tags !== undefined) { if (!Array.isArray(snippet.tags) || snippet.tags.length > 100 || snippet.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 500) || snippet.tags.join('').length > 500) fail(); tags = [...snippet.tags as string[]]; }
  return { videoId: v.id as string, channelId, title: snippet.title as string, publishedAt: publication(snippet.publishedAt, at), durationSeconds: auditDuration(details.duration),
    views: auditPublicCount(stats.viewCount), likes: auditPublicCount(stats.likeCount), comments: auditPublicCount(stats.commentCount), description, tags };
}
export function auditInsights(value: unknown): NonNullable<AuditResult['insights']> {
  const v = retentionObject(value); if (Object.keys(v).sort().join(',') !== 'limitations,summary,tips' || typeof v.summary !== 'string' || !v.summary.trim() || v.summary.length > 2000) fail();
  for (const key of ['tips', 'limitations']) if (!Array.isArray(v[key]) || v[key].length < 1 || v[key].length > 4 || v[key].some((s: unknown) => typeof s !== 'string' || !s.trim() || s.length > 1000)) fail(); return v as NonNullable<AuditResult['insights']>;
}
export function auditResult(value: unknown): AuditResult {
  const v = retentionObject(value), a = retentionObject(v.auditAnalysis), channel = retentionObject(v.channel), uploads = retentionObject(v.uploads);
  if (Object.keys(v).sort().join(',') !== 'adviceStatus,auditAnalysis,channel,days,insights,overview,uploads'
    || Object.keys(a).sort().join(',') !== 'asOf,channelId,commandRef,coverage,email,expiresAt,lang,requestedEndDate,requestedStartDate,separateReads,sessionRef,source,uploadLimit,userId'
    || !retentionCommand(a.commandRef) || !retentionCommand(a.sessionRef) || !retentionChannelId(a.channelId) || typeof a.userId !== 'string' || typeof a.email !== 'string' || !['es', 'en'].includes(a.lang as string)
    || !Number.isSafeInteger(a.asOf) || !Number.isSafeInteger(a.expiresAt) || (a.asOf as number) < 0 || (a.expiresAt as number) <= (a.asOf as number) || (a.expiresAt as number) - (a.asOf as number) > 55000
    || a.requestedStartDate !== new Date((a.asOf as number) - 29 * 86400000).toISOString().slice(0, 10) || a.requestedEndDate !== new Date((a.asOf as number) - 2 * 86400000).toISOString().slice(0, 10)
    || a.coverage !== 'not-reported' || a.separateReads !== true || a.uploadLimit !== 20 || a.source !== 'uploads-playlist-first-page'
    || Object.keys(channel).sort().join(',') !== 'id,name' || channel.id !== a.channelId || typeof channel.name !== 'string' || !channel.name.trim() || channel.name.length > 500) fail();
  const activity = (row: Record<string, unknown>) => { for (const k of ['views', 'watchMinutes', 'gained', 'lost']) auditCount(row[k]); };
  if (v.overview !== null) { const row = retentionObject(v.overview); if (Object.keys(row).sort().join(',') !== 'comments,gained,likes,lost,shares,views,watchMinutes') fail(); activity(row); for (const k of ['likes', 'comments', 'shares']) auditCount(row[k]); }
  if (!Array.isArray(v.days) || v.days.length > 28) fail(); let prior = '';
  for (const entry of v.days as unknown[]) { const row = retentionObject(entry), day = auditDay(row.date, a.requestedStartDate as string, a.requestedEndDate as string); if (Object.keys(row).sort().join(',') !== 'date,gained,lost,views,watchMinutes' || day <= prior) fail(); prior = day; activity(row); }
  if (Object.keys(uploads).sort().join(',') !== 'hasMore,playlistId,selectedVideoIds,unavailableVideoIds,videos' || !auditPlaylistId(uploads.playlistId) || typeof uploads.hasMore !== 'boolean'
    || !Array.isArray(uploads.selectedVideoIds) || uploads.selectedVideoIds.length > 20 || !uploads.selectedVideoIds.every(retentionVideoId) || new Set(uploads.selectedVideoIds).size !== uploads.selectedVideoIds.length
    || !Array.isArray(uploads.unavailableVideoIds) || !uploads.unavailableVideoIds.every(retentionVideoId) || new Set(uploads.unavailableVideoIds).size !== uploads.unavailableVideoIds.length || uploads.unavailableVideoIds.some(id => !(uploads.selectedVideoIds as string[]).includes(id))
    || !Array.isArray(uploads.videos) || uploads.videos.length + uploads.unavailableVideoIds.length !== uploads.selectedVideoIds.length) fail();
  const ids: string[] = [];
  for (const entry of uploads.videos as unknown[]) {
    const row = retentionObject(entry);
    if (Object.keys(row).sort().join(',') !== 'channelId,comments,description,durationSeconds,likes,publishedAt,tags,title,videoId,views' || !retentionVideoId(row.videoId) || ids.includes(row.videoId) || row.channelId !== a.channelId
      || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 500) fail(); ids.push(row.videoId as string); publication(row.publishedAt, a.asOf as number);
    for (const k of ['durationSeconds', 'views', 'likes', 'comments']) if (row[k] !== null) auditCount(row[k]);
    if (row.tags !== null && (!Array.isArray(row.tags) || row.tags.length > 100 || row.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 500) || row.tags.join('').length > 500)) fail();
    if (row.description !== null) { const d = retentionObject(row.description); if (Object.keys(d).sort().join(',') !== 'characters,hasLinks,hasTimestampText,words' || typeof d.hasLinks !== 'boolean' || typeof d.hasTimestampText !== 'boolean' || auditCount(d.characters) > 10000 || auditCount(d.words) > auditCount(d.characters)) fail(); }
  }
  if (JSON.stringify(ids) !== JSON.stringify((uploads.selectedVideoIds as string[]).filter(id => !(uploads.unavailableVideoIds as string[]).includes(id)))) fail();
  const hasData = v.overview !== null || (v.days as unknown[]).length > 0 || ids.length > 0;
  if (!['ready', 'not-applicable', 'unavailable'].includes(v.adviceStatus as string) || (hasData ? v.adviceStatus === 'not-applicable' : v.adviceStatus !== 'not-applicable') || (v.adviceStatus === 'ready' ? v.insights === null : v.insights !== null)) fail();
  if (v.insights !== null) auditInsights(v.insights); return v as unknown as AuditResult;
}
