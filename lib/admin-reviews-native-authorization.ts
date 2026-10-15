import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';

declare const adminReviewsBrand: unique symbol;
export type NativeAdminReviews = { readonly [adminReviewsBrand]: true };
type Original = { id: string; email: string; sessionRef: string; issuedAt: number; tokenExpires: number;
  verifiedAt: number; startedAt: number; deadline: number; expiresAt: number; signal: AbortSignal; origin: string; used: boolean };
const originals = new WeakMap<object, Original>();
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const account = (id: string) => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } });
function eligible(row: Awaited<ReturnType<typeof account>>, id: string, email: string) {
  return !!row && row.id === id && row.email === email && row.emailVerified instanceof Date
    && Number.isFinite(row.emailVerified.getTime()) && row.emailVerified.getTime() >= 0 && row.emailVerified.getTime() <= Date.now();
}
function check(own: Original) {
  if (own.signal.aborted || Date.now() < own.startedAt || Date.now() >= own.expiresAt
    || performance.now() >= own.deadline || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== own.origin) throw Error('Admin reviews unconfirmed');
}
function retained(original: NativeAdminReviews) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own) throw Error('Admin reviews unconfirmed');
  check(own); return own;
}

// A review read has its own native request original. Public ingress results,
// statistics grants, copied principals and stored rows cannot originate it.
export async function authorizeNativeAdminReviews(request: Request): Promise<NativeAdminReviews | null> {
  const startedAt = Date.now(), deadline = performance.now() + 25_000, signal = request.signal;
  const origin = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL, cookie = request.headers.get('cookie');
  if (!origin || !cookie || signal.aborted || !ADMIN_EMAIL || ADMIN_EMAIL !== ADMIN_EMAIL.trim().toLowerCase()
    || ADMIN_EMAIL.length > 254 || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(ADMIN_EMAIL)) return null;
  let configured: URL;
  try { configured = new URL(origin); } catch { return null; }
  if (configured.username || configured.password || configured.search || configured.hash || configured.protocol !== 'https:'
    && !(configured.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname))) return null;
  const decoded = await readNativeSessionCookie(new Request(new URL('/api/auth/session', configured.origin), { headers: { cookie }, signal }));
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
  const { id, sub, email, authSessionRef, iat, exp, isAdmin, requiresVerification, requiresTotp } = decoded;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || sub !== id || email !== ADMIN_EMAIL
    || !uuid(authSessionRef) || isAdmin !== true || requiresVerification !== false || requiresTotp !== false
    || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat > Date.now() / 1000
    || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000) || iat >= exp || exp * 1000 <= Date.now()) return null;
  const own: Original = { id, email, sessionRef: authSessionRef, issuedAt: iat, tokenExpires: exp,
    verifiedAt: 0, startedAt, deadline, expiresAt: Math.min(startedAt + 25_000, exp * 1000), signal, origin, used: false };
  check(own);
  const row = await account(id); check(own);
  if (!eligible(row, id, email) || !row) return null;
  own.verifiedAt = row.emailVerified!.getTime();
  const original = Object.freeze({}) as NativeAdminReviews;
  originals.set(original, own); return original;
}
export function checkNativeAdminReviews(original: NativeAdminReviews): void { retained(original); }
export function closeNativeAdminReviews(original: NativeAdminReviews): void { originals.delete(original); }

// This grant exposes only the review SELECT. It cannot run a caller-supplied
// operation or authorize moderation, statistics, feedback or account writers.
export async function readNativeAdminReviews(original: NativeAdminReviews) {
  const own = retained(original); if (own.used) throw Error('Admin reviews unconfirmed'); own.used = true;
  const recheck = async () => {
    retained(original); const row = await account(own.id); retained(original);
    if (!eligible(row, own.id, own.email) || row?.emailVerified?.getTime() !== own.verifiedAt) throw Error('Admin reviews unconfirmed');
  };
  await recheck(); retained(original);
  // Compatibility scope: the complete stored list, all statuses, newest first.
  // Pagination needs an explicit consumer contract; silently truncating hides
  // moderation work from the existing client.
  const rows = await prisma.review.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, rating: true, text: true, status: true, createdAt: true, user: { select: { email: true, name: true } } },
  });
  retained(original);
  const value = {
    reviews: rows.map(row => ({ id: row.id, rating: row.rating, text: row.text, status: row.status,
      createdAt: row.createdAt.toISOString(), user: { email: row.user.email, name: row.user.name } })),
    adminReviewsRead: { userId: own.id, email: own.email, asOf: own.startedAt, expiresAt: own.expiresAt },
  };
  const snapshot = JSON.stringify(value); retained(original);
  await recheck(); retained(original);
  return JSON.parse(snapshot) as typeof value;
}
