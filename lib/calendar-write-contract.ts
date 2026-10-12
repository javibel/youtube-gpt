import type { CalendarReadEntry, CalendarReadOwner } from './calendar-read-contract';
export type CalendarWriteFields = Readonly<{ title: string; description: string | null; date: string; status: string; color: string | null }>;
export type CalendarWriteInput = Readonly<{ method: 'POST' | 'PUT' | 'DELETE'; id: string | null; fields: CalendarWriteFields | null }>;
const fail = (): never => { throw Error('Calendar write unconfirmed'); };
const statuses = ['idea', 'draft', 'scheduled', 'published'];
function record(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) return fail();
  const source = value as Record<string, unknown>;
  // Copy each property once before validation or a delayed dependency can change it.
  return Object.freeze(Object.fromEntries(keys.map(key => [key, source[key]])));
}
export function calendarWriteDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  try { return new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value; } catch { return false; }
}
function fields(value: unknown): CalendarWriteFields {
  const v = record(value, ['title', 'description', 'date', 'status', 'color']);
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.length > 200
    || (v.description !== null && typeof v.description !== 'string') || !calendarWriteDay(v.date)
    || typeof v.status !== 'string' || !statuses.includes(v.status)
    || (v.color !== null && typeof v.color !== 'string')) return fail();
  return Object.freeze({ title: v.title, description: v.description, date: v.date, status: v.status, color: v.color }) as CalendarWriteFields;
}
export function validCalendarWriteSnapshot(value: unknown): boolean {
  try { fields(value); return true; } catch { return false; }
}
export function parseCalendarCreation(body: string): CalendarWriteInput {
  if (typeof body !== 'string' || body.length > 65_536) return fail();
  const v = record(JSON.parse(body), ['title', 'description', 'date', 'status']);
  if (typeof v.title !== 'string' || v.title !== v.title.trim() || typeof v.description !== 'string'
    || v.description !== v.description.trim()) return fail();
  return Object.freeze({ method: 'POST', id: null, fields: fields({ ...v, description: v.description || null, color: null }) });
}
export function parseCalendarMutation(body: string, method: 'PUT' | 'DELETE', id: string): CalendarWriteInput {
  if (!['PUT', 'DELETE'].includes(method) || typeof body !== 'string' || body.length > 65_536 || typeof id !== 'string' || !id || id.length > 128) return fail();
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail();
  const keys = Object.keys(parsed), b = record(parsed, keys), expected = fields(b.expected);
  if (method === 'DELETE') {
    if (keys.length !== 1 || keys[0] !== 'expected') return fail();
    return Object.freeze({ method, id, fields: null });
  }
  if (b.id !== id || keys.length < 3 || keys.some(key => !['id', 'expected', 'title', 'description', 'date', 'status', 'color'].includes(key))) return fail();
  const patch: Record<string, unknown> = {};
  for (const key of ['title', 'description', 'date', 'status', 'color']) {
    if (!Object.hasOwn(b, key)) continue;
    const value = b[key];
    if (key === 'title') { if (typeof value !== 'string') return fail(); patch.title = value.trim(); }
    else if (key === 'description' || key === 'color') { if (value !== null && typeof value !== 'string') return fail(); patch[key] = (value as string | null)?.trim() || null; }
    else patch[key] = value;
  }
  return Object.freeze({ method, id, fields: fields({ ...expected, ...patch }) });
}
function instant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}
// Data validation for this captured HTTP result only. No admission, provenance,
// operational freshness or capability to recover an executor is inferred.
export function decodeCalendarWrite(value: unknown, owner: CalendarReadOwner, input: CalendarWriteInput) {
  if (!['POST', 'PUT', 'DELETE'].includes(input.method) || typeof owner.id !== 'string' || !owner.id || typeof owner.email !== 'string' || !owner.email) return fail();
  if (input.method === 'DELETE') {
    const result = record(value, ['id', 'ok', 'originalMutation']);
    if (result.id !== input.id || result.ok !== true || result.originalMutation !== true) return fail();
    return Object.freeze({ id: input.id, ok: true, originalMutation: true });
  }
  const result = record(value, input.method === 'POST' ? ['entry'] : ['entry', 'originalMutation']);
  if (input.method === 'PUT' && result.originalMutation !== true) return fail();
  const e = record(result.entry, ['id', 'userId', 'title', 'description', 'date', 'status', 'color', 'createdAt', 'updatedAt']);
  const selected = fields({ title: e.title, description: e.description, date: e.date, status: e.status, color: e.color });
  if (typeof e.id !== 'string' || !e.id || e.id.length > 128 || e.userId !== owner.id
    || (input.id !== null && e.id !== input.id) || !instant(e.createdAt) || !instant(e.updatedAt)
    || !input.fields || Object.entries(input.fields).some(([key, v]) => selected[key as keyof CalendarWriteFields] !== v)) return fail();
  const entry = Object.freeze({ id: e.id, userId: owner.id, ...selected, createdAt: e.createdAt, updatedAt: e.updatedAt }) as CalendarReadEntry;
  return Object.freeze({ entry, ...(input.method === 'PUT' ? { originalMutation: true } : {}) });
}
