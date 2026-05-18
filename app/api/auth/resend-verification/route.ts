import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verificationEmail } from '@/lib/emails';
import { sendTransactionalEmail } from '@/lib/send-email';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
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

  // Delete old token and create a fresh one
  await prisma.emailVerificationToken.deleteMany({ where: { email } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.emailVerificationToken.create({
    data: { email, token, expires: new Date(Date.now() + 24 * 3600 * 1000) },
  });

  const baseUrl = process.env.APP_PUBLIC_URL ?? 'https://ytubviral.com';
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
  const name = user.name ?? email;
  const subject = emailLang === 'en' ? 'Verify your email - YTubViral' : 'Verifica tu email - YTubViral';

  sendTransactionalEmail({
    to: email,
    subject,
    html: verificationEmail(name, verifyUrl, emailLang),
    isTransactional: true,
  }).catch((err) => console.error('Resend verification error:', err));

  return NextResponse.json({ ok: true });
}
