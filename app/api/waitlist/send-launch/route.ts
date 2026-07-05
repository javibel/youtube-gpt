import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/send-email';
import { launchDayEmail } from '@/lib/emails';
import { requireAdmin } from '@/lib/auth-guards';

/**
 * POST /api/waitlist/send-launch
 * Sends the launch-day email (PH link + coupon + 48h urgency) to all waitlist subscribers.
 * Admin-only. Body: { phUrl: string, couponCode: string }
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));
  const { phUrl, couponCode } = body as { phUrl?: string; couponCode?: string };

  if (!phUrl || !couponCode) {
    return NextResponse.json({ error: 'phUrl and couponCode are required' }, { status: 400 });
  }

  const subscribers = await prisma.launchWaitlist.findMany({
    select: { email: true, lang: true },
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    try {
      const subLang: 'es' | 'en' = sub.lang === 'en' ? 'en' : 'es';
      const subject = subLang === 'en'
        ? '\u{1F680} YTubViral is LIVE \u2014 50% off for 48h only'
        : '\u{1F680} YTubViral est\u00e1 EN VIVO \u2014 50% de descuento solo 48h';
      await sendTransactionalEmail({
        to: sub.email,
        subject,
        html: launchDayEmail(subLang, phUrl, couponCode),
      });
      sent++;
      // Small delay to avoid rate limits
      if (sent % 5 === 0) await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[launch-email] Failed for ${sub.email}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, total: subscribers.length });
}
