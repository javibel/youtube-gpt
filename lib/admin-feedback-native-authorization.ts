import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';

declare const adminFeedbackBrand: unique symbol;
export type NativeAdminFeedback = { readonly [adminFeedbackBrand]: true };
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
    || performance.now() >= own.deadline || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== own.origin) throw Error('Admin feedback unconfirmed');
}
function retained(original: NativeAdminFeedback) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own) throw Error('Admin feedback unconfirmed');
  check(own); return own;
}

// A feedback read has its own native request original. Public ingress results,
// review/statistics grants, copied principals and stored rows cannot originate it.
export async function authorizeNativeAdminFeedback(request: Request): Promise<NativeAdminFeedback | null> {
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
  const original = Object.freeze({}) as NativeAdminFeedback;
  originals.set(original, own); return original;
}
export function checkNativeAdminFeedback(original: NativeAdminFeedback): void { retained(original); }
export function closeNativeAdminFeedback(original: NativeAdminFeedback): void { originals.delete(original); }

// This purpose exposes only the submitted feedback SELECT and pending count.
// It has no caller-supplied operation and cannot send requests or mutate rows.
export async function readNativeAdminFeedback(original: NativeAdminFeedback) {
  const own = retained(original); if (own.used) throw Error('Admin feedback unconfirmed'); own.used = true;
  const recheck = async () => {
    retained(original); const row = await account(own.id); retained(original);
    if (!eligible(row, own.id, own.email) || row?.emailVerified?.getTime() !== own.verifiedAt) throw Error('Admin feedback unconfirmed');
  };
  await recheck(); retained(original);
  const rows = await prisma.userFeedback.findMany({
    where: { submittedAt: { not: null } }, orderBy: { submittedAt: 'desc' }, take: 50,
    select: { id: true, userId: true, token: true, lang: true, rating: true, comment: true, submittedAt: true, createdAt: true,
      user: { select: { email: true, name: true } } },
  });
  retained(original);
  const feedbacks = rows.map(row => {
    if (!row.submittedAt) throw Error('Admin feedback unconfirmed');
    return { id: row.id, userId: row.userId, token: row.token, lang: row.lang, rating: row.rating, comment: row.comment,
      submittedAt: row.submittedAt.toISOString(), createdAt: row.createdAt.toISOString(), user: { email: row.user.email, name: row.user.name } };
  });
  // Freeze the first SELECT's projection before the separate count yields.
  // These are separate reads; this does not claim a transactional snapshot.
  const feedbackSnapshot = JSON.stringify(feedbacks); retained(original);
  const pending = await prisma.userFeedback.count({ where: { submittedAt: null } }); retained(original);
  if (!Number.isSafeInteger(pending) || pending < 0) throw Error('Admin feedback unconfirmed');
  const value = { feedbacks: JSON.parse(feedbackSnapshot) as typeof feedbacks, pending,
    dataQuality: { source: 'stored-feedback', window: 'latest-50-submitted', freshness: 'unconfirmed', consistency: 'separate-reads' },
    adminFeedbackRead: { userId: own.id, email: own.email, asOf: own.startedAt, expiresAt: own.expiresAt },
  };
  const snapshot = JSON.stringify(value); retained(original);
  await recheck(); retained(original);
  return JSON.parse(snapshot) as typeof value;
}
