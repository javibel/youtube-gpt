import { NextResponse } from 'next/server';
import { authorizeExtensionSeoLive, checkExtensionSeoLive, analyzeExtensionSeoLive, validExtensionReadRef } from '@/lib/extension-seo-live-native-authorization';
import { readSeoLiveInputBody } from '@/lib/extension-seo-live-input';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function POST(request: Request) {
  const startedAt = Date.now(), deadline = performance.now() + 25_000;
  // Capture the native request before the first asynchronous boundary. Later
  // public mutations may revoke a view; they cannot change this HTTP's intent.
  const signal = request.signal, body = request.body;
  const names = ['authorization','content-type','content-length','x-ytv-read-ref','x-ytv-view-ref','x-ytv-language'];
  const headers = new Map(names.map(name => [name, request.headers.get(name)]));
  const captured = { signal, body, headers:{ get:(name:string) => headers.get(name.toLowerCase()) ?? null } } as Request;
  let retired = false, rejectWait!: (error: Error) => void;
  let nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Extension identity unconfirmed')); } };
  const timer = setTimeout(retire, 25_000);
  signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (signal.aborted || Date.now() < startedAt || performance.now() >= deadline) retire(); if (retired) throw Error('Extension identity unconfirmed'); nativeCheck?.(); };
  const run = async <T,>(operation: () => Promise<T>) => {
    check(); const original = Promise.resolve().then(() => { check(); return operation(); });
    const value = await Promise.race([original, stopped]); check(); return value;
  };
  const readRef = captured.headers.get('x-ytv-read-ref'), viewRef = captured.headers.get('x-ytv-view-ref'), language = captured.headers.get('x-ytv-language');
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (!validExtensionReadRef(readRef)) return json({ code: 'invalid_read_ref' }, 400);
    if ((viewRef !== null || language !== null) && (!validExtensionReadRef(viewRef) || !['es','en'].includes(language ?? ''))) return json({ code:'invalid_view',readRef },400);
    const original = await run(() => authorizeExtensionSeoLive(captured));
    if (!original) return json({ error:'not_logged_in',code:'not_logged_in', readRef }, 401);
    nativeCheck = () => checkExtensionSeoLive(original);
    check();
    const input = await run(() => readSeoLiveInputBody(captured,check));
    if (!input) return json({error:'invalid_seo_live_input',code:'invalid_seo_live_input',readRef},400);
    const result = await run(() => analyzeExtensionSeoLive(original,input,readRef,check,viewRef ? { viewRef,language:language as 'es'|'en' } : undefined));
    check(); const response = json(result); check(); return response;
  } catch { return json({ error:'seo_live_unconfirmed',code:'seo_live_unconfirmed', readRef }, 503); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', retire); }
}
