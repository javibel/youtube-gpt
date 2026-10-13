import { NextResponse } from 'next/server';
import { authorizeExtensionSeo, checkExtensionSeo, runExtensionSeo, validSeoKey } from '@/lib/extension-seo-native-authorization';
import { readSeoYoutubeVideo, readSeoInputBody } from '@/lib/extension-seo-youtube';
import { scoreExtensionVideo } from '@/lib/extension-seo-score';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  const deadline = performance.now() + 55_000, transport = new AbortController();
  let retired = false, rejectWait!: (e: Error) => void, nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; transport.abort(); rejectWait(Error('SEO unconfirmed')); } };
  const timer = setTimeout(retire, 55_000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('SEO unconfirmed'); nativeCheck?.(); };
  const run = async <T,>(operation: () => Promise<T>) => { check(); const producer = Promise.resolve().then(() => { check(); return operation(); }); const result = await Promise.race([producer, stopped]); check(); return result; };
  const key = request.headers.get('idempotency-key');
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (!validSeoKey(key)) return json({ code: 'invalid_operation_key', operationKey: key }, 400);
    const original = await run(() => authorizeExtensionSeo(request));
    if (!original) return json({ code: 'not_logged_in', operationKey: key }, 401);
    nativeCheck = () => checkExtensionSeo(original); check();
    const body: unknown = await run(() => readSeoInputBody(request, check));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ code: 'invalid_video_input', operationKey: key }, 400);
    const { videoId, lang } = body as Record<string, unknown>;
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || typeof lang !== 'string' || !['es','en'].includes(lang)) return json({ code: 'invalid_video_input', operationKey: key }, 400);
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) return json({ code: 'seo_configuration_unavailable', operationKey: key }, 503);
    const result = await run(() => runExtensionSeo(original, key, check, async ownCheck => {
      ownCheck();
      const video = await readSeoYoutubeVideo(videoId, apiKey, ownCheck, transport.signal);
      ownCheck(); return video ? scoreExtensionVideo(videoId, String(lang), video) : null;
    }));
    check();
    const response = result === null ? json({ code: 'video_not_found', operationKey: key }, 404) : json({ ...result, operationKey: key });
    check(); return response;
  } catch { return json({ code: 'seo_unconfirmed', operationKey: key }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
