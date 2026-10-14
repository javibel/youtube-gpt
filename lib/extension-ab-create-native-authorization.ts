import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasPaidAccess, type PlanType } from '@/lib/plans';
import { createAbTest } from '@/lib/ab-test';

declare const extensionAbCreationBrand: unique symbol;
export type ExtensionAbCreation = { readonly [extensionAbCreationBrand]: true };
type Input = { videoId: string; variantA: string; variantB: string; hoursPerVariant?: number };
type Original = { token: string; tokenId: string; userId: string; email: string; verifiedAt: number;
  tokenExpires: number; capturedAt: number; expires: number; request: Request; used: boolean;
  subscription?: string; plan?: PlanType; youtube?: string; admitted?: boolean };
const originals = new WeakMap<object, Original>(), retainedOwners = new Set<string>(), retainedKeys = new Set<string>();
const lookup = (token: string, db: Pick<Prisma.TransactionClient, 'extensionToken'> = prisma) => db.extensionToken.findUnique({
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
export const validExtensionAbKey = (v: unknown): v is string => typeof v === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function extensionAbInput(value: unknown): Input | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>, title = (t: unknown): t is string => typeof t === 'string'
    && t === t.trim() && t.length > 0 && [...t].length <= 100 && !/[\x00-\x1f\x7f]/.test(t);
  if (typeof v.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(v.videoId) || !title(v.variantA) || !title(v.variantB)
    || (v.hoursPerVariant !== undefined && (typeof v.hoursPerVariant !== 'number' || !Number.isInteger(v.hoursPerVariant) || v.hoursPerVariant < 12 || v.hoursPerVariant > 168))) return null;
  return Object.freeze({ videoId: v.videoId, variantA: v.variantA, variantB: v.variantB,
    ...(v.hoursPerVariant === undefined ? {} : { hoursPerVariant: v.hoursPerVariant as number }) });
}
export async function authorizeExtensionAbCreation(request: Request): Promise<ExtensionAbCreation | null> {
  const capturedAt = Date.now(), header = request.headers.get('Authorization');
  if (request.signal.aborted || !Number.isSafeInteger(capturedAt) || capturedAt < 0 || !header || !/^Bearer [a-f0-9]{64}$/.test(header)) return null;
  const token = header.slice(7), row = await lookup(token);
  if (!eligible(row, token) || !row || !row.user.email) return null;
  const tokenExpires = row.expiresAt.getTime(), expires = Math.min(tokenExpires, capturedAt + 55000);
  if (request.signal.aborted || Date.now() < capturedAt || expires <= Date.now()) return null;
  const original = Object.freeze({}) as ExtensionAbCreation;
  originals.set(original, { token, tokenId: row.id, userId: row.user.id, email: row.user.email,
    verifiedAt: row.user.emailVerified!.getTime(), tokenExpires, capturedAt, expires, request, used: false });
  return original;
}
function retained(original: ExtensionAbCreation) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined, now = Date.now();
  if (!own || own.request.signal.aborted || now < own.capturedAt || own.expires <= now) throw Error('AB creation unconfirmed');
  return own;
}
export function checkExtensionAbCreation(original: ExtensionAbCreation): void { retained(original); }
export async function createExtensionAbOriginal(original: ExtensionAbCreation, key: string, input: Input, beforeStep: () => void) {
  const own = retained(original), accepted = extensionAbInput(input);
  if (own.used || !validExtensionAbKey(key) || !accepted) throw Error('AB creation unconfirmed');
  own.used = true;
  const check = () => { retained(original); beforeStep(); }; check();
  if (retainedOwners.has(own.userId) || retainedKeys.has(key)) throw Error('AB creation original retained');
  retainedOwners.add(own.userId); retainedKeys.add(key);
  const nativeCheck = async (tx: Prisma.TransactionClient, plan: PlanType, youtubeToken?: string) => {
    check();
    const owner = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId); check();
    if (owner.length !== 1 || owner[0].id !== own.userId || owner[0].email !== own.email) throw Error('AB owner changed');
    const row = await lookup(own.token, tx); check();
    if (!eligible(row, own.token) || !row || row.id !== own.tokenId || row.userId !== own.userId || row.user.email !== own.email
      || row.expiresAt.getTime() !== own.tokenExpires || row.user.emailVerified!.getTime() !== own.verifiedAt) throw Error('AB credential changed');
    const existing = await tx.abTestCreationAttempt.findUnique({ where: { id: key } }); check();
    if (existing && (!own.admitted || existing.userId !== own.userId || existing.videoId !== accepted.videoId || existing.state !== 'pending')) throw Error('AB key retained');
    if (own.admitted && !existing) throw Error('AB original reservation changed');
    const pending = await tx.abTestCreationAttempt.findFirst({ where: { userId: own.userId, state: { not: 'complete' }, ...(own.admitted ? { id: { not: key } } : {}) } }); check();
    if (pending) throw Error('AB predecessor unconfirmed');
    const sub = await tx.subscription.findUnique({ where: { userId: own.userId }, select: { userId: true, status: true, plan: true, stripeCustomerId: true, currentPeriodEnd: true } }); check();
    if (!sub || sub.userId !== own.userId || !hasPaidAccess(sub) || typeof sub.stripeCustomerId !== 'string' || !sub.stripeCustomerId
      || !(sub.currentPeriodEnd instanceof Date) || !Number.isFinite(sub.currentPeriodEnd.getTime())
      || plan !== (sub.plan === 'business' ? 'business' : 'pro')) throw Error('AB plan changed');
    const subscription = JSON.stringify([sub.status, sub.plan, sub.stripeCustomerId, sub.currentPeriodEnd.getTime()]);
    if (own.subscription !== undefined && (own.subscription !== subscription || own.plan !== plan)) throw Error('AB plan changed');
    own.subscription = subscription; own.plan = plan;
    if (youtubeToken !== undefined) {
      const yt = await tx.youtubeToken.findUnique({ where: { userId: own.userId }, select: { userId: true, accessToken: true, expiresAt: true } }); check();
      if (!yt || yt.userId !== own.userId || !youtubeToken || yt.accessToken !== youtubeToken || !(yt.expiresAt instanceof Date)
        || !Number.isFinite(yt.expiresAt.getTime()) || yt.expiresAt.getTime() <= Date.now()) throw Error('AB channel credential changed');
      const channel = JSON.stringify([yt.userId, yt.accessToken, yt.expiresAt.getTime()]);
      if (own.youtube !== undefined && own.youtube !== channel) throw Error('AB channel credential changed');
      own.youtube = channel;
    }
  };
  const result = await createAbTest(own.userId, accepted, check, { attemptId: key, check: nativeCheck, admitted: () => { check(); own.admitted = true; } });
  // The original helper owns completion after dispatch even when this waiter
  // retires. A lost/malformed/failed ACK keeps our negative reservation too.
  check();
  if (result.ok && (typeof result.test.id !== 'string' || !result.test.id || result.test.userId !== own.userId
    || result.test.videoId !== accepted.videoId || result.test.variantA !== accepted.variantA || result.test.variantB !== accepted.variantB
    || result.test.hoursPerVariant !== (accepted.hoursPerVariant ?? 48) || result.test.status !== 'variant_a'
    || !(result.test.startedAt instanceof Date) || !Number.isFinite(result.test.startedAt.getTime())
    || result.test.startedAt.getTime() < own.capturedAt || result.test.startedAt.getTime() > Date.now())) throw Error('AB completion ACK unconfirmed');
  if (result.ok || (result.status < 500 && !['youtube_reconnect_required'].includes(result.error))) retainedOwners.delete(own.userId);
  return result;
}
