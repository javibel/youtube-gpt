import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { isPaidStatus } from '@/lib/plans';
import { NextResponse } from 'next/server';

export async function POST() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { subscription: true },
  });

  if (!user?.subscription?.stripeCustomerId) {
    return NextResponse.json({ error: 'No tienes una suscripción activa' }, { status: 400 });
  }

  // Buscar la suscripción activa (o en trial) en Stripe
  let subscriptions;
  try {
    subscriptions = await stripe.subscriptions.list({
      customer: user.subscription.stripeCustomerId,
      status: 'all',
      limit: 10,
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo contactar con Stripe' }, { status: 500 });
  }

  const sub = subscriptions.data.find((s) => isPaidStatus(s.status));

  if (!sub) {
    return NextResponse.json({ error: 'No se encontró suscripción activa en Stripe' }, { status: 400 });
  }

  if (sub.cancel_at_period_end) {
    return NextResponse.json({ error: 'La suscripción ya está programada para cancelarse' }, { status: 400 });
  }

  // Cancelar al final del periodo (no inmediatamente)
  await stripe.subscriptions.update(sub.id, {
    cancel_at_period_end: true,
  });

  await prisma.subscription.update({
    where: { userId: user.id },
    data: { cancelAtPeriodEnd: true },
  });

  return NextResponse.json({ ok: true });
}
