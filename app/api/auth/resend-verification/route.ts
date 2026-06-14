import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verificationEmail } from '@/lib/emails';
import { sendTransactionalEmail } from '@/lib/send-email';
import crypto from 'crypto';
import { rateLimitRequest } from '@/lib/rate-limit-db';

export async function POST(request: NextRequest) {
  // F2: throttle to prevent verification-email bombing / Resend quota abuse
  if (!(await rateLimitRequest(request, 'resend-verif', 5, 60))) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }
  const { email, lang = 'es' } = await request.json();
  const emailLang: 'es' | 'en' = lang === 'en' ? 'en' : 'es';

  if (!email) {
    return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, emailVerified: true },
  });

  // Return ok regardless to not leak whether email exists
  if (!user || user.emailVerified) {
    return NextResponse.json({ ok: true });
  }

  // Delete old tokens and create a fresh 6-digit code
  await prisma.emailVerificationToken.deleteMany({ where: { email } });
  const code = String(crypto.randomInt(100000, 999999));
  await prisma.emailVerificationToken.create({
    data: { email, token: code, expires: new Date(Date.now() + 15 * 60 * 1000) },
  });

  const name = user.name ?? email;
  const subject = emailLang === 'en'
    ? `${code} — Verify your email - YTubViral`
    : `${code} — Verifica tu email - YTubViral`;

  sendTransactionalEmail({
    to: email,
    subject,
    html: verificationEmail(name, code, emailLang),
    isTransactional: true,
  }).catch((err) => console.error('Resend verification error:', err));

  return NextResponse.json({ ok: true });
}
