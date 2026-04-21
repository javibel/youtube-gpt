import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// GET — listar todas las reseñas pendientes
export async function GET() {
  const session = await auth();
  if (!ADMIN_EMAIL || session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

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
  const session = await auth();
  if (!ADMIN_EMAIL || session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id, status } = await req.json();
  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  await prisma.review.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true });
}
