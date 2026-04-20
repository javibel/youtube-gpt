import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';

/**
 * POST /api/stripe/sync
 * Looks up the authenticated user's active Stripe subscription and syncs it to the DB.
 * Used when the webhook fails to activate Pro after payment.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // Find customer in Stripe by email
    const customers = await stripe.customers.list({ email: session.user.email, limit: 5 });

    if (!customers.data.length) {
      return NextResponse.json({ synced: false, message: 'No se encontró cliente en Stripe.' });
    }

    // Check all customers for an active subscription
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 5,
      });

      if (subscriptions.data.length > 0) {
        const sub = subscriptions.data[0];
        const item = sub.items.data[0];

        const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
        if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

        await prisma.subscription.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            stripeCustomerId: customer.id,
            stripePriceId: item.price.id,
            status: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
          update: {
            stripeCustomerId: customer.id,
            stripePriceId: item.price.id,
            status: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });

        return NextResponse.json({ synced: true, status: sub.status });
      }
    }

    return NextResponse.json({ synced: false, message: 'No hay suscripción activa en Stripe.' });
  } catch (err) {
    console.error('Stripe sync error:', err);
    return NextResponse.json({ error: 'Error al sincronizar con Stripe' }, { status: 500 });
  }
}
