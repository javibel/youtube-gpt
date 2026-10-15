import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';

declare const manualGrantBrand: unique symbol;
export type NativeAdminManualGrant = { readonly [manualGrantBrand]: true };
type Command = Readonly<{ email: string; plan: 'pro' | 'business'; durationDays: number }>;
type AdminRow = { id: string; email: string | null; emailVerified: Date | null };
type TargetRow = { id: string; email: string | null };
type Original = { id: string; email: string; sessionRef: string; verifiedAt: number; command: Command; commandRef: string;
  subscriptionId: string; targetId: string | null; startedAt: number; periodEnd: number; deadline: number; expiresAt: number;
  origin: string; signal: AbortSignal; used: boolean; closed: boolean; admitted: boolean; createEntered: boolean; databaseAcknowledged: boolean;
  phase: 'new' | 'admission' | 'transaction' | 'denied' | 'database-ack' | 'response-created' | 'uncertain' };
const originals = new WeakMap<object, Original>();
// Fast negative fences only. The separate permanent command/target ledger also
// denies independent workers/restarts. No stored row can originate or resume us.
const commands = new Map<string, Original>(), targets = new Map<string, Original>();
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const address = (v: string) => v.length <= 254 && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(v);
const account = (id: string) => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } });
function eligible(row: AdminRow | null, id: string, email: string) {
  return !!row && row.id === id && row.email === email && row.emailVerified instanceof Date
    && Number.isFinite(row.emailVerified.getTime()) && row.emailVerified.getTime() >= 0 && row.emailVerified.getTime() <= Date.now();
}
function retained(original: NativeAdminManualGrant) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.closed || own.signal.aborted || Date.now() < own.startedAt || Date.now() >= own.expiresAt
    || performance.now() >= own.deadline || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== own.origin) throw Error('Admin manual grant unconfirmed');
  return own;
}
export function adminManualGrantInput(input: unknown): Command | null {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 3
    || !['email', 'plan', 'durationDays'].every(k => Object.hasOwn(input, k))) return null;
  const { email, plan, durationDays } = input as Record<string, unknown>;
  if (typeof email !== 'string' || email.length > 254 || (plan !== 'pro' && plan !== 'business')
    || typeof durationDays !== 'number' || !Number.isSafeInteger(durationDays) || durationDays < 1 || durationDays > 365) return null;
  const canonical = email.trim().toLowerCase(); if (!address(canonical)) return null;
  return Object.freeze({ email: canonical, plan, durationDays });
}
export async function authorizeNativeAdminManualGrant(request: Request, input: unknown, commandRef: string): Promise<NativeAdminManualGrant | null> {
  const startedAt = Date.now(), deadline = performance.now() + 25000, signal = request.signal, command = adminManualGrantInput(input);
  if (!command || !uuid(commandRef)) return null;
  const origin = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL, cookie = request.headers.get('cookie');
  if (!origin || !cookie || signal.aborted || !ADMIN_EMAIL || ADMIN_EMAIL !== ADMIN_EMAIL.trim().toLowerCase() || !address(ADMIN_EMAIL)) return null;
  let configured: URL, incoming: URL; try { configured = new URL(origin); incoming = new URL(request.url); } catch { return null; }
  if (configured.username || configured.password || configured.search || configured.hash || configured.protocol !== 'https:'
    && !(configured.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname))) return null;
  if (request.method !== 'POST' || incoming.username || incoming.password || incoming.origin !== configured.origin || incoming.pathname !== '/api/admin/grant-pro'
    || incoming.search || incoming.hash || request.headers.get('origin') !== configured.origin) return null;
  const decoded = await readNativeSessionCookie(new Request(new URL('/api/auth/session', configured.origin), { headers: { cookie }, signal }));
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
  const { id, sub, email, authSessionRef, iat, exp, isAdmin, requiresVerification, requiresTotp } = decoded;
  if (!identifier(id) || sub !== id || email !== ADMIN_EMAIL || !uuid(authSessionRef) || isAdmin !== true
    || requiresVerification !== false || requiresTotp !== false || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat > Date.now() / 1000
    || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000) || iat >= exp || exp * 1000 <= Date.now()) return null;
  const subscriptionId = crypto.randomUUID(); if (!uuid(subscriptionId)) return null;
  const own: Original = { id, email, sessionRef: authSessionRef, verifiedAt: 0, command, commandRef, subscriptionId, targetId: null,
    startedAt, periodEnd: startedAt + command.durationDays * 86400000, deadline, expiresAt: Math.min(startedAt + 25000, exp * 1000),
    origin, signal, used: false, closed: false, admitted: false, createEntered: false, databaseAcknowledged: false, phase: 'new' };
  // Capture is native and precedes the dependent lookup. Dates never come from
  // input/old subscription rows or a later retry/renewal clock.
  if (signal.aborted || Date.now() < startedAt || Date.now() >= own.expiresAt || performance.now() >= deadline) return null;
  const row = await account(id);
  if (signal.aborted || Date.now() < startedAt || Date.now() >= own.expiresAt || performance.now() >= deadline
    || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== origin || !eligible(row, id, email) || !row) return null;
  own.verifiedAt = row.emailVerified!.getTime();
  const original = Object.freeze({}) as NativeAdminManualGrant; originals.set(original, own); return original;
}
export function checkNativeAdminManualGrant(original: NativeAdminManualGrant): void { retained(original); }
export function closeNativeAdminManualGrant(original: NativeAdminManualGrant): void {
  const own = originals.get(original); if (!own) return;
  own.closed = true; if (own.createEntered && own.phase !== 'response-created') own.phase = 'uncertain'; originals.delete(original);
}
export async function applyNativeAdminManualGrant(original: NativeAdminManualGrant) {
  const own = retained(original); if (own.used) throw Error('Admin manual grant unconfirmed'); own.used = true;
  if (commands.has(own.commandRef) || targets.has(own.command.email) || commands.size >= 10000) throw Error('Admin manual grant unconfirmed');
  commands.set(own.commandRef, own); targets.set(own.command.email, own);
  try {
    own.phase = 'admission';
    // Raw Date parameters are timestamptz; normalize explicitly to UTC for the
    // timestamp columns, including intervals crossing the host's DST boundary.
    // A separate COMMIT must acknowledge admission before subscription dispatch.
    // Capture and lock the native target before persisting its negative fence.
    const admitted = await prisma.$transaction(async tx => {
      retained(original);
      const admins = await tx.$queryRaw<AdminRow[]>`SELECT id,email,"emailVerified" FROM users WHERE id=${own.id} FOR UPDATE`;
      retained(original); const admin = admins[0];
      if (admins.length !== 1 || !admin || !eligible(admin, own.id, own.email) || admin.emailVerified?.getTime() !== own.verifiedAt) throw Error('Admin manual grant unconfirmed');
      const target = await tx.user.findUnique({ where: { email: own.command.email }, select: { id: true, email: true } });
      retained(original); if (!target) return { kind: 'missing' as const };
      if (!identifier(target.id) || target.email !== own.command.email) throw Error('Admin manual grant unconfirmed');
      const targetId = target.id;
      const locked = await tx.$queryRaw<TargetRow[]>`SELECT id,email FROM users WHERE id=${targetId} FOR UPDATE`;
      retained(original); if (locked.length !== 1 || locked[0].id !== targetId || locked[0].email !== own.command.email) throw Error('Admin manual grant unconfirmed');
      const existing = await tx.subscription.findUnique({ where: { userId: targetId }, select: { id: true } });
      retained(original);
      // Every pre-existing subscription is a negative restriction, including
      // manual_admin, canceled/expired rows and rows with matching dates/IDs.
      // There is no update/cancel/renew/upsert/delete/provider path here.
      if (existing) return { kind: 'exists' as const };
      own.targetId = targetId;
      const rows = await tx.$queryRaw<{ id: string }[]>`INSERT INTO admin_manual_grant_attempts
        (id,"userId",email,"sessionRef","targetUserId","targetEmail","subscriptionId",plan,"durationDays","createdAt","periodEnd",state)
        VALUES (${own.commandRef},${own.id},${own.email},${own.sessionRef},${targetId},${own.command.email},${own.subscriptionId},${own.command.plan},${own.command.durationDays},(CAST(${new Date(own.startedAt)} AS timestamptz) AT TIME ZONE 'UTC'),(CAST(${new Date(own.periodEnd)} AS timestamptz) AT TIME ZONE 'UTC'),'pending') RETURNING id`;
      retained(original); if (rows.length !== 1 || rows[0].id !== own.commandRef) throw Error('Admin manual grant unconfirmed');
      return { kind: 'admitted' as const };
    }, { maxWait: 5000, timeout: 15000 });
    retained(original);
    if (admitted.kind !== 'admitted') { own.phase = 'denied'; return { ok: false as const, error: admitted.kind }; }
    own.admitted = true; own.phase = 'transaction';
    const targetId = own.targetId!;
    const result = await prisma.$transaction(async tx => {
      retained(original); if (!own.admitted) throw Error('Admin manual grant unconfirmed');
      const admins = await tx.$queryRaw<AdminRow[]>`SELECT id,email,"emailVerified" FROM users WHERE id=${own.id} FOR UPDATE`;
      retained(original); const admin = admins[0];
      if (admins.length !== 1 || !admin || !eligible(admin, own.id, own.email) || admin.emailVerified?.getTime() !== own.verifiedAt) throw Error('Admin manual grant unconfirmed');
      const locked = await tx.$queryRaw<TargetRow[]>`SELECT id,email FROM users WHERE id=${targetId} FOR UPDATE`;
      retained(original); if (locked.length !== 1 || locked[0].id !== targetId || locked[0].email !== own.command.email) throw Error('Admin manual grant unconfirmed');
      // This row only restricts the already retained original with its own ACK.
      const pending = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM admin_manual_grant_attempts WHERE id=${own.commandRef}
        AND "userId"=${own.id} AND email=${own.email} AND "sessionRef"=${own.sessionRef} AND "targetUserId"=${targetId}
        AND "targetEmail"=${own.command.email} AND "subscriptionId"=${own.subscriptionId} AND plan=${own.command.plan}
        AND "durationDays"=${own.command.durationDays} AND "createdAt"=(CAST(${new Date(own.startedAt)} AS timestamptz) AT TIME ZONE 'UTC') AND "periodEnd"=(CAST(${new Date(own.periodEnd)} AS timestamptz) AT TIME ZONE 'UTC')
        AND state='pending' AND "completedAt" IS NULL FOR UPDATE`;
      retained(original); if (pending.length !== 1 || pending[0].id !== own.commandRef) throw Error('Admin manual grant unconfirmed');
      const existing = await tx.subscription.findUnique({ where: { userId: targetId }, select: { id: true } });
      retained(original);
      if (existing) return { kind: 'exists' as const }; // Keep the permanent pending fence.
      own.createEntered = true;
      const value = await tx.subscription.create({ data: { id: own.subscriptionId, userId: targetId, stripeCustomerId: 'manual_admin', stripePriceId: 'manual_admin',
        status: 'active', plan: own.command.plan, cancelAtPeriodEnd: true, currentPeriodStart: new Date(own.startedAt), currentPeriodEnd: new Date(own.periodEnd) },
        select: { id: true, userId: true, stripeCustomerId: true, stripePriceId: true, status: true, plan: true, cancelAtPeriodEnd: true, currentPeriodStart: true, currentPeriodEnd: true } });
      if (!value || value.id !== own.subscriptionId || value.userId !== targetId || value.stripeCustomerId !== 'manual_admin' || value.stripePriceId !== 'manual_admin'
        || value.status !== 'active' || value.plan !== own.command.plan || value.cancelAtPeriodEnd !== true
        || !(value.currentPeriodStart instanceof Date) || value.currentPeriodStart.getTime() !== own.startedAt
        || !(value.currentPeriodEnd instanceof Date) || value.currentPeriodEnd.getTime() !== own.periodEnd) throw Error('Admin manual grant unconfirmed');
      // Completion is part of this same effect transaction, never a new effect
      // or recovery after dispatch. Both changes roll back if its ACK mismatches.
      const completed = await tx.$queryRaw<{ id: string }[]>`UPDATE admin_manual_grant_attempts SET state='completed',"completedAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        WHERE id=${own.commandRef} AND "userId"=${own.id} AND email=${own.email} AND "sessionRef"=${own.sessionRef}
        AND "targetUserId"=${targetId} AND "targetEmail"=${own.command.email} AND "subscriptionId"=${own.subscriptionId}
        AND plan=${own.command.plan} AND "durationDays"=${own.command.durationDays} AND "createdAt"=(CAST(${new Date(own.startedAt)} AS timestamptz) AT TIME ZONE 'UTC')
        AND "periodEnd"=(CAST(${new Date(own.periodEnd)} AS timestamptz) AT TIME ZONE 'UTC') AND state='pending' AND "completedAt" IS NULL RETURNING id`;
      if (completed.length !== 1 || completed[0].id !== own.commandRef) throw Error('Admin manual grant unconfirmed');
      return { kind: 'created' as const };
    }, { maxWait: 5000, timeout: 15000 });
    own.databaseAcknowledged = true; retained(original);
    if (result.kind !== 'created') { own.phase = 'denied'; return { ok: false as const, error: result.kind }; }
    own.phase = 'database-ack';
    return { ok: true as const, plan: own.command.plan, currentPeriodEnd: new Date(own.periodEnd).toISOString(), adminManualGrant: {
      commandRef: own.commandRef, subscriptionId: own.subscriptionId, targetUserId: own.targetId!, targetEmail: own.command.email, plan: own.command.plan,
      durationDays: own.command.durationDays, currentPeriodStart: new Date(own.startedAt).toISOString(), currentPeriodEnd: new Date(own.periodEnd).toISOString(),
      userId: own.id, email: own.email, asOf: own.startedAt, expiresAt: own.expiresAt } };
  } catch { own.phase = 'uncertain'; throw Error('Admin manual grant unconfirmed'); }
}
export function confirmNativeAdminManualGrant(original: NativeAdminManualGrant): void {
  const own = retained(original);
  if (own.phase !== 'database-ack' || !own.admitted || !own.createEntered || !own.databaseAcknowledged || commands.get(own.commandRef) !== own || targets.get(own.command.email) !== own) throw Error('Admin manual grant unconfirmed');
  own.phase = 'response-created';
}
