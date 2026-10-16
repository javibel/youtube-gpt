// A projection of stored observations, never authority to publish or resume.
// Sequential lifetime-view differences do not identify a title's causal effect.
type ObservationInput = {
  initialViews: unknown; switchViews: unknown; endViews: unknown;
  startedAt: unknown; switchedAt: unknown; completedAt: unknown;
};
export type AbObservation = Readonly<{
  viewsA: number; viewsB: number;
  start: string; switch: string; end: string;
  hoursA: number; hoursB: number;
  leadingWindow: 'A' | 'B' | 'tie';
  // Existing automation chooses the larger raw delta; A is the stable tie policy.
  // This is a publication policy, not a statistical winner or recommendation.
  selectedVariant: 'A' | 'B';
}>;
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
}
function timestamp(value: unknown): number | null {
  if (typeof value === 'string') {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
  }
  // Read the actual Date internal slot, including SQL Dates from another realm.
  // Do not invoke an object's replaceable getTime/valueOf/toJSON methods.
  try { const time = Date.prototype.getTime.call(value); return Number.isFinite(time) ? time : null; }
  catch { return null; }
}
export function observeAbWindows(input: ObservationInput): AbObservation | null {
  const { initialViews, switchViews, endViews } = input;
  if (!count(initialViews) || !count(switchViews) || !count(endViews)
    || switchViews < initialViews || endViews < switchViews) return null;
  const start = timestamp(input.startedAt), middle = timestamp(input.switchedAt), end = timestamp(input.completedAt);
  if (start === null || middle === null || end === null || middle <= start || end <= middle) return null;
  const viewsA = switchViews - initialViews, viewsB = endViews - switchViews;
  const leadingWindow = viewsA > viewsB ? 'A' : viewsB > viewsA ? 'B' : 'tie';
  return Object.freeze({ viewsA, viewsB, start: new Date(start).toISOString(), switch: new Date(middle).toISOString(),
    end: new Date(end).toISOString(), hoursA: (middle - start) / 3_600_000, hoursB: (end - middle) / 3_600_000,
    leadingWindow, selectedVariant: leadingWindow === 'B' ? 'B' : 'A' });
}
