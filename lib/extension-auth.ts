import { prisma } from './prisma';

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

  return {
    user: { id: ext.user.id, email: ext.user.email, name: ext.user.name },
    isPro: ext.user.subscription?.status === 'active',
  };
}
