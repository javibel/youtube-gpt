import { NextRequest, NextResponse } from 'next/server';
import { authorizeExtensionAbCreation, checkExtensionAbCreation, createExtensionAbOriginal, extensionAbInput, validExtensionAbKey } from '@/lib/extension-ab-create-native-authorization';
import { authorizeExtensionAbRead, checkExtensionAbRead, readExtensionAbCount } from '@/lib/extension-ab-read-native-authorization';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET — cuenta de tests activos, para pintar "N/M activos" en el panel de la
// extensión sin traer los 20 registros completos que sí devuelve la ruta web.
export async function GET(request: Request) {
  const deadline = performance.now() + 25000;
  let retired = false, rejectWait!: (error: Error) => void, nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('AB count unconfirmed')); } };
  const timer = setTimeout(retire, 25000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (request.signal.aborted || performance.now() >= deadline) retire();
    if (retired) throw Error('AB count unconfirmed');
    nativeCheck?.();
  };
  const run = async <T,>(operation: () => Promise<T>) => {
    check();
    const original = Promise.resolve().then(() => { check(); return operation(); });
    const result = await Promise.race([original, stopped]);
    check(); return result;
  };
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    check();
    const original = await run(() => authorizeExtensionAbRead(request));
    if (!original) return json({ error: 'not_logged_in' }, 401);
    nativeCheck = () => checkExtensionAbRead(original);
    check();
    const data = await run(() => readExtensionAbCount(original, check));
    check(); const response = json(data); check(); return response;
  } catch { return json({ error: 'ab_read_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}

export async function POST(request: NextRequest) {
  const deadline = performance.now() + 55000;
  let retired = false, rejectWait!: (error: Error) => void, nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('AB creation unconfirmed')); } };
  const timer = setTimeout(retire, 55000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('AB creation unconfirmed'); nativeCheck?.(); };
  const run = async <T,>(operation: () => Promise<T>) => { check(); const original = Promise.resolve().then(() => { check(); return operation(); }); const value = await Promise.race([original, stopped]); check(); return value; };
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    check(); const key = request.headers.get('idempotency-key');
    if (!validExtensionAbKey(key)) return json({ error: 'invalid_operation_key' }, 400);
    const original = await run(() => authorizeExtensionAbCreation(request));
    if (!original) return json({ error: 'not_logged_in' }, 401);
    nativeCheck = () => checkExtensionAbCreation(original); check();
    const length = request.headers.get('content-length');
    if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > 4096)) return json({ error: 'invalid_input' }, 400);
    let raw: string;
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'invalid_input' }, 400);
      const chunks: Uint8Array[] = []; let total = 0;
      try { for (;;) { const part = await run(() => reader.read()); if (part.done) break; total += part.value.byteLength; if (total > 4096) { void reader.cancel().catch(() => {}); return json({ error: 'invalid_input' }, 400); } chunks.push(part.value); } }
      finally { try { reader.releaseLock(); } catch { /* a retired original reader remains held */ } }
      const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch { check(); return json({ error: 'invalid_input' }, 400); }
    let input; try { input = extensionAbInput(JSON.parse(raw)); } catch { input = null; }
    if (!input) return json({ error: 'invalid_input' }, 400);
    const result = await run(() => createExtensionAbOriginal(original, key, input, check)); check();
    const response = result.ok ? json({ test: result.test, operationKey: key }, 201) : json({ error: result.error, limit: result.limit }, result.status);
    check(); return response;
  } catch { return json({ error: 'ab_creation_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
