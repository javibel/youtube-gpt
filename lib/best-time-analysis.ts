// Declared, captured data only. This projection is neither producer admission nor
// evidence of provenance, consent, freshness or recovery authority. No effects.
type Check = () => void;
type Video = Readonly<{ id: string; channelId: string; publishedAt: string; views: number }>;
type Slot = Readonly<{ day: number; hour: number; score: number; videoCount: number }>;
export type BestTimeProjection = Readonly<{
  channelId: string; referenceAt: string; videos: readonly Video[];
}>;
export type BestTimeSearchCapture = Readonly<{
  channelId: string; referenceAt: string;
  videos: readonly Readonly<{ id: string; publishedAt: string }>[];
}>;
export type BestTimeAnalysis = Readonly<{
  channelId: string; referenceAt: string; windowDays: 180 | 365;
  videos: readonly Video[]; videoCount: number;
}> & (
  | Readonly<{ status: 'no_videos' | 'not_enough_videos' }>
  | Readonly<{ status: 'ready'; heatmap: readonly (readonly number[])[]; topSlots: readonly Slot[] }>
);
const DAY = 86_400_000;
function fail(): never { throw Error('Best time declared data unavailable'); }
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) return fail();
  return descriptor.value;
}
function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return fail();
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !==
    (value.includes('.') ? value : value.replace('Z', '.000Z'))) return fail();
  return instant;
}
function id(value: unknown, video = false): string {
  if (typeof value !== 'string' || !(video ? /^[-A-Za-z0-9_]{11}$/ : /^[-A-Za-z0-9_]{1,128}$/).test(value)) return fail();
  return value;
}
function items(value: unknown): unknown[] {
  // Explicit availability/completeness describes this captured collection only.
  if (field(value, 'available') !== true || field(value, 'complete') !== true) return fail();
  const list = field(value, 'items');
  if (!Array.isArray(list) || list.length > 50) return fail();
  return list;
}
export function captureBestTimeReference(value: unknown, check: Check) {
  check();
  const channelId = id(field(value, 'channelId'));
  const referenceAt = field(value, 'referenceAt'); timestamp(referenceAt);
  check();
  return Object.freeze({ channelId, referenceAt: referenceAt as string });
}
export function captureBestTimeSearch(value: unknown, check: Check): BestTimeSearchCapture {
  const { channelId, referenceAt } = captureBestTimeReference(value, check);
  const reference = timestamp(referenceAt);
  const search = items(field(value, 'search'));
  check();
  const selected = new Map<string, string>();
  let previous = Infinity;
  for (const item of Array.from(search)) {
    check();
    const identity = field(item, 'id'), snippet = field(item, 'snippet');
    const videoId = id(field(identity, 'videoId'), true), publishedAt = field(snippet, 'publishedAt');
    const published = timestamp(publishedAt);
    if (field(identity, 'kind') !== 'youtube#video' || field(snippet, 'channelId') !== channelId
      || selected.has(videoId) || published > reference || published > previous) return fail();
    selected.set(videoId, publishedAt as string); previous = published;
    check();
  }
  check();
  return Object.freeze({ channelId, referenceAt: referenceAt as string,
    videos: Object.freeze(Array.from(selected, ([id, publishedAt]) => Object.freeze({ id, publishedAt }))) });
}
export function captureBestTimeVideos(value: unknown, check: Check): BestTimeProjection {
  const search = captureBestTimeSearch(value, check);
  const { channelId, referenceAt } = search;
  const selected = new Map(search.videos.map(v => [v.id, v.publishedAt]));
  const details = items(field(value, 'details'));
  check();
  if (details.length !== selected.size) return fail();
  const captured = new Map<string, Video>();
  for (const item of Array.from(details)) {
    check();
    const videoId = id(field(item, 'id'), true), snippet = field(item, 'snippet');
    const publishedAt = field(snippet, 'publishedAt'), views = field(field(item, 'statistics'), 'viewCount');
    // Equivalent instants may use seconds or milliseconds; keep the detail text.
    const searchedPublication = selected.get(videoId);
    if (searchedPublication === undefined || captured.has(videoId) || field(snippet, 'channelId') !== channelId
      || timestamp(publishedAt) !== timestamp(searchedPublication)
      || typeof views !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(views)) return fail();
    const count = Number(views);
    if (!Number.isSafeInteger(count)) return fail();
    captured.set(videoId, Object.freeze({ id: videoId, channelId, publishedAt: publishedAt as string, views: count }));
    check();
  }
  const videos = Object.freeze(Array.from(selected.keys(), videoId => captured.get(videoId)!));
  check();
  return Object.freeze({ channelId, referenceAt, videos });
}
export function analyzeBestTimeVideos(value: unknown, check: Check): BestTimeAnalysis {
  const projection = captureBestTimeVideos(value, check);
  const reference = timestamp(projection.referenceAt);
  // Filter by the original publication timestamp, never by a clamped age.
  const yearly = projection.videos.filter(v => reference - timestamp(v.publishedAt) <= 365 * DAY);
  const recent = yearly.filter(v => reference - timestamp(v.publishedAt) <= 180 * DAY);
  const windowDays = recent.length >= 10 ? 180 : 365;
  const videos = Object.freeze(windowDays === 180 ? recent : yearly);
  const base = { channelId: projection.channelId, referenceAt: projection.referenceAt, windowDays, videos, videoCount: videos.length } as const;
  check();
  if (projection.videos.length === 0) return Object.freeze({ ...base, status: 'no_videos' as const });
  if (videos.length < 3) return Object.freeze({ ...base, status: 'not_enough_videos' as const });
  const sums = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const counts = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const video of videos) {
    check();
    const published = new Date(timestamp(video.publishedAt));
    const day = (published.getUTCDay() + 6) % 7, hour = published.getUTCHours();
    const age = Math.max(1, (reference - published.getTime()) / DAY);
    sums[day][hour] += video.views / Math.sqrt(age); counts[day][hour]++;
  }
  const averages = sums.map((row, d) => row.map((sum, h) => counts[d][h] ? sum / counts[d][h] : 0));
  const maximum = Math.max(...averages.flat());
  const heatmap = Object.freeze(averages.map(row => Object.freeze(row.map(score => maximum > 0 ? Math.round(score / maximum * 100) : 0))));
  const candidates: Slot[] = [];
  for (let day = 0; day < 7; day++) for (let hour = 0; hour < 24; hour++) {
    if (heatmap[day][hour] > 0) candidates.push(Object.freeze({ day, hour, score: heatmap[day][hour], videoCount: counts[day][hour] }));
  }
  candidates.sort((a, b) => b.score - a.score || a.day - b.day || a.hour - b.hour);
  const topSlots: Slot[] = [];
  for (const slot of candidates) {
    if (topSlots.length === 3) break;
    if (!topSlots.some(other => other.day === slot.day && Math.abs(other.hour - slot.hour) < 4)) topSlots.push(slot);
  }
  check();
  return Object.freeze({ ...base, status: 'ready' as const, heatmap, topSlots: Object.freeze(topSlots) });
}
