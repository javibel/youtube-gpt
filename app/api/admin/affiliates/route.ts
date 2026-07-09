import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guards';

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const affiliates = await prisma.affiliate.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true } },
      _count: { select: { clicks: true, commissions: true } },
      commissions: { select: { commissionCents: true, status: true } },
    },
  });

  const rows = affiliates.map((a) => {
    const pendingCents = a.commissions.filter((c) => c.status === 'pending' || c.status === 'approved').reduce((s, c) => s + c.commissionCents, 0);
    const paidCents = a.commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commissionCents, 0);
    return {
      id: a.id, code: a.code, name: a.name, email: a.email, status: a.status,
      commissionPct: a.commissionPct, monthsPaid: a.monthsPaid, payoutMethod: a.payoutMethod,
      channelInfo: a.channelInfo, createdAt: a.createdAt, linkedUserEmail: a.user?.email ?? null,
      clicks: a._count.clicks, commissionCount: a._count.commissions,
      pendingCents, paidCents,
    };
  });

  return NextResponse.json({ affiliates: rows });
}

const VALID_STATUS = ['pending', 'active', 'paused', 'terminated'];

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id, status, commissionPct, payoutMethod, linkUserEmail } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (status !== undefined) {
    if (!VALID_STATUS.includes(status)) return NextResponse.json({ error: 'status inválido' }, { status: 400 });
    data.status = status;
  }
  if (commissionPct !== undefined) {
    const pct = Number(commissionPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ error: 'commissionPct inválido' }, { status: 400 });
    data.commissionPct = pct;
  }
  if (payoutMethod !== undefined) data.payoutMethod = typeof payoutMethod === 'string' ? payoutMethod.slice(0, 200) : null;

  if (linkUserEmail !== undefined) {
    if (!linkUserEmail) {
      data.userId = null;
    } else {
      const user = await prisma.user.findUnique({ where: { email: String(linkUserEmail).toLowerCase().trim() } });
      if (!user) return NextResponse.json({ error: 'No existe ningún usuario con ese email — el afiliado debe crearse una cuenta normal primero' }, { status: 400 });
      const alreadyLinked = await prisma.affiliate.findFirst({ where: { userId: user.id, id: { not: id } } });
      if (alreadyLinked) return NextResponse.json({ error: `Ese usuario ya está vinculado al afiliado "${alreadyLinked.code}"` }, { status: 400 });
      data.userId = user.id;
    }
  }

  const updated = await prisma.affiliate.update({ where: { id }, data });
  return NextResponse.json({ ok: true, affiliate: updated });
}
