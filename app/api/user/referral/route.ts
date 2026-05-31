import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

function generateCode(): string {
  return crypto.randomBytes(4).toString('hex'); // 8-char hex code
}

// GET — return user's referral code + stats
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { referralCode: true },
  });

  // Generate code on first access
  if (!user?.referralCode) {
    let code = generateCode();
    // Ensure uniqueness (extremely unlikely collision but safe)
    while (await prisma.user.findUnique({ where: { referralCode: code } })) {
      code = generateCode();
    }
    user = await prisma.user.update({
      where: { id: session.user.id },
      data: { referralCode: code },
      select: { referralCode: true },
    });
  }

  const referralCount = await prisma.user.count({
    where: { referredBy: user!.referralCode },
  });

  return NextResponse.json({
    code: user!.referralCode,
    url: `https://ytubviral.com/signup?ref=${user!.referralCode}`,
    referrals: referralCount,
  });
}
