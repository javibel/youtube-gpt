import { prisma } from '@/lib/prisma';
import { hasPaidAccess } from '@/lib/plans';

declare const extensionCompetitorBrand: unique symbol;
export type ExtensionCompetitorAnalysis = { readonly [extensionCompetitorBrand]: true };
type Original = { token: string; tokenId: string; userId: string; email: string; verifiedAt: number; readRef: string;
  tokenExpires: number; capturedAt: number; expires: number; request: Request; used: boolean; subscription?: string };
const originals = new WeakMap<object, Original>();
const lookup = (token: string) => prisma.extensionToken.findUnique({ where: { token },
  include: { user: { select: { id: true, email: true, emailVerified: true } } } });
function eligible(row: Awaited<ReturnType<typeof lookup>>, token: string) {
  const now = Date.now();
  return !!row && row.token === token && typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 128
    && !!row.user && typeof row.user.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.user.id) && row.userId === row.user.id
    && typeof row.user.email === 'string' && row.user.email.length <= 254 && row.user.email === row.user.email.trim().toLowerCase()
    && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(row.user.email)
    && row.expiresAt instanceof Date && Number.isFinite(row.expiresAt.getTime()) && row.expiresAt.getTime() > now
    && row.user.emailVerified instanceof Date && Number.isFinite(row.user.emailVerified.getTime()) && row.user.emailVerified.getTime() <= now;
}
export async function authorizeExtensionCompetitorAnalysis(request: Request): Promise<ExtensionCompetitorAnalysis | null> {
  const capturedAt = Date.now(), header = request.headers.get('Authorization'), readRef = request.headers.get('x-ytv-read-ref');
  if (request.signal.aborted || !Number.isSafeInteger(capturedAt) || capturedAt < 0 || !header || !/^Bearer [a-f0-9]{64}$/.test(header)
    || !readRef || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(readRef)) return null;
  const token = header.slice(7), row = await lookup(token);
  if (!eligible(row, token) || !row || !row.user.email) return null;
  const tokenExpires = row.expiresAt.getTime(), expires = Math.min(tokenExpires, capturedAt + 25000);
  if (request.signal.aborted || Date.now() < capturedAt || expires <= Date.now()) return null;
  const original = Object.freeze({}) as ExtensionCompetitorAnalysis;
  originals.set(original, { token, tokenId: row.id, userId: row.user.id, email: row.user.email, readRef,
    verifiedAt: row.user.emailVerified!.getTime(), tokenExpires, capturedAt, expires, request, used: false });
  return original;
}
function retained(original: ExtensionCompetitorAnalysis) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined, now = Date.now();
  if (!own || own.request.signal.aborted || now < own.capturedAt || own.expires <= now) throw Error('Competitor extension original unavailable');
  return own;
}
export function checkExtensionCompetitorAnalysis(original: ExtensionCompetitorAnalysis): void { retained(original); }
const subscription = (userId: string) => prisma.subscription.findUnique({ where: { userId },
  select: { userId: true, status: true, plan: true, stripeCustomerId: true, currentPeriodEnd: true } });
function paidSnapshot(sub: Awaited<ReturnType<typeof subscription>>, userId: string): string | null {
  if (!sub || !['active', 'trialing'].includes(sub.status)) return null;
  // A malformed paid row cannot inherit the legacy Pro fallback.
  if (!sub || sub.userId !== userId || !['pro', 'business'].includes(sub.plan)
    || typeof sub.stripeCustomerId !== 'string' || !sub.stripeCustomerId
    || !(sub.currentPeriodEnd instanceof Date) || !Number.isFinite(sub.currentPeriodEnd.getTime())) throw Error('Competitor extension plan unavailable');
  if (!hasPaidAccess(sub)) return null;
  return JSON.stringify([sub.userId, sub.status, sub.plan, sub.stripeCustomerId, sub.currentPeriodEnd.getTime()]);
}
async function credentialUnchanged(own: Original, check: () => void) {
  const row = await lookup(own.token); check();
  if (!eligible(row, own.token) || !row || row.id !== own.tokenId || row.userId !== own.userId
    || row.user.email !== own.email || row.expiresAt.getTime() !== own.tokenExpires
    || row.user.emailVerified!.getTime() !== own.verifiedAt) throw Error('Competitor extension credential changed');
}
export async function readExtensionCompetitorOwner(original: ExtensionCompetitorAnalysis, beforeStep: () => void) {
  const own = retained(original); if (own.used) throw Error('Competitor extension original already used'); own.used = true;
  const check = () => { retained(original); beforeStep(); }; check();
  const sub = await subscription(own.userId); check(); await credentialUnchanged(own, check);
  const snapshot = paidSnapshot(sub, own.userId); check();
  if (snapshot === null) return null;
  own.subscription = snapshot;
  return Object.freeze({ userId: own.userId, readRef: own.readRef, observedAt: new Date(own.capturedAt).toISOString(), expiresAt: own.expires });
}
export async function recheckExtensionCompetitorAnalysis(original: ExtensionCompetitorAnalysis, beforeStep: () => void): Promise<void> {
  const own = retained(original); if (!own.used || own.subscription === undefined) throw Error('Competitor extension purpose unavailable');
  const check = () => { retained(original); beforeStep(); }; check();
  await credentialUnchanged(own, check);
  const sub = await subscription(own.userId); check();
  // These reads can only deny the captured owner/plan. They never renew its
  // horizon, choose another account, register activity or authorize mutations.
  if (paidSnapshot(sub, own.userId) !== own.subscription) throw Error('Competitor extension plan changed');
  check();
}
