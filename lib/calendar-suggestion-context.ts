// A copy of selected own SQL facts. This is not provenance, freshness,
// consent, an admission receipt or authority to recover a lost producer.
const fail = () => { throw Error('Suggestions context unconfirmed'); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
};
const text = (value: unknown, max = 500): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return fail();
  return value;
};
const instant = (value: unknown): string => Date.prototype.toISOString.call(value);
const day = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return fail();
  try { if (new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) !== value) return fail(); }
  catch { return fail(); }
  return value;
};
const own = (row: Record<string, unknown>, owner: string) => {
  if (row.userId !== owner) fail();
};
const channel = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[-A-Za-z0-9_]{1,128}$/.test(value)) return fail();
  return value;
};
function list<T extends { id: string }>(value: unknown, max: number, check: () => void,
  capture: (row: Record<string, unknown>) => T): readonly Readonly<T>[] {
  check();
  if (!Array.isArray(value) || value.length > max) return fail();
  const ids = new Set<string>();
  const rows = Array.from(value, item => {
    check();
    const row = capture(record(item));
    if (ids.has(row.id)) return fail();
    ids.add(row.id); check();
    return Object.freeze(row);
  });
  check();
  return Object.freeze(rows);
}
export function captureSuggestionTimes(value: unknown, owner: string, check: () => void) {
  check();
  if (value === null) return null;
  const row = record(value); own(row, owner);
  const slots = row.topSlots, analyzedAt = instant(row.analyzedAt);
  if (!Array.isArray(slots) || slots.length > 168) return fail();
  const positions = new Set<string>();
  const topSlots = Array.from(slots, item => {
    check(); const { day, hour, score } = record(item);
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6
      || typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23
      || typeof score !== 'number' || !Number.isFinite(score) || score < 0) return fail();
    const position = day + ':' + hour;
    if (positions.has(position)) return fail();
    positions.add(position); check();
    return Object.freeze({ day, hour, score });
  });
  check();
  return Object.freeze({ analyzedAt, topSlots: Object.freeze(topSlots) });
}
export function captureSuggestionTrends(value: unknown, owner: string, check: () => void) {
  const rows = list(value, 10, check, row => {
    own(row, owner);
    const { id, title, category, relevance, createdAt } = row;
    if (typeof relevance !== 'number' || !Number.isInteger(relevance) || relevance < 60 || relevance > 100) return fail();
    return { id: text(id, 128), title: text(title), category: text(category, 200), relevance, createdAt: instant(createdAt) };
  });
  for (let i = 1; i < rows.length; i++) {
    check(); const a = rows[i - 1], b = rows[i];
    if (a.createdAt < b.createdAt || (a.createdAt === b.createdAt && a.id > b.id)) fail();
  }
  check(); return rows;
}
export function captureSuggestionCompetitors(value: unknown, owner: string, check: () => void) {
  const channels = new Set<string>();
  const rows = list(value, 20, check, row => {
    own(row, owner);
    const { id, channelId, channelName, addedAt } = row;
    const selectedChannel = channel(channelId);
    if (channels.has(selectedChannel)) return fail();
    channels.add(selectedChannel);
    return { id: text(id, 128), channelId: selectedChannel, channelName: text(channelName), addedAt: instant(addedAt) };
  });
  for (let i = 1; i < rows.length; i++) {
    check(); const a = rows[i - 1], b = rows[i];
    if (a.addedAt > b.addedAt || (a.addedAt === b.addedAt && a.id > b.id)) fail();
  }
  check(); return rows;
}
export function captureSuggestionCalendar(value: unknown, owner: string, from: string, check: () => void) {
  const rows = list(value, 200, check, row => {
    own(row, owner);
    const { id, title, date, status, createdAt } = row;
    const selectedDate = day(date);
    if (selectedDate < from || typeof status !== 'string'
      || !['idea', 'draft', 'scheduled', 'published'].includes(status)) return fail();
    return { id: text(id, 128), title: text(title, 200), date: selectedDate, status, createdAt: instant(createdAt) };
  });
  for (let i = 1; i < rows.length; i++) {
    check(); const a = rows[i - 1], b = rows[i];
    if (a.date > b.date || (a.date === b.date && (a.createdAt > b.createdAt
      || (a.createdAt === b.createdAt && a.id > b.id)))) fail();
  }
  check(); return rows;
}
export function captureSuggestionChannel(value: unknown, owner: string, check: () => void) {
  check();
  if (value === null) return null;
  const row = record(value); own(row, owner);
  const { channelId, channelName } = row;
  const selected = Object.freeze({ channelId: channelId === null ? null : channel(channelId),
    channelName: channelName === null ? null : text(channelName) });
  check(); return selected;
}
