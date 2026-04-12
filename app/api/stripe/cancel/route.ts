import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
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

  // Buscar la suscripción activa en Stripe
  const subscriptions = await stripe.subscriptions.list({
    customer: user.subscription.stripeCustomerId,
    status: 'active',
    limit: 1,
  });

  if (subscriptions.data.length === 0) {
    return NextResponse.json({ error: 'No se encontró suscripción activa' }, { status: 400 });
  }

  const sub = subscriptions.data[0];

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
