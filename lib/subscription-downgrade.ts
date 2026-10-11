import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { isPaidStatus } from '@/lib/plans';
import type { Prisma } from '@prisma/client';

export const validDowngradeKey = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
type Input = { subscriptionId?: string; plan?: 'business' };
export function validDowngradeInput(v: unknown, keyed: boolean): v is Input {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>, keys = Object.keys(r);
  if (!keyed && keys.length === 0) return true;
  return keys.length === 2 && Object.hasOwn(r, 'subscriptionId') && Object.hasOwn(r, 'plan')
    && validDowngradeKey(r.subscriptionId) && r.plan === 'business';
}
type Owner = { userId: string; email: string };
type Outcome = { ok: true; userId: string; email: string; key: string; subscriptionId: string; plan: 'pro'; mode: 'simulated' }
  | { ok: false; status: number; error: string };
const unconfirmed = (): Outcome => ({ ok: false, status: 503, error: 'downgrade_unconfirmed' });

// Durable rows only deny another original. Neither provider reads nor complete
// rows recover a lost acknowledgement, release checkout, or resume this producer.
export async function downgradeSubscriptionOriginal(owner: Owner, input: Input, key: string, check: () => void): Promise<Outcome> {
  try {
    check();
    if (!validDowngradeInput(input, false) || !validDowngradeKey(key) || !validDowngradeKey(owner.userId) || typeof owner.email !== 'string'
      || !owner.email || owner.email.length > 320) return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email });
    const expected = Object.freeze({ ...input });
    const prices = Object.freeze({ month: { source: process.env.STRIPE_BUSINESS_PRICE_ID?.trim(), target: process.env.STRIPE_PRO_PRICE_ID?.trim() }, year: { source: process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID?.trim(), target: process.env.STRIPE_PRO_YEARLY_PRICE_ID?.trim() } });
    const user = await prisma.user.findUnique({ where: { id: own.userId }, include: { subscription: true } });
    check();
    if (!user || user.id !== own.userId || user.email !== own.email) return { ok: false, status: 401, error: 'Unauthorized' };
    const sub = user.subscription;
    if (!sub || !validDowngradeKey(sub.id) || !sub.stripeCustomerId || !/^cus_[A-Za-z0-9_-]{1,128}$/.test(sub.stripeCustomerId)
      || sub.plan !== 'business' || !isPaidStatus(sub.status)) return { ok: false, status: 400, error: 'subscription_unavailable' };
    if (sub.cancelAtPeriodEnd !== false || (expected.subscriptionId !== undefined && (sub.id !== expected.subscriptionId || sub.plan !== expected.plan))) return unconfirmed();
    const interval = sub.stripePriceId && sub.stripePriceId === prices.month.source ? 'month' : sub.stripePriceId && sub.stripePriceId === prices.year.source ? 'year' : null;
    if (!interval || !/^price_[A-Za-z0-9_-]{1,128}$/.test(sub.stripePriceId!) || prices.month.source === prices.year.source) return unconfirmed();
    const targetPrice = prices[interval].target;
    if (!targetPrice || !/^price_[A-Za-z0-9_-]{1,128}$/.test(targetPrice) || targetPrice === prices.month.source || targetPrice === prices.year.source) return { ok: false, status: 500, error: 'downgrade_price_unavailable' };
    const selection = Object.freeze({ subscriptionId: sub.id, customerId: sub.stripeCustomerId, priceId: sub.stripePriceId,
      plan: sub.plan, status: sub.status, start: sub.currentPeriodStart?.getTime() ?? null, end: sub.currentPeriodEnd?.getTime() ?? null });
    const captured = Object.freeze({ id: randomUUID(), ...own, key, subscriptionId: selection.subscriptionId, plan: selection.plan, status: selection.status });
    const lock = async (tx: Prisma.TransactionClient) => {
      check();
      const owners = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId);
      check();
      if (owners.length !== 1 || owners[0].id !== own.userId || owners[0].email !== own.email) throw Error('Downgrade unconfirmed');
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM subscriptions WHERE "userId"=$1 FOR UPDATE', own.userId);
      check();
      if (rows.length !== 1 || rows[0].id !== selection.subscriptionId) throw Error('Downgrade unconfirmed');
      const latest = await tx.user.findUnique({ where: { id: own.userId }, include: { subscription: true } });
      check();
      const current = latest?.subscription;
      if (!latest || latest.id !== own.userId || latest.email !== own.email || !current || current.id !== selection.subscriptionId
        || current.stripeCustomerId !== selection.customerId || current.stripePriceId !== selection.priceId || current.plan !== selection.plan
        || current.status !== selection.status || current.cancelAtPeriodEnd !== false
        || (current.currentPeriodStart?.getTime() ?? null) !== selection.start || (current.currentPeriodEnd?.getTime() ?? null) !== selection.end) throw Error('Downgrade unconfirmed');
    };
    const matches = (row: Record<string, unknown> | null) => !!row && row.state === 'pending' && Object.entries(captured).every(([k,v]) => row[k] === v);
    const admission = await prisma.$transaction(async tx => {
      await lock(tx);
      const sync = await tx.subscriptionSyncAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (sync) return null;
      const checkout = await tx.checkoutAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (checkout && checkout.state !== 'complete') return null;
      const cancellation = await tx.subscriptionCancellationAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (cancellation) return null;
      const prior = await tx.subscriptionDowngradeAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (prior) return null;
      const row = await tx.subscriptionDowngradeAttempt.create({ data: { ...captured, state: 'pending' } });
      check(); return row;
    }, { maxWait: 10_000, timeout: 15_000 });
    check(); if (!matches(admission)) return unconfirmed();
    await prisma.$transaction(async tx => {
      await lock(tx);
      const row = await tx.subscriptionDowngradeAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (!matches(row)) throw Error('Downgrade unconfirmed');
      const listed = await stripe.subscriptions.list({ customer: selection.customerId, status: 'all', limit: 10 });
      check();
      if (!listed || listed.has_more !== false || !Array.isArray(listed.data)) throw Error('Downgrade unconfirmed');
      const candidates = listed.data.filter(s => isPaidStatus(s.status));
      if (candidates.length !== 1) throw Error('Downgrade unconfirmed');
      const original = candidates[0];
      const originalItem = original?.items?.data?.[0];
      const providerSelection = Object.freeze({ id: original.id, status: original.status, itemId: originalItem?.id, currency: originalItem?.price?.currency });
      const validItems = (s: typeof original, price: string) => s?.items?.data?.length === 1
        && s.items.data[0].id === providerSelection.itemId && s.items.data[0].quantity === 1
        && s.items.data[0].price?.id === price && s.items.data[0].price?.currency === providerSelection.currency
        && s.items.data[0].price?.recurring?.interval === interval && s.items.data[0].price?.recurring?.interval_count === 1;
      if (!original || typeof original.id !== 'string' || !/^sub_[A-Za-z0-9_-]{1,128}$/.test(original.id)
        || !originalItem || !/^si_[A-Za-z0-9_-]{1,128}$/.test(originalItem.id) || !['eur','usd'].includes(originalItem.price?.currency)
        || original.customer !== selection.customerId || original.status !== selection.status || original.cancel_at_period_end !== false
        || !validItems(original, selection.priceId!)) throw Error('Downgrade unconfirmed');
      check();
      const updated = await stripe.subscriptions.update(providerSelection.id, { items: [{ id: providerSelection.itemId, price: targetPrice }], proration_behavior: 'create_prorations' });
      check();
      if (!updated || updated.id !== providerSelection.id || updated.customer !== selection.customerId || updated.status !== providerSelection.status
        || updated.cancel_at_period_end !== false || !validItems(updated, targetPrice)) throw Error('Downgrade unconfirmed');
      const stored = await tx.subscription.updateMany({ where: { id: selection.subscriptionId, userId: own.userId, stripeCustomerId: selection.customerId,
        stripePriceId: selection.priceId, plan: selection.plan, status: selection.status, cancelAtPeriodEnd: false }, data: { plan: 'pro', stripePriceId: targetPrice } });
      check(); if (stored.count !== 1) throw Error('Downgrade unconfirmed');
      // A provider effect cannot roll back with SQL. Ambiguous writes/markers
      // keep the separately committed admission; never reconcile from a row.
      const marked = await tx.subscriptionDowngradeAttempt.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Downgrade unconfirmed');
    }, { maxWait: 10_000, timeout: 55_000 });
    check();
    return Object.freeze({ ok: true, ...own, key, subscriptionId: selection.subscriptionId, plan: 'pro', mode: 'simulated' });
  } catch { return unconfirmed(); }
}
