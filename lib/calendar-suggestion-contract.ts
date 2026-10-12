// This validates a proposal from the original task; it grants no execution,
// recovery, source provenance, consent or freshness authority.
export type CalendarSuggestion = Readonly<{
  title: string; date: string; hour: number; reason: string; description: string;
}>;

function canonicalDay(value: string): boolean {
  try {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000-')
      && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
  } catch { return false; }
}

export function decodeCalendarSuggestions(
  text: unknown, dates: readonly string[], check: () => void,
): readonly CalendarSuggestion[] {
  check();
  if (typeof text !== 'string' || !text || text.length > 16_384
    || dates.length !== 14 || new Set(dates).size !== 14
    || dates.some(day => !canonicalDay(day))) throw Error('Invalid suggestions');
  // A complete surrounding fence may be removed, but no proposal field is repaired.
  const fence = String.fromCharCode(96).repeat(3);
  let cleaned = text.trim();
  if (cleaned.startsWith(fence) && cleaned.endsWith(fence))
    cleaned = cleaned.slice(3, -3).replace(/^json\s*/i, '').trim();
  check();
  const value: unknown = JSON.parse(cleaned);
  check();
  if (!Array.isArray(value) || value.length < 1 || value.length > 5)
    throw Error('Invalid suggestions');
  const fields = ['title', 'date', 'hour', 'reason', 'description'];
  const suggestions = Array.from(value, item => {
    check();
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).length !== fields.length
      || Object.keys(item).some(key => !fields.includes(key))) throw Error('Invalid suggestions');
    const { title, date, hour, reason, description } = item;
    check();
    if (typeof title !== 'string' || !title.trim() || title.length > 200
      || typeof date !== 'string' || !canonicalDay(date) || !dates.includes(date)
      || typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23
      || typeof reason !== 'string' || reason.length > 300
      || typeof description !== 'string' || description.length > 500)
      throw Error('Invalid suggestions');
    const suggestion = Object.freeze({ title, date, hour, reason, description });
    check();
    return suggestion;
  });
  check();
  return Object.freeze(suggestions);
}
