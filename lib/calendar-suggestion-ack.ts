// Validate/copy the current HTTP acknowledgment. No selector or copied metadata
// establishes admission, recovery authority, operational provenance/consent/freshness.
import type { CalendarSuggestion } from './calendar-suggestion-contract';
type Check = () => void;
type Expected = Readonly<{ userId: string; lang: 'es' | 'en'; key: string; method: 'create' | 'retrieve'; baseDay: string }>;
function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid suggestions acknowledgment');
  const names = Object.keys(value);
  if (names.length !== fields.length || names.some(k => !fields.includes(k))) throw Error('Invalid suggestions acknowledgment');
  return value as Record<string, unknown>;
}
function day(value: unknown): string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
    || new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) !== value) throw Error('Invalid civil horizon');
  return value;
}
function instant(value: unknown): string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    || new Date(value).toISOString() !== (value.includes('.') ? value : value.replace('Z', '.000Z'))) throw Error('Invalid declared instant');
  return value;
}
function count(value: unknown, limit: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > limit) throw Error('Invalid selected coverage');
  return value;
}
function search(value: unknown, limit: 5 | 10, baseDay: string, check: Check) {
  check();
  const raw = object(value, ['channelId','status','selectionLimit','selectedCount','publishedAfter','publishedThrough','videos']);
  const { channelId, status, selectionLimit, selectedCount, publishedAfter, publishedThrough, videos } = raw;
  check();
  if (channelId !== null && (typeof channelId !== 'string' || !/^[-A-Za-z0-9_]{1,128}$/.test(channelId))) throw Error('Invalid selected channel');
  if (!['not_requested','unconfirmed','selected'].includes(status as string) || selectionLimit !== limit
    || ((status === 'unconfirmed' || status === 'selected') && channelId === null)) throw Error('Invalid selection status');
  const through = instant(publishedThrough);
  if (through.slice(0,10) !== baseDay) throw Error('Foreign HTTP horizon');
  const after = publishedAfter === null ? null : instant(publishedAfter);
  if (limit === 5 ? after !== new Date(Date.parse(through)-7*86400000).toISOString() : after !== null) throw Error('Invalid selection range');
  const length = count(selectedCount, limit);
  if (!Array.isArray(videos) || videos.length !== length || (status !== 'selected' && length !== 0)) throw Error('Partial selected coverage');
  const ids = new Set<string>(); let previous = Infinity;
  const copied = videos.map(v => {
    check();
    const { videoId, publishedAt } = object(v, ['videoId','publishedAt']);
    check();
    if (typeof videoId !== 'string' || !/^[-A-Za-z0-9_]{11}$/.test(videoId) || ids.has(videoId)) throw Error('Invalid selected video');
    const published = instant(publishedAt), n = Date.parse(published);
    if (n >= Date.parse(through) || (after !== null && n <= Date.parse(after)) || n > previous) throw Error('Video outside original range');
    previous = n; ids.add(videoId); check();
    return Object.freeze({ videoId, publishedAt: published });
  });
  check();
  return Object.freeze({ channelId: channelId as string | null, status: status as string, selectionLimit: limit,
    selectedCount: length, publishedAfter: after, publishedThrough: through, videos: Object.freeze(copied) });
}
export function decodeCalendarSuggestionAck(value: unknown, expected: Expected, check: Check) {
  check();
  const raw = object(value, ['suggestions','ack']), ack = object(raw.ack, ['version','userId','operationKey','method','input','horizon','context']);
  const { version, userId, operationKey, method, input, horizon, context } = ack;
  check();
  if (version !== 1 || userId !== expected.userId || operationKey !== expected.key || method !== expected.method) throw Error('Foreign original acknowledgment');
  const language = object(input, ['lang']).lang;
  check();
  if (language !== expected.lang) throw Error('Foreign language acknowledgment');
  const h = object(horizon, ['baseDay','next14']), baseDay = day(h.baseDay), selectedDays = h.next14;
  check();
  if (baseDay !== expected.baseDay || !Array.isArray(selectedDays) || selectedDays.length !== 14) throw Error('Foreign original horizon');
  const next14 = selectedDays.map((v, i) => {
    check(); const selected = day(v);
    if (selected !== new Date(Date.parse(baseDay+'T00:00:00.000Z')+(i+1)*86400000).toISOString().slice(0,10)) throw Error('Invalid original horizon');
    return selected;
  });
  const c = object(context, ['coverage','bestTimeAnalyzedAt','competitorSearch','ownSearch']);
  const coverage = object(c.coverage, ['calendarComplete','calendarCount','calendarLimit','watchlistComplete','watchlistCount','watchlistLimit','trendSelectionLimit','trendSelectionCount']);
  const { calendarComplete,calendarCount,calendarLimit,watchlistComplete,watchlistCount,watchlistLimit,trendSelectionLimit,trendSelectionCount } = coverage;
  check();
  if (calendarComplete !== true || watchlistComplete !== true || calendarLimit !== 200 || watchlistLimit !== 20 || trendSelectionLimit !== 10) throw Error('Unconfirmed SQL selection coverage');
  const copiedCoverage = Object.freeze({ calendarComplete:true, calendarCount:count(calendarCount,200), calendarLimit:200,
    watchlistComplete:true, watchlistCount:count(watchlistCount,20), watchlistLimit:20, trendSelectionLimit:10, trendSelectionCount:count(trendSelectionCount,10) });
  const bestTimeAnalyzedAt = c.bestTimeAnalyzedAt === null ? null : instant(c.bestTimeAnalyzedAt);
  const competitorSearch = search(c.competitorSearch,5,baseDay,check), ownSearch = search(c.ownSearch,10,baseDay,check);
  if (competitorSearch.publishedThrough !== ownSearch.publishedThrough) throw Error('Different original search captures');
  const values = raw.suggestions;
  check();
  if (!Array.isArray(values) || values.length < 1 || values.length > 5) throw Error('Invalid suggestions');
  const suggestions: readonly CalendarSuggestion[] = Object.freeze(values.map(value => {
    check(); const { title,date,hour,reason,description } = object(value,['title','date','hour','reason','description']);
    check();
    if (typeof title !== 'string' || !title.trim() || title.length > 200 || !next14.includes(day(date))
      || typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23
      || typeof reason !== 'string' || reason.length > 300 || typeof description !== 'string' || description.length > 500) throw Error('Invalid proposal');
    const selected = Object.freeze({ title,date:date as string,hour,reason,description }); check(); return selected;
  }));
  check();
  return Object.freeze({ suggestions, ack:Object.freeze({version:1,userId:expected.userId,operationKey:expected.key,method:expected.method,
    input:Object.freeze({lang:expected.lang}), horizon:Object.freeze({baseDay,next14:Object.freeze(next14)}),
    context:Object.freeze({coverage:copiedCoverage,bestTimeAnalyzedAt,competitorSearch,ownSearch})}) });
}
