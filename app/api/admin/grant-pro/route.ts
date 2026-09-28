import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guards';

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { email, plan = 'pro', durationDays } = await req.json();
  if (!email) {
    return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
  }

  const validPlans = ['free', 'pro', 'business'];
  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: 'Plan inválido. Usa: free, pro, business' }, { status: 400 });
  }
  if (durationDays !== undefined && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
    return NextResponse.json({ error: 'durationDays debe ser un entero entre 1 y 365' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  const existing = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (existing?.stripeCustomerId && existing.stripeCustomerId !== 'manual_admin') {
    return NextResponse.json({ error: 'No se puede modificar una suscripción gestionada por Stripe' }, { status: 409 });
  }

  if (plan === 'free') {
    // Remove subscription or set to canceled
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
  if (durationDays !== undefined) periodEnd.setUTCDate(periodEnd.getUTCDate() + durationDays);
  else periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 10);

  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      stripeCustomerId: 'manual_admin',
      stripePriceId: 'manual_admin',
      status: 'active',
      plan,
      cancelAtPeriodEnd: true,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    update: {
      stripeCustomerId: 'manual_admin',
      stripePriceId: 'manual_admin',
      status: 'active',
      plan,
      cancelAtPeriodEnd: true,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  return NextResponse.json({ ok: true, plan, currentPeriodEnd: periodEnd.toISOString() });
}
