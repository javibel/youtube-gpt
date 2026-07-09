import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guards';

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  // 30 días de retención desde el devengo antes de ser pagable (cubre la
  // ventana de garantía/refund — ver docs/programa-afiliados-especificacion-2026-07-09.md §5).
  const RETENTION_DAYS = 30;
  const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);

  const commissions = await prisma.affiliateCommission.findMany({
    where: { status: { in: ['pending', 'approved'] } },
    orderBy: { createdAt: 'asc' },
    include: { affiliate: { select: { code: true, name: true, email: true, payoutMethod: true } } },
  });

  const rows = commissions.map((c) => ({
    id: c.id, affiliateCode: c.affiliate.code, affiliateName: c.affiliate.name,
    affiliateEmail: c.affiliate.email, payoutMethod: c.affiliate.payoutMethod,
    commissionCents: c.commissionCents, invoiceAmountCents: c.invoiceAmountCents,
    status: c.status, createdAt: c.createdAt,
    payable: c.createdAt <= retentionCutoff,
  }));

  return NextResponse.json({ commissions: rows });
}

const VALID_STATUS = ['pending', 'approved', 'paid', 'reversed'];

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { ids, status } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: 'ids requerido' }, { status: 400 });
  if (!VALID_STATUS.includes(status)) return NextResponse.json({ error: 'status inválido' }, { status: 400 });

  const result = await prisma.affiliateCommission.updateMany({
    where: { id: { in: ids } },
    data: { status, ...(status === 'paid' ? { paidAt: new Date() } : {}) },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
