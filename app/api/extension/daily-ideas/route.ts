import { NextResponse } from 'next/server';
import { authorizeExtensionDailyIdeas, checkExtensionDailyIdeas, readExtensionDailyIdeas, validExtensionReadRef } from '@/lib/extension-daily-ideas-native-authorization';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function GET(request: Request) {
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
    const original = await run(() => authorizeExtensionDailyIdeas(request));
    if (!original) return json({ error:'not_logged_in',code:'not_logged_in', readRef }, 401);
    nativeCheck = () => checkExtensionDailyIdeas(original);
    check();
    const result = await run(() => readExtensionDailyIdeas(original, readRef, check));
    check(); const response = json(result); check(); return response;
  } catch { return json({ error:'daily_ideas_unconfirmed',code:'daily_ideas_unconfirmed', readRef }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
