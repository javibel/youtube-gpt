import { retentionObject, retentionCommand, retentionChannelId } from '@/lib/retention-contract';
export { retentionObject as subscribersObject, retentionCommand as subscribersCommand, retentionChannelId as subscribersChannelId } from '@/lib/retention-contract';
export type SubscribersInput = Readonly<{ lang: 'es' | 'en' }>;
export const ageGroups = ['age13-17', 'age18-24', 'age25-34', 'age35-44', 'age45-54', 'age55-64', 'age65-'];
export const genders = ['male', 'female', 'user_specified'];
export type SubscribersResult = {
  channel: { id: string; name: string };
  demographics: { status: 'reported' | 'no-rows' | 'unavailable'; population: 'logged-in-viewers'; rows: { age: string; gender: string; percentage: number }[] };
  countries: { country: string; views: number; watchMinutes: number; gained: number }[];
  traffic: { source: string; views: number; watchMinutes: number }[];
  subscriptions: { totals: { gained: number; lost: number; net: number } | null; days: { date: string; gained: number; lost: number }[] };
  insights: { tips: string[]; limitations: string[] } | null;
  subscribersAnalysis: { commandRef: string; userId: string; email: string; sessionRef: string; lang: 'es' | 'en'; channelId: string;
    requestedStartDate: string; requestedEndDate: string; coverage: 'not-reported'; separateReads: true; countryLimit: 15; trafficLimit: 25; asOf: number; expiresAt: number };
};
const fail = (): never => { throw Error('subscribers_unconfirmed'); };
export function subscribersInput(value: unknown): SubscribersInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_input');
  const v = retentionObject(value);
  if (!value || Array.isArray(value) || Object.keys(v).join(',') !== 'lang' || !['es', 'en'].includes(v.lang as string)) throw Error('invalid_input');
  return Object.freeze({ lang: v.lang as 'es' | 'en' });
}
export function subscribersCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(); return value as number;
}
export function subscribersDay(value: unknown, start: string, end: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value || value < start || value > end) fail(); return value as string;
}
export function subscribersTable(value: unknown, columns: [string, 'DIMENSION' | 'METRIC', 'STRING' | 'INTEGER' | 'FLOAT'][], limit: number): unknown[][] {
  const v = retentionObject(value);
  if (v.kind !== 'youtubeAnalytics#resultTable' || !Array.isArray(v.columnHeaders) || v.columnHeaders.length !== columns.length
    || v.columnHeaders.some((c, i) => { const h = retentionObject(c); return h.name !== columns[i][0] || h.columnType !== columns[i][1] || h.dataType !== columns[i][2]; })
    || Object.hasOwn(v, 'rows') && !Array.isArray(v.rows)) fail();
  const rows = v.rows ?? [];
  if (!Array.isArray(rows) || rows.length > limit || rows.some(r => !Array.isArray(r) || r.length !== columns.length)) fail(); return rows as unknown[][];
}
export function subscribersInsights(value: unknown): NonNullable<SubscribersResult['insights']> {
  const v = retentionObject(value);
  if (Object.keys(v).sort().join(',') !== 'limitations,tips') fail();
  for (const key of ['tips', 'limitations']) if (!Array.isArray(v[key]) || v[key].length < 1 || v[key].length > 4 || v[key].some((s: unknown) => typeof s !== 'string' || !s.trim() || s.length > 1000)) fail();
  return v as NonNullable<SubscribersResult['insights']>;
}
export function subscribersResult(value: unknown): SubscribersResult {
  const v = retentionObject(value), a = retentionObject(v.subscribersAnalysis), channel = retentionObject(v.channel), demo = retentionObject(v.demographics), subs = retentionObject(v.subscriptions);
  if (Object.keys(v).sort().join(',') !== 'channel,countries,demographics,insights,subscribersAnalysis,subscriptions,traffic'
    || Object.keys(a).sort().join(',') !== 'asOf,channelId,commandRef,countryLimit,coverage,email,expiresAt,lang,requestedEndDate,requestedStartDate,separateReads,sessionRef,trafficLimit,userId'
    || !retentionCommand(a.commandRef) || !retentionCommand(a.sessionRef) || !retentionChannelId(a.channelId) || !['es', 'en'].includes(a.lang as string)
    || typeof a.userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(a.userId) || typeof a.email !== 'string' || a.email.length > 254
    || !Number.isSafeInteger(a.asOf) || !Number.isSafeInteger(a.expiresAt) || (a.asOf as number) < 0 || (a.expiresAt as number) <= (a.asOf as number) || (a.expiresAt as number) - (a.asOf as number) > 55000
    || a.requestedStartDate !== new Date((a.asOf as number) - 91 * 86400000).toISOString().slice(0, 10) || a.requestedEndDate !== new Date((a.asOf as number) - 2 * 86400000).toISOString().slice(0, 10)
    || a.coverage !== 'not-reported' || a.separateReads !== true || a.countryLimit !== 15 || a.trafficLimit !== 25
    || Object.keys(channel).sort().join(',') !== 'id,name' || channel.id !== a.channelId || typeof channel.name !== 'string' || !channel.name.trim() || channel.name.length > 500) fail();
  if (Object.keys(demo).sort().join(',') !== 'population,rows,status' || demo.population !== 'logged-in-viewers' || !['reported', 'no-rows', 'unavailable'].includes(demo.status as string)
    || !Array.isArray(demo.rows) || demo.rows.length > 21 || (demo.status === 'reported' ? demo.rows.length === 0 : demo.rows.length !== 0)) fail();
  const seen = new Set<string>(); let percentage = 0;
  for (const entry of demo.rows as unknown[]) {
    const row = retentionObject(entry), key = row.age + ':' + row.gender;
    if (Object.keys(row).sort().join(',') !== 'age,gender,percentage' || !ageGroups.includes(row.age as string) || !genders.includes(row.gender as string)
      || typeof row.percentage !== 'number' || !Number.isFinite(row.percentage) || row.percentage < 0 || row.percentage > 100 || seen.has(key)) fail();
    percentage += row.percentage as number; seen.add(key);
  }
  // Small per-cell rounding is permitted, never normalization or missing-group fill.
  if (percentage > 100.21) fail();
  for (const [field, limit, idField, fields] of [['countries', 15, 'country', 'country,gained,views,watchMinutes'], ['traffic', 25, 'source', 'source,views,watchMinutes']] as const) {
    const rows = v[field]; if (!Array.isArray(rows) || rows.length > limit) fail(); seen.clear();
    for (const entry of rows as unknown[]) {
      const row = retentionObject(entry), id = row[idField];
      if (Object.keys(row).sort().join(',') !== fields || typeof id !== 'string' || seen.has(id)
        || (idField === 'country' ? !/^[A-Z]{2}$/.test(id) : !/^[A-Z][A-Z0-9_]{0,63}$/.test(id))) fail();
      seen.add(id as string); subscribersCount(row.views); subscribersCount(row.watchMinutes); if (field === 'countries') subscribersCount(row.gained);
    }
  }
  if (Object.keys(subs).sort().join(',') !== 'days,totals' || !Array.isArray(subs.days) || subs.days.length > 90) fail();
  if (subs.totals !== null) { const total = retentionObject(subs.totals); if (Object.keys(total).sort().join(',') !== 'gained,lost,net' || total.net !== subscribersCount(total.gained) - subscribersCount(total.lost)) fail(); }
  let prior = '';
  for (const entry of subs.days as unknown[]) {
    const row = retentionObject(entry), day = subscribersDay(row.date, a.requestedStartDate as string, a.requestedEndDate as string);
    if (Object.keys(row).sort().join(',') !== 'date,gained,lost' || day <= prior) fail(); prior = day; subscribersCount(row.gained); subscribersCount(row.lost);
  }
  if (v.insights !== null) subscribersInsights(v.insights);
  return v as unknown as SubscribersResult;
}
