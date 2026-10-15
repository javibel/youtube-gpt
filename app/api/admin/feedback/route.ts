import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guards';
import { authorizeNativeAdminFeedback, checkNativeAdminFeedback, closeNativeAdminFeedback, readNativeAdminFeedback, type NativeAdminFeedback } from '@/lib/admin-feedback-native-authorization';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET — últimas 50 respuestas enviadas y recuento separado de pendientes.
export async function GET(request: Request) {
  const startedAt = Date.now(), deadline = performance.now() + 25_000, signal = request.signal, controller = new AbortController();
  const cookie = request.headers.get('cookie'), captured = { signal: controller.signal, headers: new Headers(cookie ? { cookie } : {}) } as Request;
  // Correlation only; headers cannot choose the native admin or originate a grant.
  const readRef = request.headers.get('X-YTV-Read-Ref');
  let retired = false, rejectWait!: (error: Error) => void, original: NativeAdminFeedback | null = null;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; controller.abort(); rejectWait(Error('Admin feedback unconfirmed')); } };
  const timer = setTimeout(retire, 25_000); signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (signal.aborted || Date.now() < startedAt || Date.now() >= startedAt + 25_000 || performance.now() >= deadline) retire(); if (retired) throw Error('Admin feedback unconfirmed'); if (original) checkNativeAdminFeedback(original); };
  const run = async <T,>(operation: () => Promise<T>) => { check(); const pending = Promise.resolve().then(() => { check(); return operation(); }); void pending.catch(() => {}); const value = await Promise.race([pending, stopped]); check(); return value; };
  const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (readRef !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(readRef)) throw Error('Admin feedback unconfirmed');
    const gate = await run(() => requireAdmin()); if (!gate.ok) return gate.response;
    original = await run(() => authorizeNativeAdminFeedback(captured)); if (!original) return json({ error: 'No autorizado' }, 403);
    const result = await run(() => readNativeAdminFeedback(original!));
    check();
    const value = readRef === null ? { feedbacks: result.feedbacks, pending: result.pending, dataQuality: result.dataQuality } : { ...result, adminFeedbackRead: { ...result.adminFeedbackRead, readRef } };
    const response = json(value); check(); return response;
  } catch { return json({ error: 'admin_feedback_unconfirmed' }, 503); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', retire); if (original) closeNativeAdminFeedback(original); controller.abort(); }
}
