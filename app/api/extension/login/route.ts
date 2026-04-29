import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// 90 days token validity
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    // Rate limit: max 5 attempts per IP per 15 minutes — atomic upsert in DB (cross-instance safe)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown';
    const rlKey = `ext-login:${ip}`;
    const rlResult = await prisma.$queryRaw<{ hits: number }[]>`
      INSERT INTO rate_limits (key, hits, window_start)
      VALUES (${rlKey}, 1, NOW())
      ON CONFLICT (key) DO UPDATE
      SET
        hits = CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '15 minutes'
          THEN 1
          ELSE rate_limits.hits + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '15 minutes'
          THEN NOW()
          ELSE rate_limits.window_start
        END
      RETURNING hits
    `;
    if (Number(rlResult[0].hits) > 5) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Espera unos minutos.' },
        { status: 429 }
      );
    }

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
