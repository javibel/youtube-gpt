export type ExtensionComment = { author: string; text: string; likes: number; replies: number; publishedAt: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const POSITIVE = /\b(love|great|amazing|awesome|excellent|fantastic|perfect|best|helpful|incredible|thank|genial|increíble|excelente|fantástico|gracias|perfecto|mejor|útil|maravilloso)\b/i;
const NEGATIVE = /\b(bad|terrible|hate|horrible|worst|awful|useless|boring|waste|disappointing|malo|terrible|odio|horrible|peor|inútil|aburrido|decepcionante)\b/i;


function projectComments(comments: ExtensionComment[]) {
  // Top by likes
  const topByLikes = [...comments].sort((a, b) => b.likes - a.likes).slice(0, 5);

  // Questions
  const questions = comments.filter(c => c.text.includes('?')).sort((a, b) => b.likes - a.likes).slice(0, 10);

  // Sentiment
  let pos = 0, neg = 0, neu = 0;
  for (const c of comments) {
    const isPos = POSITIVE.test(c.text);
    const isNeg = NEGATIVE.test(c.text);
    if (isPos && !isNeg) pos++;
    else if (isNeg && !isPos) neg++;
    else neu++;
  }
  const total = comments.length || 1;

  return {
    commentsDisabled: false,
    totalComments: comments.length,
    topByLikes,
    questions,
    sentiment: {
      positive: Math.round((pos / total) * 100) / 100,
      negative: Math.round((neg / total) * 100) / 100,
      neutral: Math.round((neu / total) * 100) / 100,
    },
  };
}
const disabled = () => ({ commentsDisabled: true, totalComments: 0, topByLikes: [] as ExtensionComment[], questions: [] as ExtensionComment[], sentiment: { positive: 0, negative: 0, neutral: 1 } });
function decode(data: unknown, videoId: string, capturedAt: number, status: number) {
  if (!object(data)) throw Error('Comments response unconfirmed');
  if (status === 403 && object(data.error) && data.error.code === 403 && Array.isArray(data.error.errors)
    && data.error.errors.length >= 1 && data.error.errors.length <= 100 && object(data.error.errors[0]) && data.error.errors[0].reason === 'commentsDisabled') return disabled();
  if (status !== 200 || !Array.isArray(data.items) || data.items.length > 100) throw Error('Comments response unconfirmed');
  const ids = new Set<string>();
  const comments = data.items.map((item: unknown) => {
    if (!object(item) || typeof item.id !== 'string' || !item.id || item.id.length > 200 || ids.has(item.id)
      || !object(item.snippet) || item.snippet.videoId !== videoId || !count(item.snippet.totalReplyCount)
      || !object(item.snippet.topLevelComment) || !object(item.snippet.topLevelComment.snippet)) throw Error('Comment thread unconfirmed');
    ids.add(item.id);
    const snip = item.snippet.topLevelComment.snippet;
    if (snip.videoId !== videoId || typeof snip.authorDisplayName !== 'string' || snip.authorDisplayName.length > 200
      || typeof snip.textDisplay !== 'string' || snip.textDisplay.length > 10_000 || !count(snip.likeCount)
      || typeof snip.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(snip.publishedAt)) throw Error('Comment unconfirmed');
    const date = new Date(snip.publishedAt), time = date.getTime();
    if (!Number.isFinite(time) || time < 0 || time > capturedAt || date.toISOString().replace('.000Z', 'Z') !== snip.publishedAt.replace('.000Z', 'Z')) throw Error('Comment date unconfirmed');
    return { author: snip.authorDisplayName, text: snip.textDisplay, likes: snip.likeCount, replies: item.snippet.totalReplyCount, publishedAt: snip.publishedAt };
  });
  return projectComments(comments);
}
export async function readCommentsInputBody(request: Request, check: () => void): Promise<unknown> {
  check();
  if (!request.body || (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0, text = '';
  try {
    for (;;) { check(); const part = await reader.read(); check(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 2048) return null; text += decoder.decode(part.value, { stream: true }); }
    check(); try { return JSON.parse(text + decoder.decode()); } catch { return null; }
  } finally { try { void reader.cancel().catch(() => {}); } catch {} }
}
export async function readCommentsYoutube(videoId: string, apiKey: string, capturedAt: number, check: () => void, signal: AbortSignal) {
  check(); const target = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
  for (const [key, value] of Object.entries({ part: 'snippet', videoId, maxResults: '100', order: 'relevance', key: apiKey })) target.searchParams.set(key, value);
  let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    response = await fetch(target.toString(), { redirect: 'error', cache: 'no-store', credentials: 'omit', signal }); check();
    if (![200, 403].includes(response.status) || !response.body || (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') throw Error('Comments transport unconfirmed');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 2 * 1024 * 1024)) throw Error('Comments bytes unconfirmed');
    reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0, text = '';
    for (;;) { check(); const part = await reader.read(); check(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 2 * 1024 * 1024) throw Error('Comments bytes unconfirmed'); text += decoder.decode(part.value, { stream: true }); }
    const value: unknown = JSON.parse(text + decoder.decode()); check(); const projected = decode(value, videoId, capturedAt, response.status); check(); return projected;
  } finally {
    // Retiring this local reader never proves provider cancellation or zero quota.
    // Keep the same operation pending; no retries or authority from saved data.
    try { if (reader) void reader.cancel().catch(() => {}); else void response?.body?.cancel().catch(() => {}); } catch {}
  }
}
