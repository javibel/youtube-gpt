import { getAccessToken } from '@/lib/youtube-auth';
import { captureBestTimeReference, captureBestTimeSearch, captureBestTimeVideos } from './best-time-analysis';
import type { BestTimeSources, BestTimeSelection } from './best-time-source-reader';

type Check = () => void;
export type BestTimeYouTubeTransport = Readonly<{ token: typeof getAccessToken; fetch: typeof fetch }>;
function fail(): never { throw Error('Best time YouTube source unavailable'); }
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) return fail();
  return descriptor.value;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[-A-Za-z0-9_]{1,128}$/.test(value)) return fail();
  return value;
}
function page(value: unknown, kind: string, check: Check) {
  check();
  if (field(value, 'kind') !== kind || Object.hasOwn(value as object, 'error')) return fail();
  const items = field(value, 'items'), info = field(value, 'pageInfo');
  if (!Array.isArray(items) || items.length > 50 || field(info, 'resultsPerPage') !== items.length) return fail();
  const nextDescriptor = Object.getOwnPropertyDescriptor(value, 'nextPageToken');
  const next = nextDescriptor?.value;
  if (nextDescriptor && (!Object.hasOwn(nextDescriptor, 'value') || typeof next !== 'string' || !next || next.length > 2048)) return fail();
  check();
  return { items, next: next as string | undefined };
}

// Trusted server composition only. No request JSON/configuration binds this
// adapter. Its callbacks run inside the freshly admitted coordinator and retain
// that original's check; these copied facts never establish operational consent
// or freshness. No exported result/token permits repeating a completed read.
export function createBestTimeYouTubeSources(referenceAt: string, signal: AbortSignal, transport?: BestTimeYouTubeTransport): BestTimeSources & Readonly<{ referenceAt: string }> {
  let phase: 'fresh' | 'reading' | 'selected' | 'finished' = 'fresh';
  let selected: BestTimeSelection | undefined, token: string | undefined;
  let search: ReturnType<typeof captureBestTimeSearch> | undefined;
  let capturedSearch: unknown;
  let originalCheck: Check | undefined;
  // Explicit server injection supplies fixture transport without replacing or
  // weakening the global network guard. Never fall back after a binding fails.
  const fetchOriginal = transport === undefined ? fetch : field(transport, 'fetch') as typeof fetch;
  const tokenOriginal = transport === undefined ? getAccessToken : field(transport, 'token') as typeof getAccessToken;
  if (typeof fetchOriginal !== 'function' || typeof tokenOriginal !== 'function') return fail();
  const same = (input: BestTimeSelection) => selected && input.owner.id === selected.owner.id
    && input.owner.email === selected.owner.email && input.channelId === selected.channelId && input.referenceAt === selected.referenceAt;
  const read = async (resource: 'channels' | 'playlistItems' | 'videos', parameters: Record<string, string>, check: Check) => {
    check();
    if (signal.aborted || !token) return fail();
    const url = new URL('https://www.googleapis.com/youtube/v3/' + resource);
    url.search = new URLSearchParams(parameters).toString();
    const response = await fetchOriginal(url.toString(), { method: 'GET', headers: { Authorization: 'Bearer ' + token },
      signal, redirect: 'error', cache: 'no-store' });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, done = false, cancellation: Promise<void> | undefined;
    // Consume only the body of this exact retained HTTP original. Limits and
    // source identity bind data; they never establish consent or recovery.
    const cancel = () => {
      if (!done && !cancellation) cancellation = (reader ? reader.cancel() : response.body?.cancel())?.catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      check();
      if (signal.aborted || response.status !== 200 || response.ok !== true || response.redirected
        || response.url && response.url !== url.toString()
        || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
        || !response.body) return fail();
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let raw = '', bytes = 0, chunks = 0;
      while (true) {
        check();
        if (signal.aborted) return fail();
        const part = await reader.read();
        check();
        if (signal.aborted) return fail();
        if (part.done) { done = true; break; }
        if (!(part.value instanceof Uint8Array) || ++chunks > 256 || (bytes += part.value.byteLength) > 1_048_576) return fail();
        raw += decoder.decode(part.value, { stream: true });
      }
      raw += decoder.decode();
      check();
      const data: unknown = JSON.parse(raw);
      check(); return data;
    } finally {
      signal.removeEventListener('abort', cancel);
      cancel();
      if (cancellation) await cancellation;
      reader?.releaseLock();
    }
  };
  return Object.freeze({ referenceAt,
    async search(input, check) {
      if (phase !== 'fresh') return fail();
      phase = 'reading'; // Consume before any await, including token acquisition.
      originalCheck = check;
      try {
        check();
        if (signal.aborted || input.referenceAt !== referenceAt) return fail();
        const reference = captureBestTimeReference(input, check);
        if (typeof input.owner.id !== 'string' || !input.owner.id || input.owner.id.length > 128
          || typeof input.owner.email !== 'string' || !input.owner.email || input.owner.email.length > 320) return fail();
        selected = Object.freeze({ owner: Object.freeze({ id: input.owner.id, email: input.owner.email }), ...reference });
        check();
        const access = await tokenOriginal(selected.owner.id, check, { checkRefreshStep: check });
        check();
        if (typeof access !== 'string' || !access || access.length > 16_384 || /[\r\n]/.test(access)) return fail();
        token = access;
        // search.list can omit uploads because of indexing. Use the actual
        // authenticated channel's uploads playlist, with no public-ID fallback.
        const channels = page(await read('channels', { part: 'contentDetails', mine: 'true', maxResults: '50' }, check), 'youtube#channelListResponse', check);
        if (channels.next || channels.items.length !== 1 || field(channels.items[0], 'id') !== selected.channelId) return fail();
        const playlistId = identifier(field(field(field(channels.items[0], 'contentDetails'), 'relatedPlaylists'), 'uploads'));
        const raw = await read('playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: '50' }, check);
        const uploads = page(raw, 'youtube#playlistItemListResponse', check);
        // Completeness is the capped first 50 only. A short page with a next
        // token is incomplete; never fill it with fabricated/older data or retry.
        if (uploads.next && uploads.items.length !== 50) return fail();
        const items = Array.from(uploads.items, (item, position) => {
          check();
          const snippet = field(item, 'snippet'), content = field(item, 'contentDetails'), resource = field(snippet, 'resourceId');
          const videoId = field(content, 'videoId');
          if (field(item, 'kind') !== 'youtube#playlistItem' || field(snippet, 'playlistId') !== playlistId
            || field(snippet, 'channelId') !== selected!.channelId || field(snippet, 'videoOwnerChannelId') !== selected!.channelId
            || field(snippet, 'position') !== position || field(resource, 'kind') !== 'youtube#video' || field(resource, 'videoId') !== videoId) return fail();
          // Playlist-added time is not the video's publication time.
          return { id: { kind: 'youtube#video', videoId }, snippet: { channelId: selected!.channelId, publishedAt: field(content, 'videoPublishedAt') } };
        });
        search = captureBestTimeSearch({ ...selected, search: { available: true, complete: true, items } }, check);
        capturedSearch = Object.freeze({ available: true, complete: true, items: Object.freeze(search.videos.map(v => Object.freeze({
          id: Object.freeze({ kind: 'youtube#video', videoId: v.id }), snippet: Object.freeze({ channelId: search!.channelId, publishedAt: v.publishedAt }) }))) });
        check(); phase = search.videos.length ? 'selected' : 'finished';
        if (!search.videos.length) token = undefined;
        return Object.freeze({ ...selected, collection: capturedSearch });
      } catch { phase = 'finished'; token = undefined; return fail(); }
    },
    async details(input, ids, check) {
      if (phase !== 'selected') return fail();
      phase = 'finished'; // One details original; failures do not reopen it.
      try {
        if (check !== originalCheck) return fail();
        check();
        if (signal.aborted || !same(input) || !search || !selected) return fail();
        const expected = Object.freeze(search.videos.map(v => v.id));
        if (ids.length !== expected.length || expected.some((id, i) => ids[i] !== id)) return fail();
        check();
        const details = page(await read('videos', { part: 'snippet,statistics', id: expected.join(',') }, check), 'youtube#videoListResponse', check);
        if (details.next) return fail();
        const projection = captureBestTimeVideos({ ...selected, search: capturedSearch,
          details: { available: true, complete: true, items: details.items } }, check);
        const collection = Object.freeze({ available: true, complete: true, items: Object.freeze(projection.videos.map(v => Object.freeze({ id: v.id,
          snippet: Object.freeze({ channelId: v.channelId, publishedAt: v.publishedAt }), statistics: Object.freeze({ viewCount: String(v.views) }) }))) });
        check(); return Object.freeze({ ...selected, collection });
      } finally { token = undefined; }
    },
  });
}
