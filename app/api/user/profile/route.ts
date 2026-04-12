import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { name } = await request.json();

  if (!name || name.trim().length === 0) {
    return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 });
  }

  await prisma.user.update({
    where: { email: session.user.email },
    data: { name: name.trim() },
  });

  return NextResponse.json({ ok: true });
}
