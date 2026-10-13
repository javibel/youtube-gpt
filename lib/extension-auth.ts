import { prisma } from './prisma';
import { hasPaidAccess } from './plans';

export interface ExtensionUser {
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
  isPro: boolean;
}

export async function getExtensionUser(request: Request): Promise<ExtensionUser | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const ext = await prisma.extensionToken.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          subscription: { select: { status: true, stripeCustomerId: true, currentPeriodEnd: true } },
        },
      },
    },
  });

  if (!ext || ext.expiresAt < new Date()) return null;

  await recordExtensionUse(ext.user.id, request);

  return {
    user: { id: ext.user.id, email: ext.user.email, name: ext.user.name },
    isPro: hasPaidAccess(ext.user.subscription),
  };
}

declare const extensionCoachBrand: unique symbol;
export type ExtensionCoachSession = { readonly [extensionCoachBrand]: true };
type CoachOwner = Readonly<{ id: string; email: string; isPro: boolean }>;
const coachOriginals = new WeakMap<object, { owner: CoachOwner; expires: number; request: Request; used: boolean }>();

// A current incoming extension credential is checked against its own token and
// account. Neither a returned user row nor a receipt can construct this permit.
export async function authorizeExtensionCoach(request: Request): Promise<ExtensionCoachSession | null> {
  const header = request.headers.get('Authorization');
  if (!header || !/^Bearer [a-f0-9]{64}$/.test(header)) return null;
  const token = header.slice(7);
  const ext = await prisma.extensionToken.findUnique({
    where: { token },
    include: { user: { select: {
      id: true, email: true, emailVerified: true,
      subscription: { select: { status: true, stripeCustomerId: true, currentPeriodEnd: true } },
    } } },
  });
  const now = Date.now();
  if (!ext || !ext.user || ext.token !== token || ext.userId !== ext.user.id
    || typeof ext.user.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(ext.user.id)
    || typeof ext.user.email !== 'string' || ext.user.email.length > 254
    || ext.user.email !== ext.user.email.trim().toLowerCase()
    || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(ext.user.email)
    || !(ext.expiresAt instanceof Date) || !Number.isFinite(ext.expiresAt.getTime()) || ext.expiresAt.getTime() <= now
    || !(ext.user.emailVerified instanceof Date) || !Number.isFinite(ext.user.emailVerified.getTime()) || ext.user.emailVerified.getTime() > now) return null;
  const original = Object.freeze({}) as ExtensionCoachSession;
  coachOriginals.set(original, { owner: Object.freeze({ id: ext.user.id, email: ext.user.email, isPro: hasPaidAccess(ext.user.subscription) }), expires: ext.expiresAt.getTime(), request, used: false });
  return original;
}
function retainedCoach(original: ExtensionCoachSession) {
  const own = original && typeof original === 'object' ? coachOriginals.get(original) : undefined;
  if (!own || own.expires <= Date.now()) throw Error('Coach extension authentication unavailable');
  return own;
}
export async function runExtensionCoach<T>(original: ExtensionCoachSession, action: (owner: CoachOwner, check: () => void) => Promise<T>): Promise<T> {
  const own = retainedCoach(original);
  if (own.used) throw Error('Coach extension authentication unavailable');
  own.used = true;
  await recordExtensionUse(own.owner.id, own.request);
  retainedCoach(original);
  const result = await action(own.owner, () => { retainedCoach(original); });
  retainedCoach(original);
  return result;
}

// Señal de retención: registra que el usuario ha usado la extensión.
// Throttle en memoria (por instancia) para no anotar cada poll: 1 evento / usuario / 10 min.
// Nunca lanza — un fallo aquí no debe tumbar la autenticación de la extensión.
const lastSeen = new Map<string, number>();
const THROTTLE_MS = 10 * 60 * 1000;

async function recordExtensionUse(userId: string, request: Request): Promise<void> {
  try {
    const now = Date.now();
    if (now - (lastSeen.get(userId) ?? 0) < THROTTLE_MS) return;
    lastSeen.set(userId, now);
    const action = new URL(request.url).pathname.replace('/api/extension/', '').replace(/\/$/, '') || 'unknown';
    await prisma.extensionEvent.create({ data: { userId, action } });
  } catch {
    /* noop */
  }
}
