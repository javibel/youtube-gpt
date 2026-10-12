import { captureWebhookData, WebhookInputError } from '@/lib/stripe-webhook-contract';
import { captureCheckoutPrices, captureCheckoutSubscription, captureCheckoutCustomer, preflightBillingLink } from '@/lib/checkout-webhook-business';
const id = (v: unknown, prefix: string): v is string => typeof v === 'string' && v.length <= 128 && new RegExp('^' + prefix + '_[A-Za-z0-9_]+$').test(v);
const seconds = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 253402300799;
const invalid = () => { throw new WebhookInputError(400, 'Suscripción inconsistente'); };
function reference(v: any) {
  if (typeof v === 'string') return id(v,'cus') ? v : invalid();
  return v && v.object === 'customer' && id(v.id,'cus') && (v.deleted === undefined || v.deleted === false) ? v.id : invalid();
}
function pair(primary: unknown, item: unknown) {
  if (primary != null && !seconds(primary)) return invalid();
  if (item != null && !seconds(item)) return invalid();
  if (primary != null && item != null && primary !== item) return invalid();
  return primary ?? item;
}
// Explicit event data only. Neither terminal status nor dates retire billing,
// prove current access, or authorize a subscription writer/recovery.
export function subscriptionEventProjection(event: any, prices: ReturnType<typeof captureCheckoutPrices>, check: () => void) {
  event = captureWebhookData(event, check);prices = captureWebhookData(prices, check);
  if (!prices || !Array.isArray(prices)) throw new WebhookInputError(503, 'Precios de suscripción no configurados');
  if (!event || !['customer.subscription.updated','customer.subscription.deleted'].includes(event.type)) return invalid();
  const input = event.data?.object, sub = captureCheckoutSubscription(input, check);
  const userId = sub.metadata?.userId, customerId = reference(sub.customer);
  if (sub.object !== 'subscription' || !id(sub.id,'sub') ||
      typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(userId) ||
      sub.metadata?.service !== 'YTubViral.com' ||
      !['active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused'].includes(sub.status) ||
      (event.type === 'customer.subscription.deleted' && sub.status !== 'canceled') ||
      typeof sub.cancel_at_period_end !== 'boolean') return invalid();
  const items = sub.items;
  if (!items || items.object !== 'list' || items.has_more !== false || !Array.isArray(items.data) || items.data.length !== 1) return invalid();
  const item = items.data[0], price = item?.price, selected = prices.find(p=>p.id === price?.id);
  if (!item || item.object !== 'subscription_item' || !id(item.id,'si') || item.quantity !== 1 ||
      !price || price.object !== 'price' || !selected || sub.metadata.plan !== selected.plan ||
      !['eur','usd'].includes(price.currency) || sub.currency !== price.currency ||
      price.recurring?.interval !== selected.interval || price.recurring?.interval_count !== 1) return invalid();
  const canceled = input.canceled_at ?? null, ended = input.ended_at ?? null;
  for (const value of [canceled,ended,sub.trial_start,sub.trial_end]) if (value != null && !seconds(value)) return invalid();
  if (canceled != null && ended != null && canceled > ended) return invalid();
  if (sub.status === 'canceled' && (!seconds(canceled) || !seconds(ended))) return invalid();
  let start = pair(sub.current_period_start,item.current_period_start), end = pair(sub.current_period_end,item.current_period_end);
  if (sub.status === 'trialing') {
    if (!seconds(sub.trial_end) || (end != null && end !== sub.trial_end)) return invalid();
    end = sub.trial_end;start ??= sub.trial_start;
  }
  if (!seconds(start) || !seconds(end) || start >= end) return invalid();
  check();
  return Object.freeze({ eventType: event.type as string, userId, customerId, subscriptionId: sub.id,
    itemId: item.id, priceId: selected.id, plan: selected.plan, status: sub.status,
    currency: price.currency, cancelAtPeriodEnd: sub.cancel_at_period_end,
    periodStartSeconds: start, periodEndSeconds: end, canceledAtSeconds: canceled, endedAtSeconds: ended,
    writeAuthorized: false as const });
}
export async function preflightSubscriptionBusiness(projection: ReturnType<typeof subscriptionEventProjection>, customer: unknown, check: () => void) {
  const original = captureWebhookData(projection, check), ownCustomer = captureCheckoutCustomer(customer, check);
  if (ownCustomer.object !== 'customer' || ownCustomer.id !== original.customerId ||
      !(ownCustomer.deleted === undefined || ownCustomer.deleted === false) || ownCustomer.metadata?.userId !== original.userId ||
      typeof ownCustomer.email !== 'string' || !ownCustomer.email || ownCustomer.email.length > 320 ||
      /[\u0000-\u0020\u007f]/.test(ownCustomer.email)) return invalid();
  const captured = Object.freeze({ ...original, email: ownCustomer.email, writeAuthorized: false as const });
  const owner = await preflightBillingLink(captured, check);
  check();
  return Object.freeze({ ...captured, linkedRowId: owner.rowId, writeAuthorized: false as const });
}
