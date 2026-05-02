import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!ADMIN_EMAIL || session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { email, plan = 'pro' } = await req.json();
  if (!email) {
    return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
  }

  const validPlans = ['free', 'pro', 'business'];
  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: 'Plan inválido. Usa: free, pro, business' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  if (plan === 'free') {
    // Remove subscription or set to canceled
    const existing = await prisma.subscription.findUnique({ where: { userId: user.id } });
    if (existing) {
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { status: 'canceled', cancelAtPeriodEnd: true },
      });
    }
    return NextResponse.json({ ok: true, plan: 'free' });
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setFullYear(periodEnd.getFullYear() + 10);

  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      stripeCustomerId: 'manual_admin',
      stripePriceId: 'manual_admin',
      status: 'active',
      plan,
      cancelAtPeriodEnd: false,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    update: {
      status: 'active',
      plan,
      cancelAtPeriodEnd: false,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  return NextResponse.json({ ok: true, plan });
}
