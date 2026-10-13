import { NextResponse } from 'next/server';
import { authorizeNativeExtensionPassword, mintNativeExtensionToken, checkNativeExtensionToken, validExtensionTokenKey } from '@/lib/extension-token-native-authorization';
import { rateLimitRequest } from '@/lib/rate-limit-db';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void;
  let nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Extension login unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Extension login unconfirmed'); nativeCheck?.(); };
  const run = async <T,>(operation: () => Promise<T>) => {
    check(); const original = Promise.resolve().then(() => { check(); return operation(); });
    const value = await Promise.race([original, stopped]); check(); return value;
  };
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const key = request.headers.get('idempotency-key');
    if (!validExtensionTokenKey(key)) return json({ code: 'invalid_operation_key' }, 400);
    if (await run(() => rateLimitRequest(request, 'ext-login', 5, 15, true)) !== true) return json({ code: 'login_rate_limited' }, 429);
    const body = await run(() => request.json());
    const original = await run(() => authorizeNativeExtensionPassword(body, check));
    if (original === 'invalid_credentials') return json({ code: original }, 401);
    if (original === 'email_unverified') return json({ code: original }, 403);
    nativeCheck = () => checkNativeExtensionToken(original);
    check();
    const result = await run(() => mintNativeExtensionToken(original, key, check));
    check(); const response = json(result); check(); return response;
  } catch { return json({ code: 'extension_login_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
