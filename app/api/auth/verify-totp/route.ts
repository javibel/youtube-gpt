import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ADMIN_EMAIL } from '@/lib/admin-email';
import { authenticator } from 'otplib';
import { rateLimitDb } from '@/lib/rate-limit-db';

// Second factor for the admin's Google sign-in (restored 25/08 — see auth.ts jwt
// callback). Credentials logins already check TOTP inline in authorize(); this route
// exists only because Google can't run that check, so the session starts gated
// (requiresTotp=true) and this is the one place that can clear it.
export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email || !ADMIN_EMAIL || email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const secret = process.env.ADMIN_TOTP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const allowed = await rateLimitDb(`verify-totp:${ip}`, 10, 15);
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { code } = await request.json().catch(() => ({ code: undefined }));
  const totp = String(code ?? '').trim();
  if (!totp || !authenticator.verify({ token: totp, secret })) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }

  return NextResponse.json({ verified: true });
}
