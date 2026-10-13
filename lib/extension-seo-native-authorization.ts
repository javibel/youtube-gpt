import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
declare const seoBrand: unique symbol;
export type ExtensionSeoSession = { readonly [seoBrand]: true };
const originals = new WeakMap<object, { id: string; email: string; token: string; tokenId: string; expires: number; used: boolean }>();
// Acknowledged native telemetry only: a timestamp can suppress another event,
// never grant a session, recover an operation or release a pending admission.
const acknowledgedEvents = new Map<string, number>();
export const validSeoKey = (v: unknown): v is string => typeof v === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const lookup = (token: string, db: Pick<Prisma.TransactionClient, 'extensionToken'> = prisma) => db.extensionToken.findUnique({
  where: { token }, include: { user: { select: { id: true, email: true, emailVerified: true } } },
});
function eligible(row: Awaited<ReturnType<typeof lookup>>, token: string) {
  const now = Date.now();
  return !!row && row.token === token && typeof row.id === 'string' && !!row.id && !!row.user
    && typeof row.user.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.user.id) && row.userId === row.user.id
    && typeof row.user.email === 'string' && row.user.email.length <= 254 && row.user.email === row.user.email.trim().toLowerCase()
    && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(row.user.email)
    && row.expiresAt instanceof Date && Number.isFinite(row.expiresAt.getTime()) && row.expiresAt.getTime() > now
    && row.user.emailVerified instanceof Date && Number.isFinite(row.user.emailVerified.getTime()) && row.user.emailVerified.getTime() <= now;
}
export async function authorizeExtensionSeo(request: Request): Promise<ExtensionSeoSession | null> {
  const header = request.headers.get('Authorization');
  if (!header || !/^Bearer [a-f0-9]{64}$/.test(header)) return null;
  const token = header.slice(7), row = await lookup(token);
  if (!eligible(row, token) || !row || !row.user.email) return null;
  const original = Object.freeze({}) as ExtensionSeoSession;
  originals.set(original, { id: row.user.id, email: row.user.email, token, tokenId: row.id, expires: row.expiresAt.getTime(), used: false });
  return original;
}
function retained(original: ExtensionSeoSession) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now()) throw Error('SEO authentication unconfirmed');
  return own;
}
export function checkExtensionSeo(original: ExtensionSeoSession): void { retained(original); }
export async function runExtensionSeo<T>(original: ExtensionSeoSession, key: string, beforeStep: () => void, action: (check: () => void) => Promise<T>): Promise<T> {
  const own = retained(original);
  if (own.used || !validSeoKey(key)) throw Error('SEO operation unconfirmed');
  own.used = true;
  const check = () => { retained(original); beforeStep(); };
  const captured = Object.freeze({ id: randomUUID(), userId: own.id, key, eventId: randomUUID() });
  const matches = (row: Record<string, unknown> | null) => !!row && row.state === 'pending'
    && Object.entries(captured).every(([k, v]) => row[k] === v);
  const lock = async (tx: Prisma.TransactionClient) => {
    check();
    const users = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.id);
    check();
    if (users.length !== 1 || users[0].id !== own.id || users[0].email !== own.email) throw Error('SEO account unconfirmed');
    const token = await lookup(own.token, tx);
    check();
    if (!eligible(token, own.token) || !token || token.id !== own.tokenId || token.userId !== own.id
      || token.user.email !== own.email || token.expiresAt.getTime() !== own.expires) throw Error('SEO token unconfirmed');
  };
  check();
  const admitted = await prisma.$transaction(async tx => {
    await lock(tx);
    const prior = await tx.extensionSeoOperation.findFirst({ where: { userId: own.id, OR: [{ key }, { state: { not: 'complete' } }] } });
    check(); if (prior) throw Error('SEO original retained');
    const row = await tx.extensionSeoOperation.create({ data: { ...captured, state: 'pending' } });
    check(); return row;
  }, { maxWait: 10_000, timeout: 15_000 });
  if (!matches(admitted)) throw Error('SEO admission unconfirmed');
  check();
  if (Date.now() - (acknowledgedEvents.get(own.id) ?? -Infinity) >= 600_000) {
    const event = await prisma.$transaction(async tx => {
      await lock(tx);
      const row = await tx.extensionSeoOperation.findUnique({ where: { id: captured.id } });
      check(); if (!matches(row)) throw Error('SEO original unconfirmed');
      // Once dispatched, retain this writer's promise. HTTP retirement does not
      // replay it, delete its marker or turn a row into a completion ACK.
      return tx.extensionEvent.create({ data: { id: captured.eventId, userId: own.id, action: 'seo-quick' } });
    }, { maxWait: 10_000, timeout: 15_000 });
    if (event.id !== captured.eventId || event.userId !== own.id || event.action !== 'seo-quick') throw Error('SEO event unconfirmed');
    acknowledgedEvents.set(own.id, Date.now());
  }
  check();
  const result = await action(check);
  check();
  const completed = await prisma.$transaction(async tx => {
    await lock(tx);
    const row = await tx.extensionSeoOperation.findUnique({ where: { id: captured.id } });
    check(); if (!matches(row)) throw Error('SEO original unconfirmed');
    return tx.extensionSeoOperation.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
  }, { maxWait: 10_000, timeout: 15_000 });
  if (completed.count !== 1) throw Error('SEO completion unconfirmed');
  check(); return result;
}
