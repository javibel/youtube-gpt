import { NextRequest, NextResponse } from 'next/server';
import { getExtensionUser } from '@/lib/extension-auth';
import { createAbTest } from '@/lib/ab-test';
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
  const ext = await getExtensionUser(request);
  if (!ext) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });

  const body = await request.json();
  const result = await createAbTest(ext.user.id, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, limit: result.limit }, { status: result.status });
  }
  return NextResponse.json({ test: result.test }, { status: 201 });
}
