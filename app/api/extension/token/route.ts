import { NextResponse } from 'next/server';
import { authorizeNativeExtensionToken, mintNativeExtensionToken, checkNativeExtensionToken, validExtensionTokenKey } from '@/lib/extension-token-native-authorization';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: Request) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void;
  let nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Extension token unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Extension token unconfirmed'); nativeCheck?.(); };
  const run = async <T,>(operation: () => Promise<T>) => {
    check(); const original = Promise.resolve().then(() => { check(); return operation(); });
    const value = await Promise.race([original, stopped]); check(); return value;
  };
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = await run(() => authorizeNativeExtensionToken());
    if (!original) return json({ error: 'not_logged_in' }, 401);
    nativeCheck = () => checkNativeExtensionToken(original);
    check();
    const key = request.headers.get('idempotency-key');
    if (!validExtensionTokenKey(key)) return json({ error: 'invalid_operation_key' }, 400);
    const result = await run(() => mintNativeExtensionToken(original, key, check));
    check(); const response = json(result); check(); return response;
  } catch { return json({ error: 'extension_token_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
