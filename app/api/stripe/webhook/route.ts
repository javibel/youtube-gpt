import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

const BUSINESS_PRICE_IDS = new Set(
  [process.env.STRIPE_BUSINESS_PRICE_ID, process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID]
    .filter(Boolean)
    .map(id => id!.trim())
);

function detectPlan(priceId: string): string {
  return BUSINESS_PRICE_IDS.has(priceId) ? 'business' : 'pro';
}

async function upsertSubscription(
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription
) {
  const item = subscription.items.data[0];
  const plan = detectPlan(item.price.id);
  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeCustomerId: customerId,
      stripePriceId: item.price.id,
      plan,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : new Date(),
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date(),
    },
    update: {
      stripeCustomerId: customerId,
      stripePriceId: item.price.id,
      plan,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : new Date(),
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date(),
    },
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Sin firma' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const userId = session.metadata?.userId;
          if (!userId) {
            console.error('checkout.session.completed: missing userId in metadata');
            break;
          }
          await upsertSubscription(userId, session.customer as string, subscription);
          console.log(`checkout.session.completed: activated Pro for userId=${userId}`);
        }
        break;
      }

      // Fallback: fires on every successful payment, including subscription renewals
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if ((invoice as any).subscription) {
          const subscription = await stripe.subscriptions.retrieve((invoice as any).subscription as string);
          const customerId = invoice.customer as string;

          // Find user by customer ID
          const existingSub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } });
          if (existingSub) {
            await upsertSubscription(existingSub.userId, customerId, subscription);
            console.log(`invoice.payment_succeeded: synced Pro for customerId=${customerId}`);
          } else {
            // Try to find user by email from Stripe customer
            const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
            if (customer.email) {
              const user = await prisma.user.findUnique({ where: { email: customer.email } });
              if (user) {
                await upsertSubscription(user.id, customerId, subscription);
                console.log(`invoice.payment_succeeded: created Pro for email=${customer.email}`);
              }
            }
          }
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const item = subscription.items.data[0];

        const plan = item?.price?.id ? detectPlan(item.price.id) : undefined;
        await prisma.subscription.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            stripePriceId: item?.price?.id,
            ...(plan ? { plan } : {}),
            currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : new Date(),
            currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date(),
          },
        });
        console.log(`${event.type}: updated subscription for customerId=${customerId}, status=${subscription.status}`);
        break;
      }
    }
  } catch (err) {
    console.error(`Error processing webhook event ${event.type}:`, err);
    // Still return 200 so Stripe doesn't keep retrying for non-recoverable errors
  }

  return NextResponse.json({ received: true });
}
