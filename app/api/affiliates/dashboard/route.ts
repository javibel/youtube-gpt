import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const affiliate = await prisma.affiliate.findUnique({
    where: { userId: session.user.id },
    include: { commissions: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!affiliate) return NextResponse.json({ affiliate: null });

  const since30d = new Date(Date.now() - 30 * 86400000);
  const [clicks30d, referredSignups] = await Promise.all([
    prisma.affiliateClick.count({ where: { affiliateId: affiliate.id, createdAt: { gte: since30d } } }),
    prisma.user.count({ where: { referredByCode: affiliate.code } }),
  ]);

  const pendingCents = affiliate.commissions.filter(c => c.status === 'pending' || c.status === 'approved').reduce((s, c) => s + c.commissionCents, 0);
  const paidCents = affiliate.commissions.filter(c => c.status === 'paid').reduce((s, c) => s + c.commissionCents, 0);

  return NextResponse.json({
    affiliate: {
      code: affiliate.code, status: affiliate.status, commissionPct: affiliate.commissionPct, monthsPaid: affiliate.monthsPaid,
      url: `https://ytubviral.com/a/${affiliate.code}`,
      clicks30d, referredSignups, pendingCents, paidCents,
      commissions: affiliate.commissions.map(c => ({
        id: c.id, commissionCents: c.commissionCents, invoiceAmountCents: c.invoiceAmountCents,
        status: c.status, createdAt: c.createdAt,
      })),
    },
  });
}
