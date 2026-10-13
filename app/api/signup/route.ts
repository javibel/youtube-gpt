import { NextRequest, NextResponse, after } from 'next/server';
import { parseSignupInput } from '@/lib/signup-input';
import { verifySignupTurnstile } from '@/lib/signup-turnstile';
import { createSignupAndNotice, dispatchVerificationResend } from '@/lib/email-verification-resend';
import { rateLimitRequest } from '@/lib/rate-limit-db';

export async function POST(request: NextRequest) {
  let allowed = false;
  try { allowed = (await rateLimitRequest(request, 'signup', 5, 15, true)) === true; } catch {}
  if (!allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
  const input = parseSignupInput(body);
  if (!input) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const captcha = await verifySignupTurnstile(input);
  if (captcha.status === 'invalid') return NextResponse.json({ error: 'bot_verification_failed' }, { status: 403 });
  if (captcha.status !== 'verified') return NextResponse.json({ error: 'bot_verification_unconfirmed' }, { status: 503 });
  const result = await createSignupAndNotice(input, captcha.permit);
  if (result.status === 'exists') return NextResponse.json({ error: 'account_exists' }, { status: 400 });
  if (result.status !== 'created') return NextResponse.json({ error: 'signup_unconfirmed' }, { status: 503 });
  try {
    after(async () => {
      const outcome = await dispatchVerificationResend(result.notice);
      console.info('[signup] Original verification notice:', outcome);
    });
  } catch { console.info('[signup] Original verification notice: not-scheduled'); }
  // The commit ACK confirms an unverified account, never authentication or delivery.
  return NextResponse.json({ success: true }, { status: 201 });
}
