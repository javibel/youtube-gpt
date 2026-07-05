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

  if (!user?.subscription?.stripeCustomerId || user.subscription.plan !== 'business') {
    return NextResponse.json({ error: 'No tienes un plan Business activo' }, { status: 400 });
  }

  let subscriptions;
  try {
    subscriptions = await stripe.subscriptions.list({
      customer: user.subscription.stripeCustomerId,
      status: 'active',
      limit: 1,
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo contactar con Stripe' }, { status: 500 });
  }

  if (subscriptions.data.length === 0) {
    return NextResponse.json({ error: 'No se encontró suscripción activa en Stripe' }, { status: 400 });
  }

  const sub = subscriptions.data[0];
  if (sub.cancel_at_period_end) {
    return NextResponse.json({ error: 'La suscripción ya está programada para cancelarse' }, { status: 400 });
  }

  const item = sub.items.data[0];
  const isYearly = item.price.recurring?.interval === 'year';
  const proPriceId = (isYearly ? process.env.STRIPE_PRO_YEARLY_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID)?.trim();
  if (!proPriceId) {
    return NextResponse.json({ error: 'Price ID de Pro no configurado' }, { status: 500 });
  }

  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: proPriceId }],
    proration_behavior: 'create_prorations',
  });

  await prisma.subscription.update({
    where: { userId: user.id },
    data: { plan: 'pro', stripePriceId: proPriceId },
  });

  return NextResponse.json({ ok: true });
}
