import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guards';

// GET — listar todas las reseñas pendientes
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const reviews = await prisma.review.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      rating: true,
      text: true,
      status: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
  });

  return NextResponse.json({ reviews });
}

// PATCH — aprobar o rechazar
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id, status } = await req.json();
  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  await prisma.review.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true });
}
