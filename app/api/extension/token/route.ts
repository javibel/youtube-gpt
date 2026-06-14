import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';

// Session-based extension token mint. Lets the extension connect WITHOUT a password — works for
// Google/OAuth users (who have no password and were locked out of the email+password login).
// Called same-origin by detect.js on ytubviral.com, so the NextAuth session cookie is sent.
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, same as /api/extension/login

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
    }
    if (!user.emailVerified) {
      return NextResponse.json({ error: 'email_not_verified' }, { status: 403 });
    }

    // Cleanup expired tokens for this user
    await prisma.extensionToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await prisma.extensionToken.create({ data: { userId: user.id, token, expiresAt } });

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    const isPro = subscription?.status === 'active';

    return NextResponse.json({ token, name: user.name, email: user.email, isPro });
  } catch (err) {
    console.error('[extension/token]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
