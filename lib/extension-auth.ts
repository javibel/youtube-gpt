import { prisma } from './prisma';
import { isPaidStatus } from './plans';

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
          subscription: { select: { status: true } },
        },
      },
    },
  });

  if (!ext || ext.expiresAt < new Date()) return null;

  await recordExtensionUse(ext.user.id, request);

  return {
    user: { id: ext.user.id, email: ext.user.email, name: ext.user.name },
    isPro: isPaidStatus(ext.user.subscription?.status),
  };
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
