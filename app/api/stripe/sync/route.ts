import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { stripe, subscriptionPeriod } from '@/lib/stripe';
import { isPaidStatus } from '@/lib/plans';
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
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    const response = (data: object) => NextResponse.json({ userId: user.id, email: user.email, ...data });
    // Find customer in Stripe by email
    const customers = await stripe.customers.list({ email: session.user.email, limit: 5 });

    if (!customers.data.length) {
      return response({ synced: false });
    }

    // Check all customers for an active (or trialing) subscription
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
        limit: 10,
      });

      const sub = subscriptions.data.find((s) => isPaidStatus(s.status));

      if (sub) {
        const item = sub.items.data[0];

        const period = subscriptionPeriod(sub);
        await prisma.subscription.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            stripeCustomerId: customer.id,
            stripePriceId: item.price.id,
            status: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
          },
          update: {
            stripeCustomerId: customer.id,
            stripePriceId: item.price.id,
            status: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
          },
        });

        return response({ synced: true, status: sub.status });
      }
    }

    return response({ synced: false });
  } catch {
    return NextResponse.json({ error: 'Sync unavailable' }, { status: 503 });
  }
}
