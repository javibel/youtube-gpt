import { NextResponse } from 'next/server';
import { Resend } from 'resend';

/**
 * GET /api/debug-email — Temporary endpoint to diagnose Resend in production.
 * DELETE THIS FILE after debugging.
 */
export async function GET() {
  const key = process.env.RESEND_API_KEY?.trim();
  const keyPresent = !!key;
  const keyPrefix = key ? key.substring(0, 8) + '...' : 'MISSING';

  if (!key) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set', keyPresent });
  }

  try {
    const resend = new Resend(key);
    const result = await resend.emails.send({
      from: 'YTubViral <hello@ytubviral.com>',
      to: 'ytbeviral@gmail.com',
      subject: '[DEBUG] Resend test from production',
      html: '<p>If you see this, Resend works in production.</p>',
    });

    return NextResponse.json({
      keyPresent,
      keyPrefix,
      resendResult: result.data ?? null,
      resendError: result.error ?? null,
    });
  } catch (err) {
    return NextResponse.json({
      keyPresent,
      keyPrefix,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
