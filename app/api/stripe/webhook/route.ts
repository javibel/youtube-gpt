import { stripe, subscriptionPeriod, createBillingPortalUrl } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { triggerTrialEndingEmail, triggerPaymentFailedEmail } from '@/lib/lifecycle-trigger';

export const runtime = 'nodejs';

const BUSINESS_PRICE_IDS = new Set(
  [process.env.STRIPE_BUSINESS_PRICE_ID, process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID]
    .filter(Boolean)
    .map(id => id!.trim())
);

function detectPlan(priceId: string): string {
  return BUSINESS_PRICE_IDS.has(priceId) ? 'business' : 'pro';
}

// Mismo fallback que invoice.payment_succeeded (nuestra Subscription por customerId,
// si no existe busca por email del customer en Stripe) — factorizado porque los
// dos handlers nuevos de abajo lo necesitan igual.
async function resolveUserIdByCustomer(customerId: string): Promise<string | null> {
  const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } });
  if (sub) return sub.userId;
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  if (customer.email) {
    const user = await prisma.user.findUnique({ where: { email: customer.email } });
    if (user) return user.id;
  }
  return null;
}

async function upsertSubscription(
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription
) {
  const item = subscription.items.data[0];
  const plan = detectPlan(item.price.id);
  const period = subscriptionPeriod(subscription);
  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeCustomerId: customerId,
      stripePriceId: item.price.id,
      plan,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    },
    update: {
      stripeCustomerId: customerId,
      stripePriceId: item.price.id,
      plan,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
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

      // 3 días antes de que termine el trial — dispara el recordatorio de cobro.
      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const userId = await resolveUserIdByCustomer(customerId);
        // Si ya canceló durante el trial, NO avisar de un cobro que no va a
        // producirse — sería confuso/alarmante para alguien que ya decidió irse.
        if (userId && subscription.trial_end && !subscription.cancel_at_period_end) {
          const item = subscription.items.data[0];
          const manageUrl = (await createBillingPortalUrl(customerId)) ?? 'https://ytubviral.com/profile';
          await triggerTrialEndingEmail(userId, subscription.id, {
            trialEndTs: subscription.trial_end,
            amountCents: item?.price?.unit_amount ?? 0,
            currency: (item?.price?.currency || 'eur').toUpperCase(),
            manageUrl,
          });
        }
        break;
      }

      // Cobro fallido (fin de trial o renovación) — avisar antes de que el usuario
      // descubra que perdió el acceso sin saber por qué.
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        // Solo facturas de suscripción (mismo guard que payment_succeeded) — una
        // factura suelta no debe disparar un email que habla de "tu suscripción".
        if (!(invoice as any).subscription) break;
        const customerId = invoice.customer as string;
        const userId = await resolveUserIdByCustomer(customerId);
        if (userId) {
          const manageUrl = (await createBillingPortalUrl(customerId)) ?? 'https://ytubviral.com/profile';
          await triggerPaymentFailedEmail(userId, invoice.id, {
            amountCents: invoice.amount_due ?? 0,
            currency: (invoice.currency || 'eur').toUpperCase(),
            manageUrl,
          });
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const item = subscription.items.data[0];

        const plan = item?.price?.id ? detectPlan(item.price.id) : undefined;
        const period = subscriptionPeriod(subscription);
        await prisma.subscription.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            stripePriceId: item?.price?.id,
            ...(plan ? { plan } : {}),
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
          },
        });
        console.log(`${event.type}: updated subscription for customerId=${customerId}, status=${subscription.status}`);
        break;
      }
    }
  } catch (err) {
    console.error(`Error processing webhook event ${event.type}:`, err);
    // 500 para que Stripe reintente (hasta 3 días, backoff) — los upserts y los
    // triggers de email de arriba son idempotentes, así que reintentar es seguro.
    // Antes esto devolvía 200 y un error transitorio (p.ej. un hipo de la BD)
    // perdía el evento para siempre sin que nadie se enterara.
    return NextResponse.json({ error: 'Error interno procesando el webhook' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
