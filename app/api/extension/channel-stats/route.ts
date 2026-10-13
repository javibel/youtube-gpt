import { NextResponse } from 'next/server';
import { authorizeExtensionChannelStats, checkExtensionChannelStats, readExtensionChannelStats, validExtensionReadRef } from '@/lib/extension-channel-stats-native-authorization';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function POST(request: Request) {
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  let nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Extension identity unconfirmed')); } };
  const timer = setTimeout(retire, 25_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Extension identity unconfirmed'); nativeCheck?.(); };
  const run = async <T,>(operation: () => Promise<T>) => {
    check(); const original = Promise.resolve().then(() => { check(); return operation(); });
    const value = await Promise.race([original, stopped]); check(); return value;
  };
  const readRef = request.headers.get('x-ytv-read-ref');
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (!validExtensionReadRef(readRef)) return json({ code: 'invalid_read_ref' }, 400);
    const original = await run(() => authorizeExtensionChannelStats(request));
    if (!original) return json({ error:'not_logged_in',code:'not_logged_in', readRef }, 401);
    nativeCheck = () => checkExtensionChannelStats(original);
    check();
    const result = await run(() => readExtensionChannelStats(original, readRef, check));
    check(); if (!result) return json({error:'youtube_not_connected',code:'youtube_not_connected',readRef},400);
    const response = json(result); check(); return response;
  } catch { return json({ error:'channel_stats_unconfirmed',code:'channel_stats_unconfirmed', readRef }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
