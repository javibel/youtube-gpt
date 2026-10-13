import { headers } from 'next/headers';
import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';
import { updateProfileOriginal } from '@/lib/profile-update';
import type { ProfileUpdateResult } from '@/lib/profile-update';

declare const nativeProfileSessionBrand: unique symbol;
export type NativeProfileSession = { readonly [nativeProfileSessionBrand]: true };
type Original = {
  owner: Readonly<{ userId: string; email: string }>;
  expires: number;
  used: boolean;
};
const originals = new WeakMap<object, Original>();
const emailPattern = /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/;

// No actor, cookie, role, proof or recovery selector is supplied by a caller.
// Native options decode only the incoming encrypted cookie, never a Bearer or
// session refresh. Account data below can only deny that decoded principal.
export async function authorizeNativeProfile(): Promise<NativeProfileSession | null> {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!configured) throw Error('Profile authentication unavailable');
  const origin = new URL(configured);
  if (origin.username || origin.password || origin.search || origin.hash
    || origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) {
    throw Error('Profile authentication unavailable');
  }
  const incoming = await headers();
  const cookie = incoming.get('cookie');
  if (!cookie) return null;
  const decoded = await readNativeSessionCookie(new Request(new URL('/api/auth/session', origin.origin), { headers: { cookie } }));
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
  const principal = decoded as Record<string, unknown>;
  const { id, email, authSessionRef, exp, iat } = principal;
  const unexpired = () => typeof exp === 'number' && Number.isSafeInteger(exp) && exp > Date.now() / 1000
    && typeof iat === 'number' && Number.isSafeInteger(iat) && iat <= Date.now() / 1000 && iat < exp;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || principal.sub !== id
    || typeof email !== 'string' || email.length > 254 || email !== email.trim().toLowerCase() || !emailPattern.test(email)
    || typeof authSessionRef !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(authSessionRef)
    || typeof principal.isAdmin !== 'boolean' || principal.isAdmin !== (!!ADMIN_EMAIL && email === ADMIN_EMAIL)
    || principal.requiresVerification !== false || principal.requiresTotp !== false || !unexpired()) return null;
  const account = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } });
  if (!account || account.id !== id || account.email !== email || !(account.emailVerified instanceof Date)
    || !Number.isFinite(account.emailVerified.getTime()) || account.emailVerified.getTime() > Date.now() || !unexpired()) return null;
  const original = Object.freeze({}) as NativeProfileSession;
  originals.set(original, { owner: Object.freeze({ userId: id, email }), expires: exp as number, used: false });
  return original;
}

function retained(original: NativeProfileSession): Original {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now() / 1000) throw Error('Profile authentication unavailable');
  return own;
}

// WeakMap identity, never fields, hashes, dates or persisted IDs, joins the
// original. Expiry only denies; it cannot extend or restore an authorization.
export function checkNativeProfile(original: NativeProfileSession): void {
  retained(original);
}

export async function dispatchNativeProfile(original: NativeProfileSession, input: unknown, key: string, beforeStep: () => void): Promise<ProfileUpdateResult> {
  const own = retained(original);
  if (own.used) throw Error('Profile authentication unavailable');
  own.used = true;
  const check = () => { beforeStep(); retained(original); };
  check();
  return updateProfileOriginal(own.owner, input, key, check);
}
