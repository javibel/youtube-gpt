import { stripe } from '@/lib/stripe';
import { captureWebhookEvent, checkoutEventProjection, WebhookInputError } from '@/lib/stripe-webhook-contract';
import { captureCheckoutPrices, captureCheckoutSubscription, captureCheckoutCustomer, preflightCheckoutBusiness } from '@/lib/checkout-webhook-business';

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
export async function preflightCheckoutOriginal(value: unknown) {
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
    return result; // Always writeAuthorized:false. Native durable denial/admission is still pending.
  } catch(error) {
    original.retired = true;
    throw error;
  }
}
