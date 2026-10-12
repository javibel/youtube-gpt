import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { captureWebhookEvent, checkoutEventProjection, WebhookInputError } from '@/lib/stripe-webhook-contract';
import { captureCheckoutPrices, captureCheckoutSubscription, captureCheckoutCustomer, preflightCheckoutBusiness } from '@/lib/checkout-webhook-business';

import { invoiceEventProjection, preflightInvoiceBusiness } from '@/lib/invoice-webhook-business';

export class WebhookSignatureFailure extends Error {}
type Prices = ReturnType<typeof captureCheckoutPrices>;
type Original = { event: any; prices: Prices; check: () => void; claimed: boolean; retired: boolean };
const originals = new WeakMap<object, Original>();
// Opaque custody of this physically retained verification only. Never durable admission or write permission.
export type WebhookOriginal = Readonly<{ readonly __webhookOriginal?: never }>;
function owned(value: unknown): Original {
  const original = value && typeof value === 'object' ? originals.get(value) : undefined;
  if (!original || original.retired) throw new WebhookInputError(503, 'Original de webhook no disponible');
  try { original.check(); } catch (error) { original.retired = true; throw error; }
  return original;
}
export function snapshotWebhookOriginal(value: unknown) {
  return owned(value).event;
}
export function retireWebhookOriginal(value: unknown) {
  if (value && typeof value === 'object') {
    const original = originals.get(value);
    if (original) original.retired = true;
  }
}
export function prepareWebhookVerification(check: () => void) {
  check();
  // Only trusted server configuration supplies the secret/catalog; callers cannot provide either.
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const prices = captureCheckoutPrices(process.env);
  if (!secret || secret.length > 4096) throw new WebhookInputError(503, 'Webhook no configurado');
  let used = false, closed = false, retained: WebhookOriginal | undefined;
  return Object.freeze({
    verify(body: string, signature: string): WebhookOriginal {
      if (used || closed) throw new WebhookInputError(503, 'Verificación original consumida');
      used = true; // A failure/retired wait never reopens this verifier.
      check();
      if (typeof body !== 'string' || !body || body.length > 262144 ||
          typeof signature !== 'string' || !signature.trim() || signature.length > 4096)
        throw new WebhookInputError(400, 'Entrada de webhook inválida');
      let verified: unknown;
      try { verified = stripe.webhooks.constructEvent(body, signature, secret); }
      catch { check(); throw new WebhookSignatureFailure(); }
      check();
      const event = captureWebhookEvent(verified, check);
      const token = Object.freeze(Object.create(null)) as WebhookOriginal;
      originals.set(token, { event, prices, check, claimed: false, retired: false });
      retained = token;
      return token;
    },
    close() {
      closed = true;
      used = true;
      retireWebhookOriginal(retained);
    },
  });
}
async function consumeCheckoutOriginal(value: unknown, durable: boolean) {
  const original = owned(value);
  if (original.claimed) throw new WebhookInputError(503, 'Preflight original consumido');
  original.claimed = true; // Single live invocation, never lookup/retry by serialized event or selector.
  const check = () => { if (original.retired) throw new WebhookInputError(503, 'Original de webhook retirado'); try { original.check(); } catch(error) { original.retired = true; throw error; } };
  try {
    check();
    const checkout = checkoutEventProjection(original.event);
    if (!checkout) throw new WebhookInputError(400, 'Original no es checkout de suscripción');
    if (!original.prices) throw new WebhookInputError(503, 'Precios de checkout no configurados');
    const subscription = captureCheckoutSubscription(await stripe.subscriptions.retrieve(checkout.subscriptionId), check);
    check();
    const customer = captureCheckoutCustomer(await stripe.customers.retrieve(checkout.customerId), check);
    check();
    const result = await preflightCheckoutBusiness(checkout, subscription, customer, original.prices, check);
    check();
    const outcome = durable ? await denyCheckout(original, result, check) : result;
    check();
    return outcome; // Never write permission.
  } catch(error) {
    original.retired = true;
    throw error;
  }
}

async function denyCheckout(original: Original, result: Awaited<ReturnType<typeof preflightCheckoutBusiness>>, check: () => void) {
  // This transaction only records permanent denial. Native ACK is retained by
  // this invocation; a later row read cannot recover it or authorize a writer.
  const checkout = checkoutEventProjection(original.event)!;
  if (!result || result.writeAuthorized !== false || [result.userId,result.email,result.customerId,result.subscriptionId,result.linkedRowId].some(v => typeof v !== "string" || !v))
    throw new WebhookInputError(503, "Preflight no confirmado");
  const captured = Object.freeze({ id: randomUUID(), userId: result.userId, email: result.email,
    eventId: original.event.id as string, sessionId: checkout.sessionId,
    customerId: result.customerId, stripeSubscriptionId: result.subscriptionId,
    linkedSubscriptionId: result.linkedRowId, state: 'pending' });
  const row = await prisma.$transaction(async tx => {
    check();
    const users = await tx.$queryRawUnsafe<Array<{id: string; email: string}>>(
      'SELECT id,email FROM users WHERE id=$1 FOR UPDATE', result.userId);
    check();
    if (users.length !== 1 || users[0].id !== result.userId || users[0].email !== result.email)
      throw new WebhookInputError(503, 'Vínculo de checkout no confirmado');
    const rows = await tx.$queryRawUnsafe<Array<{id: string}>>(
      'SELECT id FROM subscriptions WHERE "userId"=$1 FOR UPDATE', result.userId);
    check();
    if (rows.length !== 1 || rows[0].id !== result.linkedRowId)
      throw new WebhookInputError(503, 'Vínculo de checkout no confirmado');
    const latest = await tx.user.findUnique({ where: { id: result.userId }, include: { subscription: true } });
    check();
    if (!latest || latest.id !== result.userId || latest.email !== result.email ||
        latest.subscription?.id !== result.linkedRowId || latest.subscription.userId !== result.userId ||
        latest.subscription.stripeCustomerId !== result.customerId)
      throw new WebhookInputError(503, 'Vínculo de checkout no confirmado');
    const linked = await tx.subscription.findMany({ where: { stripeCustomerId: result.customerId },
      select: { id: true, userId: true, stripeCustomerId: true }, orderBy: { id: 'asc' }, take: 2 });
    check();
    if (linked.length !== 1 || linked[0].id !== result.linkedRowId ||
        linked[0].userId !== result.userId || linked[0].stripeCustomerId !== result.customerId)
      throw new WebhookInputError(503, 'Vínculo de checkout ambiguo');
    // All states deny. A complete checkout is not permission to retire its
    // original, associate a new customer, or activate subscription entitlement.
    for (const read of [
      () => tx.checkoutAttempt.findUnique({ where: { userId: result.userId } }),
      () => tx.subscriptionCancellationAttempt.findUnique({ where: { userId: result.userId } }),
      () => tx.subscriptionDowngradeAttempt.findUnique({ where: { userId: result.userId } }),
      () => tx.subscriptionSyncAttempt.findUnique({ where: { userId: result.userId } }),
    ]) {
      const prior = await read();
      check();
      if (prior) throw new WebhookInputError(503, 'Admisión de billing pendiente');
    }
    const prior = await tx.checkoutWebhookDenial.findFirst({ where: { OR: [
      { userId: captured.userId }, { eventId: captured.eventId }, { sessionId: captured.sessionId },
      { customerId: captured.customerId },
    ] } });
    check();
    if (prior) throw new WebhookInputError(503, 'Webhook pendiente de conciliación original');
    const created = await tx.checkoutWebhookDenial.create({ data: captured });
    // Capture native return before commit/next await; no read-back fallback.
    check();
    if (!created || !Object.entries(captured).every(([k,v]) => (created as Record<string,unknown>)[k] === v))
      throw new WebhookInputError(503, 'Acuse de negación no confirmado');
    return true;
  }, { maxWait: 5000, timeout: 10000 });
  check();
  if (row !== true) throw new WebhookInputError(503, 'Acuse de negación no confirmado');
  return Object.freeze({ ...result, denialAcknowledged: true as const, writeAuthorized: false as const });
}

export const preflightCheckoutOriginal = (value: unknown) => consumeCheckoutOriginal(value, false);
export const admitCheckoutOriginal = (value: unknown) => consumeCheckoutOriginal(value, true);

export async function preflightInvoiceOriginal(value: unknown) {
  const original = owned(value);
  if (original.claimed) throw new WebhookInputError(503, 'Preflight original consumido');
  original.claimed = true;
  const check = () => { if (original.retired) throw new WebhookInputError(503, 'Original de webhook retirado'); try { original.check(); } catch(error) { original.retired = true; throw error; } };
  try {
    check();
    const invoice = invoiceEventProjection(original.event, check);
    if (!invoice) return null;
    if (!original.prices) throw new WebhookInputError(503, 'Precios de factura no configurados');
    const subscription = captureCheckoutSubscription(await stripe.subscriptions.retrieve(invoice.subscriptionId), check);
    check();
    const customer = captureCheckoutCustomer(await stripe.customers.retrieve(invoice.customerId), check);
    check();
    const result = await preflightInvoiceBusiness(invoice, subscription, customer, original.prices, check);
    check();
    return result; // Read-only only. Invoice admission, commission and writer remain pending.
  } catch(error) {
    original.retired = true;
    throw error;
  }
}
