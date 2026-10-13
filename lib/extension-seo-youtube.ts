type Video = { id: string; snippet: { title: string; description?: string; tags?: string[]; thumbnails?: Record<string, unknown> };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }; contentDetails?: { duration?: string; caption?: string } };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export async function readSeoInputBody(request: Request, check: () => void): Promise<unknown> {
  check();
  if (!request.body || (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0, text = '';
  try {
    for (;;) {
      check(); const part = await reader.read(); check();
      if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 2048) return null;
      text += decoder.decode(part.value, { stream: true });
    }
    check();
    try { return JSON.parse(text + decoder.decode()); } catch { return null; }
  } finally { try { void reader.cancel().catch(() => {}); } catch {} }
}
function decodeVideo(data: unknown, id: string): Video | null {
  if (!object(data) || !Array.isArray(data.items) || data.items.length > 1) throw Error('YouTube response unconfirmed');
  if (!data.items.length) return null;
  const v = data.items[0];
  if (!object(v) || v.id !== id || !object(v.snippet) || typeof v.snippet.title !== 'string' || v.snippet.title.length > 200
    || (v.snippet.description !== undefined && (typeof v.snippet.description !== 'string' || v.snippet.description.length > 10_000))
    || (v.snippet.tags !== undefined && (!Array.isArray(v.snippet.tags) || v.snippet.tags.length > 100 || v.snippet.tags.some(t => typeof t !== 'string' || t.length > 500)))
    || (v.snippet.thumbnails !== undefined && (!object(v.snippet.thumbnails) || Object.keys(v.snippet.thumbnails).length > 10))) throw Error('YouTube video unconfirmed');
  if (v.statistics !== undefined) {
    if (!object(v.statistics)) throw Error('YouTube statistics unconfirmed');
    for (const key of ['viewCount', 'likeCount', 'commentCount']) {
      const value = v.statistics[key];
      if (value !== undefined && (typeof value !== 'string' || !/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value)))) throw Error('YouTube count unconfirmed');
    }
  }
  if (v.contentDetails !== undefined) {
    if (!object(v.contentDetails) || (v.contentDetails.caption !== undefined && (typeof v.contentDetails.caption !== 'string' || !['true', 'false'].includes(v.contentDetails.caption)))
      || (v.contentDetails.duration !== undefined && (typeof v.contentDetails.duration !== 'string' || v.contentDetails.duration.length > 128 || !v.contentDetails.duration.startsWith('P')))) throw Error('YouTube details unconfirmed');
    const parts = String(v.contentDetails.duration ?? '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (parts && !Number.isSafeInteger(Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0))) throw Error('YouTube duration unconfirmed');
  }
  return v as Video;
}
export async function readSeoYoutubeVideo(id: string, apiKey: string, check: () => void, signal: AbortSignal): Promise<Video | null> {
  check();
  const target = new URL('https://www.googleapis.com/youtube/v3/videos');
  target.searchParams.set('part', 'snippet,statistics,contentDetails');
  target.searchParams.set('id', id); target.searchParams.set('key', apiKey);
  let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    response = await fetch(target.toString(), { redirect: 'error', cache: 'no-store', credentials: 'omit', signal });
    check();
    if (response.status !== 200 || !response.body || (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') throw Error('YouTube response unconfirmed');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 128 * 1024)) throw Error('YouTube response unconfirmed');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0, text = '';
    for (;;) {
      check(); const part = await reader.read(); check();
      if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 128 * 1024) throw Error('YouTube response unconfirmed');
      text += decoder.decode(part.value, { stream: true });
    }
    const value: unknown = JSON.parse(text + decoder.decode()); check();
    const video = decodeVideo(value, id); check(); return video;
  } finally {
    // Cancellation drains a local reader; it does not prove provider rollback or
    // permit another fetch. Its admission remains owned by the same original.
    try { if (reader) void reader.cancel().catch(() => {}); else void response?.body?.cancel().catch(() => {}); } catch {}
  }
}
