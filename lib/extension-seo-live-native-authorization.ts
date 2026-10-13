import { prisma } from '@/lib/prisma';
import { validSeoLiveInput, type SeoLiveInput } from '@/lib/extension-seo-live-input';
import { scoreSeoLiveInput } from '@/lib/extension-seo-live-score';

declare const extensionSeoLiveBrand: unique symbol;
export type ExtensionSeoLiveSession = { readonly [extensionSeoLiveBrand]: true };
type Owner = Readonly<{ id: string; email: string; name: string | null }>;
const originals = new WeakMap<object, { owner: Owner; token: string; tokenId: string; expires: number; used: boolean }>();
const emailPattern = /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/;
export const validExtensionReadRef = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const selectUser = { id: true, email: true, name: true, emailVerified: true } as const;
function eligible(row: Awaited<ReturnType<typeof lookup>>, token: string) {
  const now = Date.now();
  return !!row && row.token === token && typeof row.id === 'string' && !!row.id
    && !!row.user && typeof row.user.id === 'string' && row.userId === row.user.id
    && /^[A-Za-z0-9_-]{1,128}$/.test(row.user.id)
    && typeof row.user.email === 'string' && row.user.email.length <= 254
    && row.user.email === row.user.email.trim().toLowerCase() && emailPattern.test(row.user.email)
    && (row.user.name === null || typeof row.user.name === 'string')
    && row.expiresAt instanceof Date && Number.isFinite(row.expiresAt.getTime()) && row.expiresAt.getTime() > now
    && row.user.emailVerified instanceof Date && Number.isFinite(row.user.emailVerified.getTime())
    && row.user.emailVerified.getTime() <= now;
}
const lookup = (token: string) => prisma.extensionToken.findUnique({ where: { token }, include: { user: { select: selectUser } } });
export async function authorizeExtensionSeoLive(request: Request): Promise<ExtensionSeoLiveSession | null> {
  const header = request.headers.get('Authorization');
  if (!header || !/^Bearer [a-f0-9]{64}$/.test(header)) return null;
  const token = header.slice(7), row = await lookup(token);
  if (!eligible(row, token) || !row || !row.user.email) return null;
  const original = Object.freeze({}) as ExtensionSeoLiveSession;
  originals.set(original, { owner: Object.freeze({ id: row.user.id, email: row.user.email, name: row.user.name }),
    token, tokenId: row.id, expires: row.expiresAt.getTime(), used: false });
  return original;
}
function retained(original: ExtensionSeoLiveSession) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now()) throw Error('Extension identity unconfirmed');
  return own;
}
export function checkExtensionSeoLive(original: ExtensionSeoLiveSession): void { retained(original); }
export async function analyzeExtensionSeoLive(original: ExtensionSeoLiveSession, input: SeoLiveInput, readRef: string, beforeStep: () => void) {
  const own = retained(original);
  if (own.used || !validExtensionReadRef(readRef) || !validSeoLiveInput(input)) throw Error('Extension identity unconfirmed');
  own.used = true;
  const check = () => { retained(original); beforeStep(); };
  check();
  // This fresh read can only revoke the original grant, never select another
  // owner or renew the token horizon captured by the incoming credential.
  const current = await lookup(own.token);
  check();
  if (!eligible(current, own.token) || !current || current.id !== own.tokenId
    || current.userId !== own.owner.id || current.user.email !== own.owner.email
    || current.expiresAt.getTime() !== own.expires) throw Error('Extension identity unconfirmed');
  const result = { ...scoreSeoLiveInput(input), readRef, expiresAt:own.expires };
  check(); return result;
}
