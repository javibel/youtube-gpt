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

const THROTTLE_MS = 10 * 60 * 1000;
const lastSeen = new Map<string, number>();

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
