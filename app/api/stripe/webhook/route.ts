import { stripe, createBillingPortalUrl } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prepareWebhookVerification, snapshotWebhookOriginal, admitCheckoutOriginal, preflightInvoiceOriginal, preflightSubscriptionOriginal, WebhookSignatureFailure } from '@/lib/webhook-original';
import { checkoutEventProjection, WebhookInputError } from '@/lib/stripe-webhook-contract';
import { readWebhookBody, webhookWait, WebhookWaitRetired, type WebhookWait } from '@/lib/stripe-webhook-intake';
import { triggerTrialEndingEmail, triggerPaymentFailedEmail } from '@/lib/lifecycle-trigger';
import { reverseAffiliateCommissionForInvoice } from '@/lib/affiliate';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Resolución histórica de dueño para avisos: vínculo por customerId y fallback por email.
// Su contrato, admisión y efectos de notificación siguen pendientes.
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

function reply(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  const wait = webhookWait(request.signal);
  let producer: ReturnType<typeof prepareWebhookVerification> | undefined;
  try {
    wait.check();
    // Capture header and configured secret before waiting for the original raw body.
    const signature = request.headers.get('stripe-signature');

    if (!signature || !signature.trim() || signature.length > 4096) throw new WebhookInputError(400, 'Firma inválida');
    producer = prepareWebhookVerification(wait.check);
    const body = await readWebhookBody(request, wait);
    let original: unknown;
    try {
      wait.check();
      original = producer.verify(body, signature);
      wait.check();
    } catch (error) {
      if (!(error instanceof WebhookSignatureFailure)) throw error;
      console.error('Webhook signature verification failed');
      return reply({ error: 'Firma inválida' }, 400);
    }
    // Snapshot the verified SDK result before any downstream await; no authority is inferred here.
    const event = snapshotWebhookOriginal(original) as Stripe.Event;
    const checkout = checkoutEventProjection(event);
    switch (event.type) {
      case 'checkout.session.completed': {
        if (checkout) {
          await wait.run(() => admitCheckoutOriginal(original));
          // This native ACK records denial only; entitlement and original reconciliation remain pending.
          throw new WebhookInputError(503, 'Evento pendiente de conciliación original');
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const projected = await wait.run(() => preflightInvoiceOriginal(original));
        if (projected) throw new WebhookInputError(503, 'Factura pendiente de conciliación original');
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
        await wait.run(() => preflightSubscriptionOriginal(original));
        throw new WebhookInputError(503, 'Suscripción pendiente de conciliación original');
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
  } finally { producer?.close(); wait.close(); }
}
