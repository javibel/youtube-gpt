import { stripe, subscriptionPeriod, createBillingPortalUrl } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { captureCheckoutPrices, captureCheckoutSubscription, captureCheckoutCustomer, preflightCheckoutBusiness } from '@/lib/checkout-webhook-business';
import { captureWebhookEvent, checkoutEventProjection, WebhookInputError } from '@/lib/stripe-webhook-contract';
import { readWebhookBody, webhookWait, WebhookWaitRetired, type WebhookWait } from '@/lib/stripe-webhook-intake';
import { triggerTrialEndingEmail, triggerPaymentFailedEmail } from '@/lib/lifecycle-trigger';
import { accrueAffiliateCommission, reverseAffiliateCommissionForInvoice } from '@/lib/affiliate';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
async function resolveUserIdByCustomer(customerId: string, wait: WebhookWait): Promise<string | null> {
  const sub = await wait.run(() => prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } }));
  if (sub) return sub.userId;
  const customer = await wait.run(() => stripe.customers.retrieve(customerId)) as Stripe.Customer;
  if (customer.email) {
    const user = await wait.run(() => prisma.user.findUnique({ where: { email: customer.email! } }));
    if (user) return user.id;
  }
  return null;
}

async function upsertSubscription(
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription,
  wait: WebhookWait
) {
  const item = subscription.items.data[0];
  const plan = detectPlan(item.price.id);
  const period = subscriptionPeriod(subscription);
  await wait.run(() => { const data = {
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
  }; wait.check(); return prisma.subscription.upsert(data); });
}

function reply(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  const wait = webhookWait(request.signal);
  try {
    wait.check();
    // Capture header and configured secret before waiting for the original raw body.
    const signature = request.headers.get('stripe-signature');
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const checkoutPrices = captureCheckoutPrices(process.env);
    if (!signature || !signature.trim() || signature.length > 4096) throw new WebhookInputError(400, 'Firma inválida');
    if (!secret || secret.length > 4096) return reply({ error: 'Webhook no configurado' }, 503);
    const body = await readWebhookBody(request, wait);
    let verified: unknown;
    try {
      wait.check();
      verified = stripe.webhooks.constructEvent(body, signature, secret);
      wait.check();
    } catch (error) {
      if (error instanceof WebhookWaitRetired) throw error;
      console.error('Webhook signature verification failed');
      return reply({ error: 'Firma inválida' }, 400);
    }
    // Snapshot the verified SDK result before any downstream await; no authority is inferred here.
    const event = captureWebhookEvent(verified, wait.check) as Stripe.Event;
    const checkout = checkoutEventProjection(event);
    switch (event.type) {
      case 'checkout.session.completed': {
        if (checkout) {
          if (!checkoutPrices) throw new WebhookInputError(503, 'Precios de checkout no configurados');
          const subscription = await wait.run(async () => captureCheckoutSubscription(await stripe.subscriptions.retrieve(checkout.subscriptionId), wait.check));
          const customer = await wait.run(async () => captureCheckoutCustomer(await stripe.customers.retrieve(checkout.customerId), wait.check));
          await wait.run(() => preflightCheckoutBusiness(checkout, subscription, customer, checkoutPrices, wait.check));
          // Matching data is not a live durable admission capability. Never upsert from this projection.
          throw new WebhookInputError(503, 'Evento pendiente de admisión original');
        }
        break;
      }

      // Fallback: fires on every successful payment, including subscription renewals
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if ((invoice as any).subscription) {
          const subscription = await wait.run(() => stripe.subscriptions.retrieve((invoice as any).subscription as string));
          const customerId = invoice.customer as string;
          const userId = await resolveUserIdByCustomer(customerId, wait);

          if (userId) {
            await upsertSubscription(userId, customerId, subscription, wait);
            // Devengo de comisión de afiliado — solo facturas realmente pagadas,
            // nunca en el alta del trial (que no genera invoice.payment_succeeded).
            await wait.run(() => accrueAffiliateCommission(userId, invoice));
          }
        }
        break;
      }

      // 3 días antes de que termine el trial — dispara el recordatorio de cobro.
      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const userId = await resolveUserIdByCustomer(customerId, wait);
        // Si ya canceló durante el trial, NO avisar de un cobro que no va a
        // producirse — sería confuso/alarmante para alguien que ya decidió irse.
        const trialEndTs = subscription.trial_end;
        if (userId && trialEndTs && !subscription.cancel_at_period_end) {
          const item = subscription.items.data[0];
          const manageUrl = (await wait.run(() => createBillingPortalUrl(customerId))) ?? 'https://ytubviral.com/profile';
          await wait.run(() => triggerTrialEndingEmail(userId, subscription.id, {
            trialEndTs,
            amountCents: item?.price?.unit_amount ?? 0,
            currency: (item?.price?.currency || 'eur').toUpperCase(),
            manageUrl,
          }));
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
        const userId = await resolveUserIdByCustomer(customerId, wait);
        if (userId) {
          const manageUrl = (await wait.run(() => createBillingPortalUrl(customerId))) ?? 'https://ytubviral.com/profile';
          await wait.run(() => triggerPaymentFailedEmail(userId, invoice.id, {
            amountCents: invoice.amount_due ?? 0,
            currency: (invoice.currency || 'eur').toUpperCase(),
            manageUrl,
          }));
        }
        break;
      }

      // Refund (garantía 30d u otro) — revertir la comisión de afiliado de esa
      // factura si existía. No toca el plan del usuario: eso ya lo gestiona
      // customer.subscription.deleted cuando Javier cancela tras el refund
      // (ver runbook en docs/trial-stripe-hardening-2026-07-09.md).
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id;
        if (invoiceId) {
          await wait.run(() => reverseAffiliateCommissionForInvoice(invoiceId));
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
        await wait.run(() => { const data = {
          where: { stripeCustomerId: customerId },
          data: {
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            stripePriceId: item?.price?.id,
            ...(plan ? { plan } : {}),
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
          },
        }; wait.check(); return prisma.subscription.updateMany(data); });
        break;
      }
    }
    wait.check();
    return reply({ received: true });
  } catch (error) {
    if (error instanceof WebhookWaitRetired) return reply({ error: 'Espera del webhook finalizada' }, 503);
    if (error instanceof WebhookInputError) return reply({ error: error.message }, error.status);
    console.error('Webhook processing failed');
    // A failed or uncertain wait is not acknowledged. Durable delivery ownership is still pending.
    return reply({ error: 'Error interno procesando el webhook' }, 500);
  } finally { wait.close(); }
}
