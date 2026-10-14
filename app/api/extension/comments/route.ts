import { NextResponse } from 'next/server';
import { authorizeExtensionComments, checkExtensionComments, runExtensionComments, validCommentsKey, extensionCommentsExpiry } from '@/lib/extension-comments-native-authorization';
import { readCommentsYoutube, readCommentsInputBody } from '@/lib/extension-comments-youtube';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  const capturedAt = Date.now(), deadline = performance.now() + 55_000, transport = new AbortController();
  let retired = false, rejectWait!: (e: Error) => void, nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; transport.abort(); rejectWait(Error('Comments unconfirmed')); } };
  const timer = setTimeout(retire, 55_000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Comments unconfirmed'); nativeCheck?.(); };
  const run = async <T,>(operation: () => Promise<T>) => { check(); const producer = Promise.resolve().then(() => { check(); return operation(); }); const result = await Promise.race([producer, stopped]); check(); return result; };
  const key = request.headers.get('idempotency-key');
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (!validCommentsKey(key)) return json({ code: 'invalid_operation_key', operationKey: key }, 400);
    const original = await run(() => authorizeExtensionComments(request));
    if (!original) return json({ code: 'not_logged_in', operationKey: key }, 401);
    nativeCheck = () => checkExtensionComments(original); check();
    const body: unknown = await run(() => readCommentsInputBody(request, check));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ code: 'invalid_video_input', operationKey: key }, 400);
    const { videoId } = body as Record<string, unknown>;
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return json({ code: 'invalid_video_input', operationKey: key }, 400);
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) return json({ code: 'comments_configuration_unavailable', operationKey: key }, 503);
    const result = await run(() => runExtensionComments(original, key, check, async ownCheck => {
      ownCheck();
      const result = await readCommentsYoutube(videoId, apiKey, capturedAt, ownCheck, transport.signal);
      ownCheck(); return result;
    }));
    check();
    const response = json({ ...result, videoId, operationKey: key, expiresAt: Math.min(capturedAt + 55_000, extensionCommentsExpiry(original)), observedAt: new Date(capturedAt).toISOString(), dataQuality: { source: 'youtube-comment-sample', sampleLimit: 100, order: 'relevance', sentiment: 'keyword-heuristic', freshness: 'unconfirmed' } });
    check(); return response;
  } catch { return json({ code: 'comments_unconfirmed', operationKey: key }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
