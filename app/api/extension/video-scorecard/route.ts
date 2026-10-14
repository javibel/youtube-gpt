import { NextResponse } from 'next/server';
import { authorizeExtensionScorecard, checkExtensionScorecard, runExtensionScorecard, validScorecardKey, extensionScorecardMeta } from '@/lib/extension-scorecard-native-authorization';
import { readScorecardInputBody } from '@/lib/extension-scorecard-youtube';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  const capturedAt = Date.now(), deadline = performance.now() + 55_000, transport = new AbortController();
  let retired = false, rejectWait!: (e: Error) => void, nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; transport.abort(); rejectWait(Error('Scorecard unconfirmed')); } };
  const timer = setTimeout(retire, 55_000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Scorecard unconfirmed'); nativeCheck?.(); };
  const run = async <T,>(operation: () => Promise<T>) => { check(); const producer = Promise.resolve().then(() => { check(); return operation(); }); const result = await Promise.race([producer, stopped]); check(); return result; };
  const key = request.headers.get('idempotency-key');
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (!validScorecardKey(key)) return json({ code: 'invalid_operation_key', operationKey: key }, 400);
    const original = await run(() => authorizeExtensionScorecard(request));
    if (!original) return json({ code: 'not_logged_in', operationKey: key }, 401);
    nativeCheck = () => checkExtensionScorecard(original); check();
    const body: unknown = await run(() => readScorecardInputBody(request, check));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ code: 'invalid_video_input', operationKey: key }, 400);
    const { videoId } = body as Record<string, unknown>;
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return json({ code: 'invalid_video_input', operationKey: key }, 400);
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) return json({ code: 'scorecard_configuration_unavailable', operationKey: key }, 503);
    const result=await run(()=>runExtensionScorecard(original,key,videoId,apiKey,check,transport.signal));
    check();const meta=extensionScorecardMeta(original);
    const response=result.kind==='rate-limited'?json({code:'rate_limited',operationKey:key},429):result.kind==='not-found'?json({code:'video_not_found',operationKey:key},404):json({...result.data,operationKey:key,expiresAt:Math.min(capturedAt+55000,meta.expires),observedAt:new Date(meta.capturedAt).toISOString()});
    check(); return response;
  } catch { return json({ code: 'scorecard_unconfirmed', operationKey: key }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
