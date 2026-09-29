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
  if (plan !== 'free' && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
    return NextResponse.json({ error: 'durationDays debe ser un entero entre 1 y 365' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  const existing = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (existing && existing.stripeCustomerId !== 'manual_admin') {
    return NextResponse.json({ error: 'Suscripción existente sin concesión manual verificada; requiere revisión' }, { status: 409 });
  }

  if (plan === 'free') {
    // Remove subscription or set to canceled
    if (existing) {
      const changed = await prisma.subscription.updateMany({
        where: { userId: user.id, stripeCustomerId: 'manual_admin' },
        data: { status: 'canceled', cancelAtPeriodEnd: true },
      });
      if (changed.count !== 1) return NextResponse.json({ error: 'La suscripción cambió; vuelve a revisarla' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, plan: 'free' });
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + durationDays);

  const data = { stripeCustomerId: 'manual_admin', stripePriceId: 'manual_admin', status: 'active', plan, cancelAtPeriodEnd: true, currentPeriodStart: now, currentPeriodEnd: periodEnd };
  if (existing) {
    const changed = await prisma.subscription.updateMany({ where: { userId: user.id, stripeCustomerId: 'manual_admin' }, data });
    if (changed.count !== 1) return NextResponse.json({ error: 'La suscripción cambió; vuelve a revisarla' }, { status: 409 });
  } else {
    try {
      await prisma.subscription.create({ data: { userId: user.id, ...data } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'La suscripción cambió; vuelve a revisarla' }, { status: 409 });
      throw error;
    }
  }

  return NextResponse.json({ ok: true, plan, currentPeriodEnd: periodEnd.toISOString() });
}
