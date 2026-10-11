export type CalendarReadOwner = Readonly<{ id: string; email: string }>;
export type CalendarReadRange = Readonly<{ from: string; to: string }>;
export type CalendarReadEntry = Readonly<{ id: string; userId: string; title: string; description: string | null;
  date: string; status: string; color: string | null; createdAt: string; updatedAt: string }>;
export type CalendarReadReceipt = Readonly<{ owner: CalendarReadOwner; range: CalendarReadRange;
  coverage: Readonly<{ complete: true; count: number; limit: 200 }>; entries: readonly CalendarReadEntry[] }>;
const invalid = () => { throw Error('Calendar read unconfirmed'); };
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) return invalid();
  return value as Record<string, unknown>;
}
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  try { return new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value; } catch { return false; }
}
function instant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}
export function calendarMonthRange(year: number, month: number): CalendarReadRange | null {
  if (!Number.isSafeInteger(year) || year < 1 || year > 9999 || !Number.isSafeInteger(month) || month < 0 || month > 11) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
  const prefix = String(year).padStart(4, '0') + '-' + String(month + 1).padStart(2, '0');
  return Object.freeze({ from: prefix + '-01', to: prefix + '-' + String(days) });
}
// This validates one original read. It grants no admission, write or recovery capability.
export function decodeCalendarRead(value: unknown, owner: CalendarReadOwner, range: CalendarReadRange): CalendarReadReceipt {
  if (typeof owner.id !== 'string' || !owner.id || typeof owner.email !== 'string' || !owner.email || !date(range.from) || !date(range.to) || range.from > range.to) return invalid();
  const body = record(value, ['owner', 'range', 'coverage', 'entries']);
  const selectedOwner = record(body.owner, ['id', 'email']), selectedRange = record(body.range, ['from', 'to']);
  if (selectedOwner.id !== owner.id || selectedOwner.email !== owner.email
    || selectedRange.from !== range.from || selectedRange.to !== range.to) return invalid();
  const coverage = record(body.coverage, ['complete', 'count', 'limit']);
  if (coverage.complete !== true || coverage.limit !== 200 || !Number.isSafeInteger(coverage.count)
    || (coverage.count as number) < 0 || !Array.isArray(body.entries) || body.entries.length > 200
    || coverage.count !== body.entries.length) return invalid();
  const ids = new Set<string>();
  const entries = Array.from(body.entries, value => {
    const e = record(value, ['id', 'userId', 'title', 'description', 'date', 'status', 'color', 'createdAt', 'updatedAt']);
    if (typeof e.id !== 'string' || !e.id || ids.has(e.id) || e.userId !== owner.id
      || typeof e.title !== 'string' || !e.title.trim() || e.title.length > 200
      || (e.description !== null && typeof e.description !== 'string')
      || !date(e.date) || e.date < range.from || e.date > range.to
      || typeof e.status !== 'string' || !['idea', 'draft', 'scheduled', 'published'].includes(e.status)
      || (e.color !== null && typeof e.color !== 'string') || !instant(e.createdAt) || !instant(e.updatedAt)) return invalid();
    ids.add(e.id);
    return Object.freeze({ id: e.id, userId: owner.id, title: e.title, description: e.description,
      date: e.date, status: e.status, color: e.color, createdAt: e.createdAt, updatedAt: e.updatedAt }) as CalendarReadEntry;
  });
  for (let i = 1; i < entries.length; i++) {
    const a = entries[i - 1], b = entries[i];
    if (a.date > b.date || (a.date === b.date && (a.createdAt > b.createdAt
      || (a.createdAt === b.createdAt && a.id > b.id)))) return invalid();
  }
  return Object.freeze({ owner: Object.freeze({ id: owner.id, email: owner.email }),
    range: Object.freeze({ from: range.from, to: range.to }),
    coverage: Object.freeze({ complete: true, count: entries.length, limit: 200 }), entries: Object.freeze(entries) });
}
