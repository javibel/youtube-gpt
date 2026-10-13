import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { readNativeVerifiedUser } from '@/lib/native-user-session';
import { hasPaidAccess } from '@/lib/plans';
import type { Prisma } from '@prisma/client';

declare const nativeTokenBrand: unique symbol;
export type NativeExtensionToken = { readonly [nativeTokenBrand]: true };
const originals = new WeakMap<object, { id: string; email: string; expires: number; used: boolean; passwordHash?: string }>();
const keyPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const validExtensionTokenKey = (key: unknown): key is string => typeof key === 'string' && keyPattern.test(key);
const TTL = 90 * 24 * 60 * 60 * 1000;
export async function authorizeNativeExtensionToken(): Promise<NativeExtensionToken | null> {
  const principal = await readNativeVerifiedUser();
  if (!principal) return null;
  const original = Object.freeze({}) as NativeExtensionToken;
  originals.set(original, { id: principal.id, email: principal.email, expires: principal.expires, used: false });
  return original;
}
// This entry constructs authority only after the original password and, where
// configured, the same account factor used by native credentials have succeeded.
// No caller-provided id, role, expiry or stored issuance can construct a grant.
export async function authorizeNativeExtensionPassword(input: unknown, beforeStep: () => void): Promise<NativeExtensionToken | 'invalid_credentials' | 'email_unverified'> {
  const expires = Date.now() / 1000 + 55;
  const check = () => { beforeStep(); if (Date.now() / 1000 >= expires) throw Error('Extension credentials unconfirmed'); };
  check();
  if (!input || typeof input !== 'object') return 'invalid_credentials';
  const { email, password, totp } = input as Record<string, unknown>;
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string'
    || !password || password.length > 1024) return 'invalid_credentials';
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return 'invalid_credentials';
  const user = await prisma.user.findUnique({ where: { email: normalized },
    select: { id: true, email: true, password: true, emailVerified: true } });
  check();
  if (!user || typeof user.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(user.id)
    || user.email !== normalized || typeof user.password !== 'string' || !user.password) return 'invalid_credentials';
  const captured = Object.freeze({ id: user.id, email: user.email, passwordHash: user.password,
    verifiedAt: user.emailVerified instanceof Date ? user.emailVerified.getTime() : NaN });
  const { default: bcrypt } = await import('bcryptjs');
  check();
  const matched = await bcrypt.compare(password, captured.passwordHash);
  check();
  if (matched !== true) return 'invalid_credentials';
  if (!Number.isFinite(captured.verifiedAt) || captured.verifiedAt > Date.now()) return 'email_unverified';
  const secret = process.env.ADMIN_TOTP_SECRET;
  const { ADMIN_EMAIL } = await import('@/lib/admin-email');
  check();
  if (ADMIN_EMAIL && captured.email === ADMIN_EMAIL && secret) {
    if (typeof totp !== 'string' || !/^\d{6}$/.test(totp.trim())) return 'invalid_credentials';
    const { rateLimitDb } = await import('@/lib/rate-limit-db');
    const { consumeAdminTotp } = await import('@/lib/admin-totp-consumption');
    check();
    const allowed = await rateLimitDb(`admin-totp-factor:${captured.id}`, 10, 15, true);
    check();
    if (allowed !== true) return 'invalid_credentials';
    const consumed = await consumeAdminTotp(captured.id, totp.trim(), secret);
    check();
    if (consumed !== true) return 'invalid_credentials';
  }
  check();
  const original = Object.freeze({}) as NativeExtensionToken;
  originals.set(original, { ...captured, expires, used: false });
  return original;
}
function retained(original: NativeExtensionToken) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now() / 1000) throw Error('Extension token authentication unavailable');
  return own;
}
export function checkNativeExtensionToken(original: NativeExtensionToken): void { retained(original); }
export async function mintNativeExtensionToken(original: NativeExtensionToken, key: string, beforeStep: () => void) {
  const own = retained(original);
  if (own.used || !validExtensionTokenKey(key)) throw Error('Extension token issuance unavailable');
  own.used = true;
  const check = () => { retained(original); beforeStep(); };
  check();
  const captured = Object.freeze({ id: randomUUID(), userId: own.id, key, tokenId: randomUUID() });
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TTL);
  const matches = (row: Record<string, unknown> | null) => !!row && row.state === 'pending'
    && Object.entries(captured).every(([field, value]) => row[field] === value);
  const prior = () => ({ userId: own.id, OR: [{ key }, { state: { not: 'complete' } }] });
  const lock = async (tx: Prisma.TransactionClient) => {
    check();
    const rows = await tx.$queryRawUnsafe<Array<{ id: string; email: string; name: string | null; emailVerified: Date | null; password?: string }>>(
      own.passwordHash === undefined ? 'SELECT id,email,name,"emailVerified" FROM users WHERE id=$1 FOR UPDATE'
        : 'SELECT id,email,name,"emailVerified",password FROM users WHERE id=$1 FOR UPDATE', own.id);
    check();
    if (rows.length !== 1 || rows[0].id !== own.id || rows[0].email !== own.email
      || !(rows[0].emailVerified instanceof Date) || !Number.isFinite(rows[0].emailVerified.getTime())
      || rows[0].emailVerified.getTime() > Date.now()
      || (own.passwordHash !== undefined && rows[0].password !== own.passwordHash)) throw Error('Extension token account unavailable');
    return rows[0];
  };
  const admission = await prisma.$transaction(async tx => {
    await lock(tx);
    const earlier = await tx.extensionTokenIssuance.findFirst({ where: prior() });
    check();
    if (earlier) throw Error('Extension token issuance retained');
    const row = await tx.extensionTokenIssuance.create({ data: { ...captured, state: 'pending' } });
    check(); return row;
  }, { maxWait: 10_000, timeout: 15_000 });
  if (!matches(admission)) throw Error('Extension token admission unconfirmed');
  check();
  const result = await prisma.$transaction(async tx => {
    const user = await lock(tx);
    const row = await tx.extensionTokenIssuance.findUnique({ where: { id: captured.id } });
    check();
    if (!matches(row)) throw Error('Extension token issuance unconfirmed');
    // Once dispatched, this atomic producer retains cleanup/create/completion.
    // HTTP retirement does not interrupt, replay or recover these writes.
    await tx.extensionToken.deleteMany({ where: { userId: own.id, expiresAt: { lt: new Date() } } });
    const created = await tx.extensionToken.create({ data: { id: captured.tokenId, userId: own.id, token, expiresAt } });
    if (created.id !== captured.tokenId || created.userId !== own.id || created.token !== token
      || !(created.expiresAt instanceof Date) || created.expiresAt.getTime() !== expiresAt.getTime()) throw Error('Extension token write unconfirmed');
    const marked = await tx.extensionTokenIssuance.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
    if (marked.count !== 1) throw Error('Extension token completion unconfirmed');
    return { name: user.name, token };
  }, { maxWait: 10_000, timeout: 15_000 });
  check();
  const subscription = await prisma.subscription.findUnique({ where: { userId: own.id },
    select: { status: true, stripeCustomerId: true, currentPeriodEnd: true } });
  check();
  return { key, userId: own.id, token: result.token, name: result.name, email: own.email, isPro: hasPaidAccess(subscription) };
}
