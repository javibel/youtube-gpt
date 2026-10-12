import { captureWebhookData, WebhookInputError } from '@/lib/stripe-webhook-contract';
import { captureCheckoutPrices, captureCheckoutSubscription, captureCheckoutCustomer, projectCheckoutBusiness, preflightBillingLink } from '@/lib/checkout-webhook-business';
const id = (v: unknown, prefix: string): v is string => typeof v === 'string' && v.length <= 128 && new RegExp('^' + prefix + '_[A-Za-z0-9_]+$').test(v);
const seconds = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 253402300799;
const amount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const invalid = () => { throw new WebhookInputError(400, 'Factura inconsistente'); };
function reference(v: any, prefix: string, object: string) {
  if (typeof v === 'string') return id(v,prefix) ? v : invalid();
  return v && v.object === object && id(v.id,prefix) && (v.deleted === undefined || v.deleted === false) ? v.id : invalid();
}
// Data validation only. Paid fields and event.created never establish settlement,
// provenance, consent, freshness, delivery ownership, or entitlement.
export function invoiceEventProjection(event: any, check: () => void) {
  event = captureWebhookData(event, check);
  if (!event || event.type !== 'invoice.payment_succeeded') return invalid();
  const invoice = event.data?.object;
  if (!invoice || invoice.object !== 'invoice' || !id(invoice.id,'in') ||
      invoice.status !== 'paid' || invoice.paid !== true ||
      !['eur','usd'].includes(invoice.currency) || !amount(invoice.amount_paid) ||
      !amount(invoice.amount_due) || invoice.amount_remaining !== 0) return invalid();
  if (invoice.subscription === null) return null;
  const subscriptionId = reference(invoice.subscription,'sub','subscription'),
    customerId = reference(invoice.customer,'cus','customer');
  if (!['subscription_create','subscription_cycle','subscription_update'].includes(invoice.billing_reason))
    throw new WebhookInputError(503, 'Factura pendiente de conciliación original');
  const lines = invoice.lines;
  if (!lines || lines.object !== 'list' || lines.has_more !== false ||
      !Array.isArray(lines.data) || lines.data.length !== 1)
    throw new WebhookInputError(503, 'Líneas de factura no confirmadas');
  const line = lines.data[0], price = line?.price, prorated = invoice.billing_reason === 'subscription_update';
  if (prorated && line?.proration === false) throw new WebhookInputError(503, 'Variante de actualización no confirmada');
  if (!line || !id(line.id,'il') || line.object !== 'line_item' || line.type !== 'subscription' ||
      line.proration !== prorated || line.quantity !== 1 || line.currency !== invoice.currency ||
      (line.invoice != null && line.invoice !== invoice.id) ||
      !(prorated ? Number.isSafeInteger(line.amount) : amount(line.amount)) ||
      reference(line.subscription,'sub','subscription') !== subscriptionId ||
      !price || price.object !== 'price' || !id(price.id,'price') || price.currency !== invoice.currency ||
      !['month','year'].includes(price.recurring?.interval) || price.recurring?.interval_count !== 1 ||
      !seconds(line.period?.start) || !seconds(line.period?.end) || line.period.start >= line.period.end) return invalid();
  const itemId = reference(line.subscription_item,'si','subscription_item');
  check();
  return Object.freeze({ invoiceId: invoice.id, customerId, subscriptionId, itemId,
    priceId: price.id, interval: price.recurring.interval, currency: invoice.currency,
    billingReason: invoice.billing_reason, prorated,
    amountPaidCents: invoice.amount_paid, amountDueCents: invoice.amount_due, lineAmountCents: line.amount,
    periodStartSeconds: line.period.start, periodEndSeconds: line.period.end, writeAuthorized: false as const });
}
export async function preflightInvoiceBusiness(invoice: NonNullable<ReturnType<typeof invoiceEventProjection>>,
    subscription: unknown, customer: unknown, prices: ReturnType<typeof captureCheckoutPrices>, check: () => void) {
  invoice = captureWebhookData(invoice, check);
  const sub = captureCheckoutSubscription(subscription, check), ownCustomer = captureCheckoutCustomer(customer, check);
  const projected = projectCheckoutBusiness({ userId: sub.metadata?.userId, customerId: invoice.customerId,
    subscriptionId: invoice.subscriptionId, paymentStatus: 'paid' }, sub, ownCustomer, prices, check);
  const item = sub.items.data[0];
  // Preserve the declared partial span; never compute a time ratio or renew dates.
  const periodMatches = invoice.prorated
    ? invoice.periodStartSeconds >= projected.periodStartSeconds && invoice.periodEndSeconds === projected.periodEndSeconds
    : invoice.periodStartSeconds === projected.periodStartSeconds && invoice.periodEndSeconds === projected.periodEndSeconds;
  if (item.id !== invoice.itemId || projected.priceId !== invoice.priceId ||
      projected.currency !== invoice.currency || item.price.recurring.interval !== invoice.interval ||
      !periodMatches) return invalid();
  const owner = await preflightBillingLink(projected, check);
  check();
  return Object.freeze({ ...projected, ...invoice, subscriptionPeriodStartSeconds: projected.periodStartSeconds,
    subscriptionPeriodEndSeconds: projected.periodEndSeconds, linkedRowId: owner.rowId, writeAuthorized: false as const });
}
