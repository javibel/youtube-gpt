import { retentionObject, retentionCommand, retentionChannelId, retentionVideoId } from '@/lib/retention-contract';
export { retentionObject as analyticsObject, retentionCommand as analyticsCommand, retentionChannelId as analyticsChannelId } from '@/lib/retention-contract';
export type AnalyticsInput = Readonly<{ lang: 'es' | 'en' }>;
type Activity = { views: number; watchMinutes: number; gained: number; lost: number };
export type AnalyticsResult = {
  channel: { id: string; name: string };
  overview: (Activity & { averageSeconds: number; averagePercentage: number; likes: number; comments: number; shares: number }) | null;
  traffic: { source: string; views: number; watchMinutes: number }[];
  countries: { country: string; views: number; watchMinutes: number }[];
  videos: { videoId: string; title: string | null; views: number; watchMinutes: number; averageSeconds: number; likes: number; gainedFromWatchPage: number }[];
  days: (Activity & { date: string })[];
  insights: { summary: string; tips: string[]; limitations: string[] } | null;
  adviceStatus: 'ready' | 'not-applicable' | 'unavailable';
  analyticsAnalysis: { commandRef: string; userId: string; email: string; sessionRef: string; lang: 'es' | 'en'; channelId: string;
    requestedStartDate: string; requestedEndDate: string; dailyStartDate: string; coverage: 'not-reported'; separateReads: true;
    trafficLimit: 25; countryLimit: 10; videoLimit: 10; asOf: number; expiresAt: number };
};
const fail = (): never => { throw Error('analytics_unconfirmed'); };
const keys = (v: Record<string, unknown>, expected: string) => { if (Object.keys(v).sort().join(',') !== expected) fail(); };
export function analyticsInput(value: unknown): AnalyticsInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_input');
  const v = retentionObject(value); if (Object.keys(v).join(',') !== 'lang' || !['es', 'en'].includes(v.lang as string)) throw Error('invalid_input'); return Object.freeze({ lang: v.lang as 'es' | 'en' });
}
export function analyticsNumber(v: unknown): number { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > Number.MAX_SAFE_INTEGER) fail(); return v as number; }
export function analyticsCount(v: unknown): number { const n = analyticsNumber(v); if (!Number.isSafeInteger(n)) fail(); return n; }
export function analyticsDay(v: unknown, start: string, end: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v + 'T00:00:00Z')) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v || v < start || v > end) fail(); return v as string;
}
export function analyticsTable(value: unknown, columns: [string, 'DIMENSION' | 'METRIC', 'STRING' | 'INTEGER' | 'NUMBER'][], limit: number): unknown[][] {
  const v = retentionObject(value);
  if (v.kind !== 'youtubeAnalytics#resultTable' || !Array.isArray(v.columnHeaders) || v.columnHeaders.length !== columns.length
    || v.columnHeaders.some((c, i) => { const h = retentionObject(c), type = columns[i][2]; return h.name !== columns[i][0] || h.columnType !== columns[i][1] || (type === 'NUMBER' ? !['INTEGER', 'FLOAT'].includes(h.dataType as string) : h.dataType !== type); })
    || Object.hasOwn(v, 'rows') && !Array.isArray(v.rows)) fail(); const rows = v.rows ?? [];
  if (!Array.isArray(rows) || rows.length > limit || rows.some(r => !Array.isArray(r) || r.length !== columns.length)) fail();
  for (const row of rows as unknown[][]) for (let i = 0; i < columns.length; i++) {
    const type = retentionObject((v.columnHeaders as unknown[])[i]).dataType;
    if (type === 'STRING') { if (typeof row[i] !== 'string') fail(); } else if (type === 'INTEGER') analyticsCount(row[i]); else analyticsNumber(row[i]);
  }
  return rows as unknown[][];
}
export function analyticsInsights(value: unknown): NonNullable<AnalyticsResult['insights']> {
  const v = retentionObject(value); keys(v, 'limitations,summary,tips'); if (typeof v.summary !== 'string' || !v.summary.trim() || v.summary.length > 2000) fail();
  for (const key of ['tips', 'limitations']) if (!Array.isArray(v[key]) || v[key].length < 1 || v[key].length > 4 || v[key].some((s: unknown) => typeof s !== 'string' || !s.trim() || s.length > 1000)) fail(); return v as NonNullable<AnalyticsResult['insights']>;
}
export function analyticsResult(value: unknown): AnalyticsResult {
  const v = retentionObject(value), a = retentionObject(v.analyticsAnalysis), channel = retentionObject(v.channel);
  keys(v, 'adviceStatus,analyticsAnalysis,channel,countries,days,insights,overview,traffic,videos');
  keys(a, 'asOf,channelId,commandRef,countryLimit,coverage,dailyStartDate,email,expiresAt,lang,requestedEndDate,requestedStartDate,separateReads,sessionRef,trafficLimit,userId,videoLimit');
  if (!retentionCommand(a.commandRef) || !retentionCommand(a.sessionRef) || !retentionChannelId(a.channelId) || typeof a.userId !== 'string' || typeof a.email !== 'string' || !['es', 'en'].includes(a.lang as string)
    || !Number.isSafeInteger(a.asOf) || !Number.isSafeInteger(a.expiresAt) || (a.asOf as number) < 0 || (a.expiresAt as number) <= (a.asOf as number) || (a.expiresAt as number) - (a.asOf as number) > 55000
    || a.requestedStartDate !== new Date((a.asOf as number) - 29 * 86400000).toISOString().slice(0, 10) || a.requestedEndDate !== new Date((a.asOf as number) - 2 * 86400000).toISOString().slice(0, 10)
    || a.dailyStartDate !== new Date((a.asOf as number) - 91 * 86400000).toISOString().slice(0, 10) || a.coverage !== 'not-reported' || a.separateReads !== true || a.trafficLimit !== 25 || a.countryLimit !== 10 || a.videoLimit !== 10) fail();
  keys(channel, 'id,name'); if (channel.id !== a.channelId || typeof channel.name !== 'string' || !channel.name.trim() || channel.name.length > 500) fail();
  const activity = (row: Record<string, unknown>) => { for (const k of ['views', 'watchMinutes', 'gained', 'lost']) analyticsCount(row[k]); };
  if (v.overview !== null) { const row = retentionObject(v.overview); keys(row, 'averagePercentage,averageSeconds,comments,gained,likes,lost,shares,views,watchMinutes'); activity(row); for (const k of ['likes', 'comments', 'shares']) analyticsCount(row[k]); analyticsNumber(row.averageSeconds); analyticsNumber(row.averagePercentage); }
  if (!Array.isArray(v.days) || v.days.length > 90) fail(); let prior = '';
  for (const entry of v.days as unknown[]) { const row = retentionObject(entry); keys(row, 'date,gained,lost,views,watchMinutes'); const day = analyticsDay(row.date, a.dailyStartDate as string, a.requestedEndDate as string); if (day <= prior) fail(); prior = day; activity(row); }
  for (const [field, key, limit, pattern] of [['traffic', 'source', 25, /^[A-Z][A-Z0-9_]{0,63}$/], ['countries', 'country', 10, /^[A-Z]{2}$/]] as const) {
    const entries = v[field]; if (!Array.isArray(entries) || entries.length > limit) fail(); const seen = new Set<string>(); let previous = Infinity;
    for (const entry of entries as unknown[]) { const row = retentionObject(entry); keys(row, [key, 'views', 'watchMinutes'].sort().join(',')); if (typeof row[key] !== 'string' || !pattern.test(row[key] as string) || seen.has(row[key] as string)) fail(); seen.add(row[key] as string); const count = analyticsCount(row.views); if (count > previous) fail(); previous = count; analyticsCount(row.watchMinutes); }
  }
  if (!Array.isArray(v.videos) || v.videos.length > 10) fail(); const seen = new Set<string>(); let previous = Infinity;
  for (const entry of v.videos as unknown[]) { const row = retentionObject(entry); keys(row, 'averageSeconds,gainedFromWatchPage,likes,title,videoId,views,watchMinutes'); if (!retentionVideoId(row.videoId) || seen.has(row.videoId) || row.title !== null && (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 500)) fail(); seen.add(row.videoId as string); const count = analyticsCount(row.views); if (count > previous) fail(); previous = count; for (const k of ['watchMinutes', 'likes', 'gainedFromWatchPage']) analyticsCount(row[k]); analyticsNumber(row.averageSeconds); }
  const hasData = v.overview !== null || [v.days, v.traffic, v.countries, v.videos].some(rows => (rows as unknown[]).length > 0);
  if (!['ready', 'not-applicable', 'unavailable'].includes(v.adviceStatus as string) || (hasData ? v.adviceStatus === 'not-applicable' : v.adviceStatus !== 'not-applicable') || (v.adviceStatus === 'ready' ? v.insights === null : v.insights !== null)) fail();
  if (v.insights !== null) analyticsInsights(v.insights); return v as unknown as AnalyticsResult;
}
