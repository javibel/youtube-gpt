import { captureWebhookData, WebhookInputError } from '@/lib/stripe-webhook-contract';
import { captureCheckoutPrices, captureCheckoutSubscription, captureCheckoutCustomer, preflightBillingLink } from '@/lib/checkout-webhook-business';
const id = (v: unknown, prefix: string): v is string => typeof v === 'string' && v.length <= 128 && new RegExp('^' + prefix + '_[A-Za-z0-9_]+$').test(v);
const seconds = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 253402300799;
const amount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const invalid = () => { throw new WebhookInputError(400, 'Factura fallida inconsistente'); };
function reference(v: any, prefix: string, object: string) {
  if (typeof v === 'string') return id(v,prefix) ? v : invalid();
  return v && v.object === object && id(v.id,prefix) && (v.deleted === undefined || v.deleted === false) ? v.id : invalid();
}
function pair(primary: unknown, item: unknown) {
  if (primary != null && !seconds(primary)) return invalid();
  if (item != null && !seconds(item)) return invalid();
  if (primary != null && item != null && primary !== item) return invalid();
  return primary ?? item;
}
// Declared event facts only. A failed attempt cannot establish current debt,
// revoked access, consent, freshness, notice admission or delivery ownership.
export function failedInvoiceEventProjection(event: any, check: () => void) {
  event = captureWebhookData(event, check);
  if (!event || event.type !== 'invoice.payment_failed') return invalid();
  const invoice = event.data?.object;
  if (!invoice || invoice.object !== 'invoice' || !id(invoice.id,'in') ||
      invoice.status !== 'open' || invoice.paid !== false || invoice.attempted !== true ||
      !Number.isSafeInteger(invoice.attempt_count) || invoice.attempt_count < 1 ||
      !['eur','usd'].includes(invoice.currency) || !amount(invoice.amount_paid) ||
      !amount(invoice.amount_due) || invoice.amount_due === 0 ||
      !amount(invoice.amount_remaining) || invoice.amount_remaining === 0) return invalid();
  if (invoice.subscription === null) return null;
  const subscriptionId = reference(invoice.subscription,'sub','subscription'), customerId = reference(invoice.customer,'cus','customer');
  if (invoice.collection_method !== 'charge_automatically' ||
      !['subscription_create','subscription_cycle'].includes(invoice.billing_reason))
    throw new WebhookInputError(503, 'Factura fallida pendiente de conciliación original');
  const lines = invoice.lines;
  if (!lines || lines.object !== 'list' || lines.has_more !== false || !Array.isArray(lines.data) || lines.data.length !== 1)
    throw new WebhookInputError(503, 'Líneas de factura fallida no confirmadas');
  const line = lines.data[0], price = line?.price;
  if (!line || !id(line.id,'il') || line.object !== 'line_item' || line.type !== 'subscription' ||
      line.proration !== false || line.quantity !== 1 || line.currency !== invoice.currency ||
      (line.invoice != null && line.invoice !== invoice.id) || !amount(line.amount) ||
      reference(line.subscription,'sub','subscription') !== subscriptionId ||
      !price || price.object !== 'price' || !id(price.id,'price') || price.currency !== invoice.currency ||
      !['month','year'].includes(price.recurring?.interval) || price.recurring?.interval_count !== 1 ||
      !seconds(line.period?.start) || !seconds(line.period?.end) || line.period.start >= line.period.end) return invalid();
  const itemId = reference(line.subscription_item,'si','subscription_item');
  check();
  return Object.freeze({ invoiceId: invoice.id, customerId, subscriptionId, itemId, priceId: price.id,
    interval: price.recurring.interval, currency: invoice.currency, amountPaidCents: invoice.amount_paid,
    amountDueCents: invoice.amount_due, amountRemainingCents: invoice.amount_remaining, lineAmountCents: line.amount,
    attemptCount: invoice.attempt_count, periodStartSeconds: line.period.start, periodEndSeconds: line.period.end,
    writeAuthorized: false as const });
}
export async function preflightFailedInvoiceBusiness(invoice: NonNullable<ReturnType<typeof failedInvoiceEventProjection>>,
    subscription: unknown, customer: unknown, prices: ReturnType<typeof captureCheckoutPrices>, check: () => void) {
  invoice = captureWebhookData(invoice, check);prices = captureWebhookData(prices, check);
  if (!prices || !Array.isArray(prices)) throw new WebhookInputError(503, 'Precios de factura fallida no configurados');
  const sub = captureCheckoutSubscription(subscription, check), ownCustomer = captureCheckoutCustomer(customer, check), userId = sub.metadata?.userId;
  if (sub.object !== 'subscription' || sub.id !== invoice.subscriptionId ||
      reference(sub.customer,'cus','customer') !== invoice.customerId ||
      typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(userId) || sub.metadata?.service !== 'YTubViral.com' ||
      !['active','trialing','past_due','unpaid','incomplete','canceled','incomplete_expired','paused'].includes(sub.status) ||
      typeof sub.cancel_at_period_end !== 'boolean') return invalid();
  if (!['active','trialing','past_due','unpaid','incomplete'].includes(sub.status))
    throw new WebhookInputError(503, 'Estado de suscripción pendiente de conciliación original');
  if (ownCustomer.object !== 'customer' || ownCustomer.id !== invoice.customerId ||
      !(ownCustomer.deleted === undefined || ownCustomer.deleted === false) || ownCustomer.metadata?.userId !== userId ||
      typeof ownCustomer.email !== 'string' || !ownCustomer.email || ownCustomer.email.length > 320 ||
      /[\u0000-\u0020\u007f]/.test(ownCustomer.email)) return invalid();
  const items = sub.items;
  if (!items || items.object !== 'list' || items.has_more !== false || !Array.isArray(items.data) || items.data.length !== 1) return invalid();
  const item = items.data[0], price = item?.price, selected = prices.find(p=>p.id === price?.id);
  if (!item || item.object !== 'subscription_item' || item.id !== invoice.itemId || item.quantity !== 1 ||
      !price || price.object !== 'price' || !selected || selected.id !== invoice.priceId || sub.metadata.plan !== selected.plan ||
      price.currency !== invoice.currency || sub.currency !== invoice.currency ||
      selected.interval !== invoice.interval || price.recurring?.interval !== invoice.interval ||
      price.recurring?.interval_count !== 1) return invalid();
  for (const ts of [sub.trial_start,sub.trial_end]) if (ts != null && !seconds(ts)) return invalid();
  let start = pair(sub.current_period_start,item.current_period_start), end = pair(sub.current_period_end,item.current_period_end);
  if (sub.status === 'trialing') {
    if (!seconds(sub.trial_end) || (end != null && end !== sub.trial_end)) return invalid();
    end = sub.trial_end;start ??= sub.trial_start;
  }
  if (!seconds(start) || !seconds(end) || start >= end || start !== invoice.periodStartSeconds || end !== invoice.periodEndSeconds) return invalid();
  const projected = Object.freeze({ ...invoice, userId, email: ownCustomer.email, plan: selected.plan,
    status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end, writeAuthorized: false as const });
  const owner = await preflightBillingLink(projected, check);
  check();
  return Object.freeze({ ...projected, linkedRowId: owner.rowId, writeAuthorized: false as const });
}
