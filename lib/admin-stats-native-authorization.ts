import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';

declare const adminStatsBrand: unique symbol;
export type NativeAdminStats = { readonly [adminStatsBrand]: true };
export type AdminStatsRead = Readonly<{ userId: string; asOf: number; expiresAt: number; step: <T>(operation: () => Promise<T>) => Promise<T> }>;
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
    || performance.now() >= own.deadline || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== own.origin) throw Error('Admin statistics unconfirmed');
}
function retained(original: NativeAdminStats) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own) throw Error('Admin statistics unconfirmed');
  check(own); return own;
}

// Only this request's native encrypted-cookie decoder can originate a grant.
// A public requireAdmin result, copied principal or database row cannot do so.
export async function authorizeNativeAdminStats(request: Request): Promise<NativeAdminStats | null> {
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
  const original = Object.freeze({}) as NativeAdminStats;
  originals.set(original, own); return original;
}
export function checkNativeAdminStats(original: NativeAdminStats): void { retained(original); }
export function closeNativeAdminStats(original: NativeAdminStats): void { originals.delete(original); }
export async function runNativeAdminStats(original: NativeAdminStats, read: (context: AdminStatsRead) => Promise<unknown>): Promise<unknown> {
  const own = retained(original); if (own.used) throw Error('Admin statistics unconfirmed'); own.used = true;
  const recheck = async () => {
    retained(original); const row = await account(own.id); retained(original);
    if (!eligible(row, own.id, own.email) || row?.emailVerified?.getTime() !== own.verifiedAt) throw Error('Admin statistics unconfirmed');
  };
  await recheck();
  const context: AdminStatsRead = Object.freeze({ userId: own.id, asOf: own.startedAt, expiresAt: own.expiresAt, async step<T>(operation: () => Promise<T>) {
    retained(original);
    const pending = Promise.resolve().then(() => { retained(original); return operation(); });
    void pending.catch(() => {});
    const result = await pending; retained(original); return result;
  } });
  const value = await read(context); retained(original);
  // The JSON snapshot precedes the final dependent recheck. Later row mutation
  // cannot change projected dates, amounts or identities while that read yields.
  const snapshot = JSON.stringify(value); retained(original);
  if (typeof snapshot !== 'string') throw Error('Admin statistics unconfirmed');
  await recheck(); retained(original); return JSON.parse(snapshot);
}
