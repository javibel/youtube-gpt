import { prisma } from '@/lib/prisma';
import { captureWebhookData, WebhookInputError } from '@/lib/stripe-webhook-contract';
type Catalog = ReadonlyArray<Readonly<{ id: string; plan: 'pro' | 'business'; interval: 'month' | 'year' }>>;
const id = (v: unknown, prefix: string): v is string => typeof v === 'string' && v.length <= 128 && new RegExp('^' + prefix + '_[A-Za-z0-9_]+$').test(v);
const seconds = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 253402300799;
const invalid = () => { throw new WebhookInputError(400, 'Datos de checkout inconsistentes'); };
export function captureCheckoutPrices(env: Record<string, string | undefined>): Catalog | null {
  const entries = [
    { name: 'STRIPE_PRO_PRICE_ID', plan: 'pro', interval: 'month' },
    { name: 'STRIPE_PRO_YEARLY_PRICE_ID', plan: 'pro', interval: 'year' },
    { name: 'STRIPE_BUSINESS_PRICE_ID', plan: 'business', interval: 'month' },
    { name: 'STRIPE_BUSINESS_YEARLY_PRICE_ID', plan: 'business', interval: 'year' },
  ] as const;
  const prices = entries.map(p => Object.freeze({ id: typeof env[p.name] === 'string' ? env[p.name]!.trim() : '', plan: p.plan, interval: p.interval }));
  return prices.every(p => id(p.id, 'price')) && new Set(prices.map(p => p.id)).size === 4 ? Object.freeze(prices) : null;
}
function selectData(input: unknown, fields: string[], check: () => void) {
  check();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const projected = Object.create(null), descriptors = Object.getOwnPropertyDescriptors(input);
  for (const name of fields) {
    check();
    const d = descriptors[name];
    if (d) {
      if (!Object.hasOwn(d, 'value')) return invalid();
      // Stripe SDK transport metadata (lastResponse) is not business data.
      Object.defineProperty(projected, name, { value: d.value, enumerable: true });
    }
  }
  return captureWebhookData(projected, check);
}
export const captureCheckoutSubscription = (input: unknown, check: () => void) => selectData(input,
  ['object', 'id', 'customer', 'metadata', 'status', 'currency', 'cancel_at_period_end', 'items', 'current_period_start', 'current_period_end', 'trial_start', 'trial_end'], check);
export const captureCheckoutCustomer = (input: unknown, check: () => void) => selectData(input,
  ['object', 'id', 'email', 'deleted', 'metadata'], check);
function reference(value: any, prefix: string, object: string) {
  if (typeof value === 'string') return id(value, prefix) ? value : invalid();
  return value && value.object === object && id(value.id, prefix) && (value.deleted === undefined || value.deleted === false) ? value.id : invalid();
}
function declaredPair(primary: unknown, item: unknown) {
  if (primary !== undefined && primary !== null && !seconds(primary)) return invalid();
  if (item !== undefined && item !== null && !seconds(item)) return invalid();
  if (primary != null && item != null && primary !== item) return invalid();
  return primary ?? item;
}
// Projection retains declared data. It cannot grant entitlement or recover a producer.
export function projectCheckoutBusiness(checkout: any, subscription: any, customer: any, prices: Catalog | null, check: () => void) {
  check();
  checkout = captureWebhookData(checkout, check);
  subscription = captureCheckoutSubscription(subscription, check);
  customer = captureCheckoutCustomer(customer, check);
  prices = captureWebhookData(prices, check);
  if (!prices || !Array.isArray(prices)) throw new WebhookInputError(503, 'Precios de checkout no configurados');
  if (!checkout || !id(checkout.subscriptionId, 'sub') || !id(checkout.customerId, 'cus') ||
      typeof checkout.userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(checkout.userId)) return invalid();
  if (!subscription || subscription.object !== 'subscription' || subscription.id !== checkout.subscriptionId ||
      reference(subscription.customer, 'cus', 'customer') !== checkout.customerId ||
      subscription.metadata?.userId !== checkout.userId || subscription.metadata?.service !== 'YTubViral.com' ||
      !['active', 'trialing'].includes(subscription.status) || typeof subscription.cancel_at_period_end !== 'boolean' ||
      !['paid', 'no_payment_required'].includes(checkout.paymentStatus)) return invalid();
  if (!customer || customer.object !== 'customer' || customer.id !== checkout.customerId ||
      !(customer.deleted === undefined || customer.deleted === false) || customer.metadata?.userId !== checkout.userId ||
      typeof customer.email !== 'string' || !customer.email || customer.email.length > 320 || /[\u0000-\u0020\u007f]/.test(customer.email)) return invalid();
  const items = subscription.items;
  if (!items || items.object !== 'list' || items.has_more !== false || !Array.isArray(items.data) || items.data.length !== 1) return invalid();
  const item = items.data[0], price = item?.price, selected = prices.find(p => p.id === price?.id);
  if (!item || item.object !== 'subscription_item' || !id(item.id, 'si') || item.quantity !== 1 ||
      !price || price.object !== 'price' || !selected || subscription.metadata.plan !== selected.plan ||
      !['eur', 'usd'].includes(price.currency) || subscription.currency !== price.currency ||
      price.recurring?.interval !== selected.interval || price.recurring?.interval_count !== 1) return invalid();
  for (const ts of [subscription.trial_start, subscription.trial_end]) if (ts !== undefined && ts !== null && !seconds(ts)) return invalid();
  let start = declaredPair(subscription.current_period_start, item.current_period_start),
    end = declaredPair(subscription.current_period_end, item.current_period_end);
  if (subscription.status === 'trialing') {
    if (!seconds(subscription.trial_end) || (end != null && end !== subscription.trial_end)) return invalid();
    end = subscription.trial_end;
    start ??= subscription.trial_start;
  }
  if (!seconds(start) || !seconds(end) || start >= end) return invalid();
  check();
  return Object.freeze({ userId: checkout.userId, email: customer.email, customerId: checkout.customerId,
    subscriptionId: subscription.id, priceId: selected.id, plan: selected.plan, status: subscription.status,
    currency: price.currency, cancelAtPeriodEnd: subscription.cancel_at_period_end,
    periodStartSeconds: start, periodEndSeconds: end, writeAuthorized: false as const });
}
export async function preflightCheckoutBusiness(checkout: any, subscription: any, customer: any, prices: Catalog | null, check: () => void) {
  const original = projectCheckoutBusiness(checkout, subscription, customer, prices, check);
  // Only read linked SQL data. No row/key/snapshot supplies admission, entitlement or recovery authority.
  const owner = await preflightBillingLink(original, check);
  check();
  return Object.freeze({ ...original, linkedRowId: owner.rowId, writeAuthorized: false as const });
}

// Linked owner snapshot only; never admission, bootstrap, entitlement or recovery.
export async function preflightBillingLink(original: Readonly<{userId: string; email: string; customerId: string}>, check: () => void) {
  return await prisma.$transaction(async tx => {
    check();
    const user = await tx.user.findUnique({ where: { id: original.userId }, include: { subscription: true } });
    check();
    if (!user || user.id !== original.userId || user.email !== original.email ||
        !user.subscription || user.subscription.userId !== original.userId ||
        user.subscription.stripeCustomerId !== original.customerId || typeof user.subscription.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(user.subscription.id)) throw new WebhookInputError(503, 'Vínculo de checkout no confirmado');
    const rowId = user.subscription.id;
    const captured = Object.freeze({ userId: user.id, email: user.email, rowId, customerId: user.subscription.stripeCustomerId });
    const linked = await tx.subscription.findMany({ where: { stripeCustomerId: original.customerId },
      select: { id: true, userId: true, stripeCustomerId: true }, orderBy: { id: 'asc' }, take: 2 });
    check();
    if (linked.length !== 1 || linked[0].id !== captured.rowId || linked[0].userId !== captured.userId ||
        linked[0].stripeCustomerId !== captured.customerId) throw new WebhookInputError(503, 'Vínculo de checkout ambiguo');
    return captured;
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
}
