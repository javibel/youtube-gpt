import { NextRequest, NextResponse, after } from 'next/server';
import { prepareVerificationResend, dispatchVerificationResend } from '@/lib/email-verification-resend';
import { rateLimitRequest } from '@/lib/rate-limit-db';

export async function POST(request: NextRequest) {
  let allowed = false;
  try { allowed = (await rateLimitRequest(request, 'resend-verif', 5, 60, true)) === true; } catch {}
  if (!allowed) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('email' in body)
    || Object.keys(body).some(key => key !== 'email' && key !== 'lang')
    || typeof body.email !== 'string' || ('lang' in body && body.lang !== 'es' && body.lang !== 'en')) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const lang = 'lang' in body && body.lang === 'en' ? 'en' : 'es';
  const result = await prepareVerificationResend(email, lang);
  if (result.status === 'unconfirmed') return NextResponse.json({ error: 'resend_unconfirmed' }, { status: 503 });
  if (result.status === 'prepared') {
    try {
      after(async () => {
        const outcome = await dispatchVerificationResend(result.notice);
        console.info('[resend-verification] Original notice:', outcome);
      });
    } catch {
      // Scheduling uncertainty retains the pending marker, never a fresh send permission.
      console.info('[resend-verification] Original notice: not-scheduled');
    }
  }
  // Uniform request acceptance for missing/verified/busy accounts. This never
  // claims that a code was rotated or that an email was sent/delivered.
  return NextResponse.json({ ok: true });
}
