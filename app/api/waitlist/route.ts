import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/send-email';
import { waitlistWelcomeEmail } from '@/lib/emails';

export async function POST(request: NextRequest) {
  const { email, source, referrer, lang } = await request.json() as {
    email?: string;
    source?: string;
    referrer?: string;
    lang?: string;
  };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const normalised = email.toLowerCase().trim();

  const existing = await prisma.launchWaitlist.findUnique({
    where: { email: normalised },
  });

  if (existing) {
    return NextResponse.json({ ok: true, alreadyJoined: true });
  }

  await prisma.launchWaitlist.create({
    data: {
      email: normalised,
      source: source || 'launch-page',
      referrer: referrer || null,
      lang: lang === 'en' ? 'en' : 'es',
    },
  });

  const count = await prisma.launchWaitlist.count();

  // Send welcome email (must await — serverless kills the process after response)
  const emailLang: 'es' | 'en' = lang === 'en' ? 'en' : 'es';
  try {
    await sendTransactionalEmail({
      to: normalised,
      subject: emailLang === 'en'
        ? "You're on the YTubViral launch list!"
        : '¡Estás en la lista de lanzamiento de YTubViral!',
      html: waitlistWelcomeEmail(emailLang),
    });
  } catch (err) {
    console.error('[waitlist] Welcome email failed:', err);
  }

  return NextResponse.json({ ok: true, position: count });
}

export async function GET() {
  const count = await prisma.launchWaitlist.count();
  return NextResponse.json({ count });
}
