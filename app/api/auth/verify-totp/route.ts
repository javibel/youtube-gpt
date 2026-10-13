import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ADMIN_EMAIL } from '@/lib/admin-email';
import { authenticator } from 'otplib';
import { rateLimitDb } from '@/lib/rate-limit-db';
import { expectedTotpAccountMatches } from '@/lib/totp-account';

// Preliminary check only. Clearing the factor requires the native auth.ts JWT
// callback to verify the credential again against its own decoded principal.
// Public account selectors restrict both stages; they never grant authority.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const principal = session?.user as { id?: string; email?: string | null; isAdmin?: boolean; authSessionRef?: string } | undefined;
    const email = session?.user?.email?.toLowerCase().trim();
    if (typeof principal?.id !== 'string' || !principal.id || principal.isAdmin !== true || !email || !ADMIN_EMAIL || email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const input: unknown = await request.json().catch(() => null);
    if (!expectedTotpAccountMatches(input, principal)) {
      return NextResponse.json({ error: 'session_changed' }, { status: 409 });
    }

    const secret = process.env.ADMIN_TOTP_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown';
    const allowed = await rateLimitDb(`verify-totp:${ip}`, 10, 15, true);
    if (allowed !== true) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const value = (input as { code?: unknown }).code;
    const totp = typeof value === 'string' ? value.trim() : '';
    if (!/^\d{6}$/.test(totp) || authenticator.verify({ token: totp, secret }) !== true) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
    }

    return NextResponse.json({ verified: true });
  } catch {
    return NextResponse.json({ error: 'verification_unavailable' }, { status: 503 });
  }
}
