import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// 90 days token validity
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
    });

    if (!user?.password) {
      return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    const match = await bcrypt.compare(String(password), user.password);
    if (!match) {
      return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        { error: 'Verifica tu email antes de usar la extensión' },
        { status: 403 }
      );
    }

    // Delete any expired tokens for this user (cleanup)
    await prisma.extensionToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.extensionToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    const isPro = subscription?.status === 'active';

    return NextResponse.json({ token, name: user.name, email: user.email, isPro });
  } catch (err) {
    console.error('[extension/login]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
