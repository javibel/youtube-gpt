import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BASE = process.env.NEXTAUTH_URL ?? 'https://ytubviral.com';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(`${BASE}/verify-email?error=invalid`);
  }

  const record = await prisma.emailVerificationToken.findUnique({ where: { token } });

  if (!record) {
    return NextResponse.redirect(`${BASE}/verify-email?error=invalid`);
  }

  if (record.expires < new Date()) {
    await prisma.emailVerificationToken.delete({ where: { token } });
    return NextResponse.redirect(`${BASE}/verify-email?error=expired`);
  }

  await Promise.all([
    prisma.user.update({
      where: { email: record.email },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.delete({ where: { token } }),
  ]);

  return NextResponse.redirect(`${BASE}/verify-email?success=1`);
}
