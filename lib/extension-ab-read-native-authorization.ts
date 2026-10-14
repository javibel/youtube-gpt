import { prisma } from '@/lib/prisma';

declare const extensionAbReadBrand: unique symbol;
export type ExtensionAbRead = { readonly [extensionAbReadBrand]: true };
type Original = {
  token: string; tokenId: string; ownerId: string; email: string;
  tokenExpires: number; verifiedAt: number; capturedAt: number; expires: number;
  request: Request; used: boolean;
};
const originals = new WeakMap<object, Original>();
const lookup = (token: string) => prisma.extensionToken.findUnique({
  where: { token }, include: { user: { select: { id: true, email: true, emailVerified: true } } },
});
function eligible(row: Awaited<ReturnType<typeof lookup>>, token: string) {
  const now = Date.now();
  return !!row && row.token === token && typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 128
    && !!row.user && typeof row.user.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.user.id) && row.userId === row.user.id
    && typeof row.user.email === 'string' && row.user.email.length <= 254 && row.user.email === row.user.email.trim().toLowerCase()
    && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(row.user.email)
    && row.expiresAt instanceof Date && Number.isFinite(row.expiresAt.getTime()) && row.expiresAt.getTime() > now
    && row.user.emailVerified instanceof Date && Number.isFinite(row.user.emailVerified.getTime()) && row.user.emailVerified.getTime() <= now;
}
export async function authorizeExtensionAbRead(request: Request): Promise<ExtensionAbRead | null> {
  const capturedAt = Date.now(), header = request.headers.get('Authorization');
  if (request.signal.aborted || !Number.isSafeInteger(capturedAt) || capturedAt < 0 || !header || !/^Bearer [a-f0-9]{64}$/.test(header)) return null;
  const token = header.slice(7), row = await lookup(token);
  if (!eligible(row, token) || !row || !row.user.email) return null;
  const tokenExpires = row.expiresAt.getTime(), expires = Math.min(tokenExpires, capturedAt + 25000);
  if (request.signal.aborted || Date.now() < capturedAt || expires <= Date.now()) return null;
  const original = Object.freeze({}) as ExtensionAbRead;
  originals.set(original, { token, tokenId: row.id, ownerId: row.user.id, email: row.user.email,
    tokenExpires, verifiedAt: row.user.emailVerified!.getTime(), capturedAt, expires, request, used: false });
  return original;
}
function retained(original: ExtensionAbRead) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined, now = Date.now();
  if (!own || own.request.signal.aborted || now < own.capturedAt || own.expires <= now) throw Error('AB count unconfirmed');
  return own;
}
export function checkExtensionAbRead(original: ExtensionAbRead): void { retained(original); }
export async function readExtensionAbCount(original: ExtensionAbRead, beforeStep: () => void) {
  const own = retained(original);
  if (own.used) throw Error('AB count unconfirmed');
  own.used = true;
  const check = () => { retained(original); beforeStep(); };
  check();
  // This reader does not import the title producer or write a usage event.
  const active = await prisma.abTest.count({ where: { userId: own.ownerId, status: { in: ['variant_a', 'variant_b'] } } });
  check();
  if (!Number.isSafeInteger(active) || active < 0) throw Error('AB count unconfirmed');
  const current = await lookup(own.token);
  check();
  // The fresh credential read may only deny a changed original. It cannot
  // choose another owner, renew the horizon or create mutation authority.
  if (!eligible(current, own.token) || !current || current.id !== own.tokenId || current.userId !== own.ownerId
    || current.user.email !== own.email || current.expiresAt.getTime() !== own.tokenExpires
    || current.user.emailVerified!.getTime() !== own.verifiedAt) throw Error('AB count unconfirmed');
  const result = Object.freeze({ active, observedAt: new Date(own.capturedAt).toISOString(), expiresAt: own.expires });
  check(); return result;
}
