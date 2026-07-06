import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isPaidStatus } from '@/lib/plans';

export async function GET(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const extToken = await prisma.extensionToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!extToken || extToken.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId: extToken.user.id },
      select: { status: true },
    });

    const isPro = isPaidStatus(subscription?.status);

    return NextResponse.json({
      name: extToken.user.name,
      email: extToken.user.email,
      isPro,
    });
  } catch (err) {
    console.error('[extension/me]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
