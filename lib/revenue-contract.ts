import { retentionObject, retentionCommand, retentionChannelId, retentionVideoId } from '@/lib/retention-contract';
export { retentionObject as revenueObject, retentionCommand as revenueCommand, retentionChannelId as revenueChannelId, retentionVideoId as revenueVideoId } from '@/lib/retention-contract';
export type RevenueInput = Readonly<{ lang: 'es' | 'en'; currency: 'USD' | 'EUR'; scenarioRpm?: number }>;
export type TrafficRow = { views: number; watchMinutes: number };
export type RevenueResult = {
  channel: { id: string; name: string };
  traffic: TrafficRow & { countries: (TrafficRow & { country: string })[]; videos: (TrafficRow & { videoId: string; title: string })[]; days: (TrafficRow & { date: string })[] };
  revenue: { status: 'reported-estimate' | 'unavailable' | 'no-rows'; currency: 'USD' | 'EUR'; amount: number | null; days: { date: string; amount: number }[] };
  scenario: { rpm: number; amount: number } | null;
  insights: { tips: string[]; limitations: string[] } | null;
  revenueAnalysis: { commandRef: string; userId: string; email: string; sessionRef: string; lang: 'es' | 'en'; currency: 'USD' | 'EUR'; scenarioRpm: number | null;
    channelId: string; requestedStartDate: string; requestedEndDate: string; coverage: 'not-reported'; separateReads: true; countryLimit: 20; videoLimit: 15; asOf: number; expiresAt: number };
};
export function revenueInput(value: unknown): RevenueInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_input');
  const body = retentionObject(value);
  if (Object.keys(body).some(k => !['lang', 'currency', 'scenarioRpm'].includes(k)) || !['es', 'en'].includes(body.lang as string) || !['USD', 'EUR'].includes(body.currency as string)
    || Object.hasOwn(body, 'scenarioRpm') && (typeof body.scenarioRpm !== 'number' || !Number.isFinite(body.scenarioRpm) || body.scenarioRpm < 0 || body.scenarioRpm > 1000)) throw Error('invalid_input');
  return Object.freeze({ lang: body.lang as 'es' | 'en', currency: body.currency as 'USD' | 'EUR', ...(Object.hasOwn(body, 'scenarioRpm') ? { scenarioRpm: body.scenarioRpm as number } : {}) });
}
export function revenueTable(value: unknown, columns: [string, 'DIMENSION' | 'METRIC', 'STRING' | 'INTEGER' | 'FLOAT'][], limit: number): unknown[][] {
  const table = retentionObject(value);
  if (table.kind !== 'youtubeAnalytics#resultTable' || !Array.isArray(table.columnHeaders) || table.columnHeaders.length !== columns.length
    || table.columnHeaders.some((c, i) => { const h = retentionObject(c); return h.name !== columns[i][0] || h.columnType !== columns[i][1] || h.dataType !== columns[i][2]; })
    || Object.hasOwn(table, 'rows') && !Array.isArray(table.rows)) throw Error('revenue_unconfirmed');
  const rows = table.rows ?? [];
  if (!Array.isArray(rows) || rows.length > limit || rows.some(r => !Array.isArray(r) || r.length !== columns.length)) throw Error('revenue_unconfirmed');
  return rows as unknown[][];
}
export function trafficValues(views: unknown, watchMinutes: unknown): TrafficRow {
  if (typeof views !== 'number' || !Number.isSafeInteger(views) || views < 0 || typeof watchMinutes !== 'number' || !Number.isSafeInteger(watchMinutes) || watchMinutes < 0) throw Error('revenue_unconfirmed');
  return { views, watchMinutes };
}
export function monetaryValue(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER / 100) throw Error('revenue_unconfirmed'); return v;
}
export function revenueDay(v: unknown, start: string, end: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v + 'T00:00:00Z'))
    || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v || v < start || v > end) throw Error('revenue_unconfirmed'); return v;
}
export function revenueInsights(value: unknown): NonNullable<RevenueResult['insights']> {
  const v = retentionObject(value);
  if (Object.keys(v).sort().join(',') !== 'limitations,tips') throw Error('revenue_unconfirmed');
  for (const key of ['tips', 'limitations']) if (!Array.isArray(v[key]) || v[key].length < 1 || v[key].length > 4 || v[key].some((s: unknown) => typeof s !== 'string' || !s.trim() || s.length > 1000)) throw Error('revenue_unconfirmed');
  return v as NonNullable<RevenueResult['insights']>;
}
export function revenueResult(value: unknown): RevenueResult {
  const v = retentionObject(value), a = retentionObject(v.revenueAnalysis), channel = retentionObject(v.channel), traffic = retentionObject(v.traffic), revenue = retentionObject(v.revenue);
  if (Object.keys(v).sort().join(',') !== 'channel,insights,revenue,revenueAnalysis,scenario,traffic' || !retentionCommand(a.commandRef) || !retentionCommand(a.sessionRef)
    || Object.keys(channel).sort().join(',') !== 'id,name' || Object.keys(traffic).sort().join(',') !== 'countries,days,videos,views,watchMinutes'
    || Object.keys(revenue).sort().join(',') !== 'amount,currency,days,status'
    || !retentionChannelId(a.channelId) || channel.id !== a.channelId || typeof channel.name !== 'string' || !channel.name.trim() || channel.name.length > 500
    || a.coverage !== 'not-reported' || a.separateReads !== true || a.countryLimit !== 20 || a.videoLimit !== 15 || !['USD', 'EUR'].includes(a.currency as string)
    || Object.keys(a).sort().join(',') !== 'asOf,channelId,commandRef,countryLimit,coverage,currency,email,expiresAt,lang,requestedEndDate,requestedStartDate,scenarioRpm,separateReads,sessionRef,userId,videoLimit') throw Error('revenue_unconfirmed');
  trafficValues(traffic.views, traffic.watchMinutes);
  const seen = new Set<string>();
  for (const [key, limit, field] of [['countries', 20, 'country'], ['videos', 15, 'videoId'], ['days', 28, 'date']] as const) {
    const rows = traffic[key]; if (!Array.isArray(rows) || rows.length > limit) throw Error('revenue_unconfirmed');
    let prior = ''; seen.clear();
    for (const entry of rows) {
      const row = retentionObject(entry), id = row[field]; trafficValues(row.views, row.watchMinutes);
      if (Object.keys(row).sort().join(',') !== (field === 'country' ? 'country,views,watchMinutes' : field === 'videoId' ? 'title,videoId,views,watchMinutes' : 'date,views,watchMinutes')) throw Error('revenue_unconfirmed');
      if (typeof id !== 'string' || seen.has(id)) throw Error('revenue_unconfirmed'); seen.add(id);
      if (field === 'country' && !/^(?:[A-Z]{2}|ZZ)$/.test(id) || field === 'videoId' && (!retentionVideoId(id) || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 500)) throw Error('revenue_unconfirmed');
      if (field === 'date') { revenueDay(id, a.requestedStartDate as string, a.requestedEndDate as string); if (id <= prior) throw Error('revenue_unconfirmed'); prior = id; }
    }
  }
  if (revenue.currency !== a.currency || !['reported-estimate', 'unavailable', 'no-rows'].includes(revenue.status as string) || !Array.isArray(revenue.days) || revenue.days.length > 28) throw Error('revenue_unconfirmed');
  let prior = '', sum = 0;
  for (const entry of revenue.days) { const row = retentionObject(entry), day = revenueDay(row.date, a.requestedStartDate as string, a.requestedEndDate as string); if (Object.keys(row).sort().join(',') !== 'amount,date' || day <= prior) throw Error('revenue_unconfirmed'); prior = day; sum += monetaryValue(row.amount); }
  if (revenue.status === 'reported-estimate' ? revenue.days.length === 0 || monetaryValue(revenue.amount) !== sum : revenue.amount !== null || revenue.days.length > 0) throw Error('revenue_unconfirmed');
  if (a.scenarioRpm === null) { if (v.scenario !== null) throw Error('revenue_unconfirmed'); }
  else { const input = revenueInput({ lang: a.lang, currency: a.currency, scenarioRpm: a.scenarioRpm }), scenario = retentionObject(v.scenario); if (Object.keys(scenario).sort().join(',') !== 'amount,rpm' || scenario.rpm !== input.scenarioRpm || scenario.amount !== (traffic.views as number) / 1000 * input.scenarioRpm!) throw Error('revenue_unconfirmed'); monetaryValue(scenario.amount); }
  if (v.insights !== null) revenueInsights(v.insights);
  return v as unknown as RevenueResult;
}
