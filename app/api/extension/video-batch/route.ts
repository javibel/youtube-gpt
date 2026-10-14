import { NextResponse } from 'next/server';
import { authorizeExtensionBatch, checkExtensionBatch, runExtensionBatch, validBatchKey, extensionBatchMeta } from '@/lib/extension-video-batch-native-authorization';
import { readBatchYoutube, readBatchInputBody } from '@/lib/extension-video-batch-youtube';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  const capturedAt = Date.now(), deadline = performance.now() + 55_000, transport = new AbortController();
  let retired = false, rejectWait!: (e: Error) => void, nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; transport.abort(); rejectWait(Error('Batch unconfirmed')); } };
  const timer = setTimeout(retire, 55_000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Batch unconfirmed'); nativeCheck?.(); };
  const run = async <T,>(operation: () => Promise<T>) => { check(); const producer = Promise.resolve().then(() => { check(); return operation(); }); const result = await Promise.race([producer, stopped]); check(); return result; };
  const key = request.headers.get('idempotency-key');
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (!validBatchKey(key)) return json({ code: 'invalid_operation_key', operationKey: key }, 400);
    const original = await run(() => authorizeExtensionBatch(request));
    if (!original) return json({ code: 'not_logged_in', operationKey: key }, 401);
    nativeCheck = () => checkExtensionBatch(original); check();
    const body: unknown = await run(() => readBatchInputBody(request, check));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ code: 'invalid_video_input', operationKey: key }, 400);
    const { videoIds } = body as Record<string, unknown>;
    if (!Array.isArray(videoIds) || videoIds.length<1 || videoIds.length>50 || videoIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(id)) || new Set(videoIds).size!==videoIds.length) return json({ code: 'invalid_video_input', operationKey: key }, 400);
    const ids=Object.freeze([...videoIds]) as readonly string[];
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) return json({ code: 'batch_configuration_unavailable', operationKey: key }, 503);
    const result = await run(() => runExtensionBatch(original, key, check, async ownCheck => {
      ownCheck();
      const result = await readBatchYoutube(ids, apiKey, capturedAt, ownCheck, transport.signal);
      ownCheck(); return result;
    }));
    check();
    const meta=extensionBatchMeta(original);
    const response = result===null ? json({code:'rate_limited',operationKey:key},429) : json({videos:result.videos,missingVideoIds:result.missingVideoIds,requestedVideoIds:ids,operationKey:key,expiresAt:Math.min(capturedAt+55_000,meta.expires),observedAt:new Date(capturedAt).toISOString(),mode:meta.mode,dataQuality:{source:'youtube-batch-response',freshness:'unconfirmed',velocity:'lifetime-average',subscriberEnrichment:result.subscriberEnrichment}});
    check(); return response;
  } catch { return json({ code: 'batch_unconfirmed', operationKey: key }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
