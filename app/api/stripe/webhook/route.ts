import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prepareWebhookVerification, snapshotWebhookOriginal, admitCheckoutOriginal, admitInvoiceOriginal, admitFailedInvoiceOriginal, admitRefundOriginal, admitSubscriptionOriginal, WebhookSignatureFailure } from '@/lib/webhook-original';
import { checkoutEventProjection, WebhookInputError } from '@/lib/stripe-webhook-contract';
import { readWebhookBody, webhookWait, WebhookWaitRetired } from '@/lib/stripe-webhook-intake';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
        const projected = await wait.run(() => admitInvoiceOriginal(original));
        if (projected) throw new WebhookInputError(503, 'Factura pendiente de conciliación original');
        break;
      }

      case 'customer.subscription.trial_will_end': {
        await wait.run(() => admitSubscriptionOriginal(original));
        // No notice/portal is admitted by a read-only original projection.
        throw new WebhookInputError(503, 'Aviso de trial pendiente de admisión original');
      }

      case 'invoice.payment_failed': {
        const projected = await wait.run(() => admitFailedInvoiceOriginal(original));
        if (projected) throw new WebhookInputError(503, 'Aviso de factura fallida pendiente de admisión original');
        break;
      }

      case 'charge.refunded': {
        const projected = await wait.run(() => admitRefundOriginal(original));
        if (projected) throw new WebhookInputError(503, 'Reversión pendiente de admisión original');
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await wait.run(() => admitSubscriptionOriginal(original));
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
