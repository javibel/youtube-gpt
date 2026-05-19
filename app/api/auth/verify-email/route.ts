import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const { email, code } = await request.json();

  if (!email || !code) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const record = await prisma.emailVerificationToken.findFirst({
    where: { email, token: code },
  });

  if (!record) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }

  if (record.expires < new Date()) {
    await prisma.emailVerificationToken.delete({ where: { token: code } });
    return NextResponse.json({ error: 'expired_code' }, { status: 400 });
  }

  await Promise.all([
    prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.deleteMany({ where: { email } }),
  ]);

  return NextResponse.json({ verified: true });
}
