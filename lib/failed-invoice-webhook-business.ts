import { captureWebhookData, WebhookInputError } from '@/lib/stripe-webhook-contract';
import { captureCheckoutPrices, captureCheckoutSubscription, captureCheckoutCustomer, preflightBillingLink } from '@/lib/checkout-webhook-business';
import { subscriptionInvoiceLinesProjection } from '@/lib/invoice-webhook-business';
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
  if (invoice.collection_method !== 'charge_automatically')
    throw new WebhookInputError(503, 'Factura fallida pendiente de conciliación original');
  const lines = subscriptionInvoiceLinesProjection(invoice, check);
  check();
  return Object.freeze({ ...lines, amountPaidCents: invoice.amount_paid,
    amountDueCents: invoice.amount_due, amountRemainingCents: invoice.amount_remaining,
    attemptCount: invoice.attempt_count,
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
  if (invoice.prorationLines) for (const line of invoice.prorationLines) {
    check();
    if (!prices.some(price => price.id === line.priceId && price.interval === line.interval)) return invalid();
  }
  for (const ts of [sub.trial_start,sub.trial_end]) if (ts != null && !seconds(ts)) return invalid();
  let start = pair(sub.current_period_start,item.current_period_start), end = pair(sub.current_period_end,item.current_period_end);
  if (sub.status === 'trialing') {
    if (!seconds(sub.trial_end) || (end != null && end !== sub.trial_end)) return invalid();
    end = sub.trial_end;start ??= sub.trial_start;
  }
  if (!seconds(start) || !seconds(end) || start >= end) return invalid();
  const periodMatches = invoice.prorated
    ? invoice.periodStartSeconds >= start && invoice.periodEndSeconds === end
    : invoice.periodStartSeconds === start && invoice.periodEndSeconds === end;
  if (!periodMatches) return invalid();
  const projected = Object.freeze({ ...invoice, userId, email: ownCustomer.email, plan: selected.plan,
    status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end,
    subscriptionPeriodStartSeconds: start, subscriptionPeriodEndSeconds: end, writeAuthorized: false as const });
  const owner = await preflightBillingLink(projected, check);
  check();
  return Object.freeze({ ...projected, linkedRowId: owner.rowId, writeAuthorized: false as const });
}
