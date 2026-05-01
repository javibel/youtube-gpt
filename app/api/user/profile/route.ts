import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const data: { name?: string; lang?: string } = {};

  if (body.name !== undefined) {
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 });
    }
    data.name = body.name.trim();
  }

  if (body.lang === 'es' || body.lang === 'en') {
    data.lang = body.lang;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await prisma.user.update({
    where: { email: session.user.email },
    data,
  });

  return NextResponse.json({ ok: true });
}
