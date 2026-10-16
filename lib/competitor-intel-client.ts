import type { DeleteOwner } from './competitor-delete-client';

export interface IntelSelection { language: 'es' | 'en'; channelIds: readonly string[] }
export interface TrendingVideo { videoId: string; title: string; thumbnail: string; channelName: string; channelId: string; publishedAt: string; views: number; likes: number; vph: number; ageHours: number }
export interface MissedOpportunity { topic: string; coveredBy: string[]; totalViews: number; suggestion: string }
export interface IntelData { userId: string; language: 'es' | 'en'; channelIds: string[]; analyzedChannelIds: string[]; unavailableChannelIds: string[];
  collectionStatus: 'complete' | 'partial'; opportunitiesStatus: 'ready' | 'not_applicable' | 'unavailable'; trending: TrendingVideo[]; newUploads: TrendingVideo[]; opportunities: MissedOpportunity[] }
export type IntelOutcome = { status: 'ready'; data: IntelData } | { status: 'rejected'; error: string } | { status: 'unconfirmed' } | { status: 'deferred' };
export interface IntelRead { owner: DeleteOwner; selection: IntelSelection; pending: boolean; original: Promise<IntelOutcome>; waiter: Promise<IntelOutcome>; outcome?: IntelOutcome; waitOutcome?: IntelOutcome }
const reads = new Map<string, IntelRead>(), owners = new Map<string, IntelRead[]>(), denied = new Set<string>();
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.every(id) && new Set(v).size === v.length;
const confirmed = (o?: IntelOutcome) => o?.status === 'rejected' || o?.status === 'deferred' || o?.status === 'ready' && o.data.opportunitiesStatus !== 'unavailable';
// Veto only: the replacement UI cannot use an old marker/result as authority
// or clear an uncertain legacy inference by changing session or selection.
export function legacyIntelBlocked(userId: string): boolean {
  const key = 'ytubviral:competitor-intel:' + JSON.stringify([userId]);
  try { return denied.has(key) || (owners.get(key) ?? []).some(r => r.pending || !confirmed(r.outcome)) || sessionStorage.getItem(key) !== null; }
  catch { return true; }
}
export const intelRetryAllowed = (read: IntelRead) => !read.pending && confirmed(read.outcome)
  && !denied.has('ytubviral:competitor-intel:' + JSON.stringify([read.owner.userId]));

function decode(value: unknown, owner: DeleteOwner, selected: IntelSelection): IntelData {
  if (!object(value) || value.userId !== owner.userId || value.language !== selected.language || !ids(value.channelIds)
    || JSON.stringify([...value.channelIds].sort()) !== JSON.stringify(selected.channelIds) || !ids(value.analyzedChannelIds)
    || value.analyzedChannelIds.length !== Math.min(10, selected.channelIds.length) || value.analyzedChannelIds.some(c => !selected.channelIds.includes(c))
    || !ids(value.unavailableChannelIds) || value.unavailableChannelIds.some(c => !(value.analyzedChannelIds as string[]).includes(c))
    || (value.analyzedChannelIds.length > 0 && value.unavailableChannelIds.length === value.analyzedChannelIds.length)
    || value.collectionStatus !== (value.unavailableChannelIds.length ? 'partial' : 'complete')
    || !Array.isArray(value.trending) || value.trending.length > 15 || !Array.isArray(value.newUploads) || value.newUploads.length > 10
    || !Array.isArray(value.opportunities) || value.opportunities.length > 5 || !['ready', 'not_applicable', 'unavailable'].includes(value.opportunitiesStatus as string)
    || (value.opportunitiesStatus !== 'ready' && value.opportunities.length > 0)
    || (value.trending.length < 3 ? value.opportunitiesStatus !== 'not_applicable' : value.opportunitiesStatus === 'not_applicable')) throw Error('Intel unconfirmed');
  const shared = new Map<string, unknown>();
  for (const [kind, videos] of [['trending', value.trending], ['new', value.newUploads]] as const) {
    const seen = new Set<string>(); let prior = kind === 'trending' ? Infinity : 0;
    for (const v of videos) {
      if (!object(v) || !id(v.videoId) || seen.has(v.videoId) || !value.analyzedChannelIds.includes(v.channelId as string)
        || value.unavailableChannelIds.includes(v.channelId as string) || typeof v.title !== 'string' || typeof v.thumbnail !== 'string' || typeof v.channelName !== 'string'
        || typeof v.publishedAt !== 'string' || !Number.isFinite(Date.parse(v.publishedAt)) || !count(v.views) || !count(v.likes)
        || !count(v.vph) || v.vph > v.views || !count(v.ageHours) || v.ageHours < 1
        || (kind === 'trending' ? v.vph > prior : v.ageHours < prior || v.ageHours > 48)) throw Error('Intel unconfirmed');
      seen.add(v.videoId); prior = kind === 'trending' ? v.vph : v.ageHours;
      const previous = shared.get(v.videoId); if (previous && JSON.stringify(previous) !== JSON.stringify(v)) throw Error('Intel unconfirmed');
      shared.set(v.videoId, v);
    }
  }
  for (const o of value.opportunities) if (!object(o) || typeof o.topic !== 'string' || !o.topic.trim() || typeof o.suggestion !== 'string' || !o.suggestion.trim()
    || !Array.isArray(o.coveredBy) || !o.coveredBy.every(n => typeof n === 'string') || typeof o.totalViews !== 'number' || !Number.isFinite(o.totalViews) || o.totalViews < 0) throw Error('Intel unconfirmed');
  return structuredClone(value) as unknown as IntelData;
}

// Only these original live closures/results can be observed. Storage presence
// denies a new inference after module loss; its contents never supply authority.
export function beginCompetitorIntel(owner: DeleteOwner, selection: IntelSelection, retry?: IntelRead): IntelRead {
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), selected = Object.freeze({ language: selection.language, channelIds: Object.freeze([...selection.channelIds].sort()) });
  // One user cannot replace an uncertain task by changing email or selection.
  const ownerKey = 'ytubviral:competitor-intel:' + JSON.stringify([own.userId]), key = JSON.stringify([ownerKey, own.email, selected.language, selected.channelIds]);
  const existing = reads.get(key);
  if (existing && (!retry || existing !== retry || !intelRetryAllowed(retry))) return existing;
  const read: IntelRead = { owner: own, selection: selected, pending: true, original: Promise.resolve({ status: 'unconfirmed' }), waiter: Promise.resolve({ status: 'unconfirmed' }) };
  reads.set(key, read);
  const prior = (owners.get(ownerKey) ?? []).find(r => r !== retry && (r.pending || !confirmed(r.outcome)));
  if (prior) {
    // A different language/selection cannot replace an in-flight or uncertain
    // task. Once the actual original finishes safely, only an explicit action
    // may start the selected analysis; never replay its data in this scope.
    read.original = prior.original.then(o => { read.pending = false; return read.outcome = confirmed(o) ? { status: 'deferred' } : { status: 'unconfirmed' }; });
    read.waiter = prior.waiter.then(() => read.waitOutcome = read.outcome ?? { status: 'unconfirmed' });
    return read;
  }
  owners.set(ownerKey, [...(owners.get(ownerKey) ?? []).filter(r => r !== retry && (r.pending || !confirmed(r.outcome))), read]);
  const deadline = performance.now() + 60_000;
  read.original = Promise.resolve().then(async (): Promise<IntelOutcome> => {
    let outcome: IntelOutcome = { status: 'unconfirmed' };
    try {
      if (!own.userId || !['es', 'en'].includes(selected.language) || !ids(selected.channelIds) || !selected.channelIds.length || denied.has(ownerKey) || performance.now() >= deadline) return outcome;
      if (sessionStorage.getItem(ownerKey) !== null) return outcome;
      sessionStorage.setItem(ownerKey, 'pending');
      const operationKey = crypto.randomUUID();
      const response = await fetch(`/api/youtube/competitor-intel?lang=${selected.language}&channelIds=${encodeURIComponent(selected.channelIds.join(','))}`, { cache: 'no-store', headers: { 'Idempotency-Key': operationKey } });
      const body: unknown = await response.json();
      if (response.ok && response.status === 200) outcome = { status: 'ready', data: decode(body, own, selected) };
      else if (object(body) && [[401, 'unauthorized'], [403, 'pro_required'], [503, 'no_api_key'], [400, 'invalid_selection'], [409, 'selection_changed']]
        .some(([status, error]) => response.status === status && body.error === error)) outcome = { status: 'rejected', error: body.error as string };
      if (confirmed(outcome)) { try { sessionStorage.removeItem(ownerKey); } catch { denied.add(ownerKey); if (outcome.status === 'rejected') outcome = { status: 'unconfirmed' }; } }
    } catch { denied.add(ownerKey); }
    return outcome;
  }).then(outcome => { read.pending = false; read.outcome = outcome; return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  read.waiter = (async (): Promise<IntelOutcome> => {
    try {
      const result = await Promise.race([read.original, new Promise<IntelOutcome>(resolve => { timer = setTimeout(() => resolve({ status: 'unconfirmed' }), Math.max(0, deadline - performance.now())); })]);
      return read.waitOutcome = performance.now() >= deadline ? { status: 'unconfirmed' } : result;
    } finally { clearTimeout(timer); }
  })();
  return read;
}
