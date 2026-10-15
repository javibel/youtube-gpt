import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';
import { validatePassword } from '@/lib/password';
import bcrypt from 'bcryptjs';

declare const adminUserCreationBrand: unique symbol;
export type NativeAdminUserCreation = { readonly [adminUserCreationBrand]: true };
type Command = Readonly<{ email: string; name: string | null; password: string }>;
type AdminRow = { id: string; email: string | null; emailVerified: Date | null };
type Original = { id: string; email: string; sessionRef: string; verifiedAt: number;
  targetEmail: string; targetName: string | null; targetId: string; password: string | null; commandRef: string;
  startedAt: number; deadline: number; expiresAt: number; origin: string; signal: AbortSignal;
  used: boolean; closed: boolean; createEntered: boolean; databaseAcknowledged: boolean;
  phase: 'new' | 'hashing' | 'transaction' | 'duplicate' | 'database-ack' | 'response-created' | 'uncertain' };
const originals = new WeakMap<object, Original>();
// Negative process-local fences only: no TTL/reset/recovery. Durable command and
// target coordination across workers/restarts remains required before activation.
const commands = new Map<string, Original>(), targets = new Map<string, Original>();
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const address = (value: string) => value.length <= 254
  && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(value);
const account = (id: string) => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } });
function eligible(row: AdminRow | null, id: string, email: string) {
  return !!row && row.id === id && row.email === email && row.emailVerified instanceof Date
    && Number.isFinite(row.emailVerified.getTime()) && row.emailVerified.getTime() >= 0 && row.emailVerified.getTime() <= Date.now();
}
function check(own: Original) {
  if (own.closed || own.signal.aborted || Date.now() < own.startedAt || Date.now() >= own.expiresAt
    || performance.now() >= own.deadline || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== own.origin) throw Error('Admin user creation unconfirmed');
}
function retained(original: NativeAdminUserCreation) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own) throw Error('Admin user creation unconfirmed');
  check(own); return own;
}
export function adminUserCreationInput(value: unknown): Command | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length < 2 || keys.length > 3 || keys.some(k => !['email', 'name', 'password'].includes(k))
    || !Object.hasOwn(value, 'email') || !Object.hasOwn(value, 'password')) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.email !== 'string' || input.email.length > 254 || typeof input.password !== 'string'
    || input.name !== undefined && input.name !== null && typeof input.name !== 'string') return null;
  const email = input.email.trim().toLowerCase(), name = typeof input.name === 'string' ? input.name.trim() || null : null, password = input.password;
  // Reject bcrypt's72-byte UTF-8 truncation, never silently change a credential.
  if (!address(email) || name !== null && (name.length > 200 || /[\x00-\x1f\x7f]/.test(name))
    || /[\x00-\x1f\x7f]/.test(password) || new TextEncoder().encode(password).length > 72 || validatePassword(password)) return null;
  return Object.freeze({ email, name, password });
}
export async function authorizeNativeAdminUserCreation(request: Request, input: unknown, commandRef: string): Promise<NativeAdminUserCreation | null> {
  const startedAt = Date.now(), deadline = performance.now() + 25_000, signal = request.signal;
  const command = adminUserCreationInput(input); if (!command || !uuid(commandRef)) return null;
  const origin = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL, cookie = request.headers.get('cookie');
  if (!origin || !cookie || signal.aborted || !ADMIN_EMAIL || ADMIN_EMAIL !== ADMIN_EMAIL.trim().toLowerCase() || !address(ADMIN_EMAIL)) return null;
  let configured: URL, incoming: URL;
  try { configured = new URL(origin); incoming = new URL(request.url); } catch { return null; }
  if (configured.username || configured.password || configured.search || configured.hash || configured.protocol !== 'https:'
    && !(configured.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname))) return null;
  if (request.method !== 'POST' || incoming.origin !== configured.origin || incoming.pathname !== '/api/admin/create-user'
    || incoming.search || incoming.hash || request.headers.get('origin') !== configured.origin) return null;
  const decoded = await readNativeSessionCookie(new Request(new URL('/api/auth/session', configured.origin), { headers: { cookie }, signal }));
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
  const { id, sub, email, authSessionRef, iat, exp, isAdmin, requiresVerification, requiresTotp } = decoded;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || sub !== id || email !== ADMIN_EMAIL || !uuid(authSessionRef)
    || isAdmin !== true || requiresVerification !== false || requiresTotp !== false || typeof iat !== 'number' || !Number.isSafeInteger(iat)
    || iat < 0 || iat > Date.now() / 1000 || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000)
    || iat >= exp || exp * 1000 <= Date.now()) return null;
  const targetId = crypto.randomUUID(); if (!uuid(targetId)) return null;
  const own: Original = { id, email, sessionRef: authSessionRef, verifiedAt: 0, targetEmail: command.email, targetName: command.name,
    targetId, password: command.password, commandRef, startedAt, deadline, expiresAt: Math.min(startedAt + 25_000, exp * 1000),
    origin, signal, used: false, closed: false, createEntered: false, databaseAcknowledged: false, phase: 'new' };
  check(own); const row = await account(id); check(own);
  if (!eligible(row, id, email) || !row) { own.password = null; return null; }
  own.verifiedAt = row.emailVerified!.getTime();
  const original = Object.freeze({}) as NativeAdminUserCreation; originals.set(original, own); return original;
}
export function checkNativeAdminUserCreation(original: NativeAdminUserCreation): void { retained(original); }
export function closeNativeAdminUserCreation(original: NativeAdminUserCreation): void {
  const own = originals.get(original); if (!own) return;
  own.closed = true; own.password = null;
  if (own.createEntered && own.phase !== 'response-created') own.phase = 'uncertain';
  originals.delete(original);
}
export async function applyNativeAdminUserCreation(original: NativeAdminUserCreation) {
  const own = retained(original); if (own.used) throw Error('Admin user creation unconfirmed'); own.used = true;
  if (commands.has(own.commandRef) || targets.has(own.targetEmail) || commands.size >= 10000) { own.password = null; throw Error('Admin user creation unconfirmed'); }
  commands.set(own.commandRef, own); targets.set(own.targetEmail, own);
  try {
    own.phase = 'hashing'; const password = own.password; own.password = null;
    if (!password) throw Error('Admin user creation unconfirmed');
    const hashedPassword = await bcrypt.hash(password, 12); retained(original);
    if (typeof hashedPassword !== 'string' || !/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(hashedPassword)) throw Error('Admin user creation unconfirmed');
    own.phase = 'transaction';
    const created = await prisma.$transaction(async tx => {
      retained(original);
      const rows = await tx.$queryRaw<AdminRow[]>`SELECT id,email,"emailVerified" FROM users WHERE id=${own.id} FOR UPDATE`;
      retained(original); const row = rows[0];
      if (rows.length !== 1 || !row || !eligible(row, own.id, own.email) || row.emailVerified?.getTime() !== own.verifiedAt) throw Error('Admin user creation unconfirmed');
      const existing = await tx.user.findUnique({ where: { email: own.targetEmail }, select: { id: true } });
      retained(original); if (existing) return null; // denial only, never adoption
      own.createEntered = true;
      const value = await tx.user.create({ data: { id: own.targetId, email: own.targetEmail, name: own.targetName, password: hashedPassword }, select: { id: true, email: true, name: true } });
      if (!value || value.id !== own.targetId || value.email !== own.targetEmail || value.name !== own.targetName) throw Error('Admin user creation unconfirmed');
      // This same producer completes after dispatch even if HTTP retires.
      // No dependent business action or late session refresh follows create.
      return { id: value.id, email: value.email, name: value.name };
    }, { maxWait: 5000, timeout: 15000 });
    own.databaseAcknowledged = true; retained(original);
    if (!created) { own.phase = 'duplicate'; return { ok: false as const, error: 'admin_user_creation_exists' }; }
    own.phase = 'database-ack';
    return { ok: true as const, user: created, adminUserCreation: { commandRef: own.commandRef, targetUserId: own.targetId,
      targetEmail: own.targetEmail, userId: own.id, email: own.email, asOf: own.startedAt, expiresAt: own.expiresAt } };
  } catch { own.phase = 'uncertain'; throw Error('Admin user creation unconfirmed'); }
  finally { own.password = null; }
}
// Only original create/SQL ACK plus response construction, never browser delivery
// or a status lookup; neither negative fence is released.
export function confirmNativeAdminUserCreation(original: NativeAdminUserCreation): void {
  const own = retained(original);
  if (own.phase !== 'database-ack' || !own.createEntered || !own.databaseAcknowledged || targets.get(own.targetEmail) !== own) throw Error('Admin user creation unconfirmed');
  own.phase = 'response-created';
}
