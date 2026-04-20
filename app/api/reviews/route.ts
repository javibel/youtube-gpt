import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// POST — enviar o actualizar reseña propia
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { rating, text } = await req.json();

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Valoración inválida' }, { status: 400 });
  }
  if (!text || text.trim().length < 10) {
    return NextResponse.json({ error: 'La reseña debe tener al menos 10 caracteres' }, { status: 400 });
  }
  if (text.trim().length > 400) {
    return NextResponse.json({ error: 'La reseña no puede superar 400 caracteres' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

  const review = await prisma.review.upsert({
    where: { userId: user.id },
    create: { userId: user.id, rating, text: text.trim(), status: 'pending' },
    update: { rating, text: text.trim(), status: 'pending' },
  });

  return NextResponse.json({ ok: true, review });
}

// GET — obtener reseña propia
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ review: null });

  const review = await prisma.review.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ review });
}
