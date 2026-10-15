import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guards';
import { authorizeNativeAdminReviews, checkNativeAdminReviews, closeNativeAdminReviews, readNativeAdminReviews, type NativeAdminReviews } from '@/lib/admin-reviews-native-authorization';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET — lista completa de reseñas de todos los estados, más recientes primero.
export async function GET(request: Request) {
  const startedAt = Date.now(), deadline = performance.now() + 25_000, signal = request.signal, controller = new AbortController();
  const cookie = request.headers.get('cookie'), captured = { signal: controller.signal, headers: new Headers(cookie ? { cookie } : {}) } as Request;
  // Correlation only; headers cannot choose the native admin or originate a grant.
  const readRef = request.headers.get('X-YTV-Read-Ref');
  let retired = false, rejectWait!: (error: Error) => void, original: NativeAdminReviews | null = null;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; controller.abort(); rejectWait(Error('Admin reviews unconfirmed')); } };
  const timer = setTimeout(retire, 25_000); signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (signal.aborted || Date.now() < startedAt || performance.now() >= deadline) retire(); if (retired) throw Error('Admin reviews unconfirmed'); if (original) checkNativeAdminReviews(original); };
  const run = async <T,>(operation: () => Promise<T>) => { check(); const pending = Promise.resolve().then(() => { check(); return operation(); }); void pending.catch(() => {}); const value = await Promise.race([pending, stopped]); check(); return value; };
  const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (readRef !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(readRef)) throw Error('Admin reviews unconfirmed');
    const gate = await run(() => requireAdmin()); if (!gate.ok) return gate.response;
    original = await run(() => authorizeNativeAdminReviews(captured)); if (!original) return json({ error: 'No autorizado' }, 403);
    const result = await run(() => readNativeAdminReviews(original!));
    check();
    const value = readRef === null ? { reviews: result.reviews } : { ...result, adminReviewsRead: { ...result.adminReviewsRead, readRef } };
    const response = json(value); check(); return response;
  } catch { return json({ error: 'admin_reviews_unconfirmed' }, 503); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', retire); if (original) closeNativeAdminReviews(original); controller.abort(); }
}

// PATCH — aprobar o rechazar
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id, status } = await req.json();
  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  await prisma.review.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true });
}
