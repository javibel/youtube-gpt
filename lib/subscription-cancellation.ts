import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { isPaidStatus } from '@/lib/plans';
import type { Prisma } from '@prisma/client';

export const validCancellationKey = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
type Input = { subscriptionId?: string; plan?: 'pro' | 'business' };
export function validCancellationInput(v: unknown, keyed: boolean): v is Input {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>, keys = Object.keys(r);
  if (!keyed && keys.length === 0) return true;
  return keys.length === 2 && Object.hasOwn(r, 'subscriptionId') && Object.hasOwn(r, 'plan')
    && validCancellationKey(r.subscriptionId) && ['pro', 'business'].includes(r.plan as string);
}
type Owner = { userId: string; email: string };
type Outcome = { ok: true; userId: string; email: string; key: string; subscriptionId: string; cancelAtPeriodEnd: true; mode: 'simulated' }
  | { ok: false; status: number; error: string };
const unconfirmed = (): Outcome => ({ ok: false, status: 503, error: 'cancellation_unconfirmed' });

// Durable rows only deny another original. Neither provider reads nor complete
// rows recover a lost acknowledgement, release checkout, or resume this producer.
export async function cancelSubscriptionOriginal(owner: Owner, input: Input, key: string, check: () => void): Promise<Outcome> {
  try {
    check();
    if (!validCancellationInput(input, false) || !validCancellationKey(key) || !validCancellationKey(owner.userId) || typeof owner.email !== 'string'
      || !owner.email || owner.email.length > 320) return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email });
    const expected = Object.freeze({ ...input });
    const user = await prisma.user.findUnique({ where: { id: own.userId }, include: { subscription: true } });
    check();
    if (!user || user.id !== own.userId || user.email !== own.email) return { ok: false, status: 401, error: 'Unauthorized' };
    const sub = user.subscription;
    if (!sub || !validCancellationKey(sub.id) || !sub.stripeCustomerId || !/^cus_[A-Za-z0-9_-]{1,128}$/.test(sub.stripeCustomerId)
      || !['pro', 'business'].includes(sub.plan) || !isPaidStatus(sub.status)) return { ok: false, status: 400, error: 'subscription_unavailable' };
    if (sub.cancelAtPeriodEnd !== false || (expected.subscriptionId !== undefined && (sub.id !== expected.subscriptionId || sub.plan !== expected.plan))) return unconfirmed();
    const selection = Object.freeze({ subscriptionId: sub.id, customerId: sub.stripeCustomerId, priceId: sub.stripePriceId,
      plan: sub.plan, status: sub.status, start: sub.currentPeriodStart?.getTime() ?? null, end: sub.currentPeriodEnd?.getTime() ?? null });
    const captured = Object.freeze({ id: randomUUID(), ...own, key, subscriptionId: selection.subscriptionId, plan: selection.plan, status: selection.status });
    const lock = async (tx: Prisma.TransactionClient) => {
      check();
      const owners = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId);
      check();
      if (owners.length !== 1 || owners[0].id !== own.userId || owners[0].email !== own.email) throw Error('Cancellation unconfirmed');
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM subscriptions WHERE "userId"=$1 FOR UPDATE', own.userId);
      check();
      if (rows.length !== 1 || rows[0].id !== selection.subscriptionId) throw Error('Cancellation unconfirmed');
      const latest = await tx.user.findUnique({ where: { id: own.userId }, include: { subscription: true } });
      check();
      const current = latest?.subscription;
      if (!latest || latest.id !== own.userId || latest.email !== own.email || !current || current.id !== selection.subscriptionId
        || current.stripeCustomerId !== selection.customerId || current.stripePriceId !== selection.priceId || current.plan !== selection.plan
        || current.status !== selection.status || current.cancelAtPeriodEnd !== false
        || (current.currentPeriodStart?.getTime() ?? null) !== selection.start || (current.currentPeriodEnd?.getTime() ?? null) !== selection.end) throw Error('Cancellation unconfirmed');
    };
    const matches = (row: Record<string, unknown> | null) => !!row && row.state === 'pending' && Object.entries(captured).every(([k,v]) => row[k] === v);
    const admission = await prisma.$transaction(async tx => {
      await lock(tx);
      const billingWebhook = await tx.billingWebhookDenial.findUnique({ where: { userId: own.userId } });
      check(); if (billingWebhook) throw Error('Billing webhook original reconciliation pending');
      const webhook = await tx.checkoutWebhookDenial.findUnique({ where: { userId: own.userId } });
      check(); if (webhook) throw Error("Webhook original reconciliation pending");
      const sync = await tx.subscriptionSyncAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (sync) return null;
      const downgrade = await tx.subscriptionDowngradeAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (downgrade) return null;
      const checkout = await tx.checkoutAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (checkout && checkout.state !== 'complete') return null;
      const prior = await tx.subscriptionCancellationAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (prior) return null;
      const row = await tx.subscriptionCancellationAttempt.create({ data: { ...captured, state: 'pending' } });
      check(); return row;
    }, { maxWait: 10_000, timeout: 15_000 });
    check(); if (!matches(admission)) return unconfirmed();
    await prisma.$transaction(async tx => {
      await lock(tx);
      const billingWebhook = await tx.billingWebhookDenial.findUnique({ where: { userId: own.userId } });
      check(); if (billingWebhook) throw Error('Billing webhook original reconciliation pending');
      const webhook = await tx.checkoutWebhookDenial.findUnique({ where: { userId: own.userId } });
      check(); if (webhook) throw Error("Webhook original reconciliation pending");
      const row = await tx.subscriptionCancellationAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (!matches(row)) throw Error('Cancellation unconfirmed');
      const listed = await stripe.subscriptions.list({ customer: selection.customerId, status: 'all', limit: 10 });
      check();
      if (!listed || listed.has_more !== false || !Array.isArray(listed.data)) throw Error('Cancellation unconfirmed');
      const candidates = listed.data.filter(s => isPaidStatus(s.status));
      if (candidates.length !== 1) throw Error('Cancellation unconfirmed');
      const original = candidates[0];
      const validPrice = (s: typeof original) => selection.priceId === null || (s.items?.data?.length === 1 && s.items.data[0].price?.id === selection.priceId);
      if (!original || typeof original.id !== 'string' || !/^sub_[A-Za-z0-9_-]{1,128}$/.test(original.id)
        || original.customer !== selection.customerId || original.status !== selection.status || original.cancel_at_period_end !== false || !validPrice(original)) throw Error('Cancellation unconfirmed');
      const providerSelection = Object.freeze({ id: original.id, status: original.status });
      check();
      const updated = await stripe.subscriptions.update(providerSelection.id, { cancel_at_period_end: true });
      check();
      if (!updated || updated.id !== providerSelection.id || updated.customer !== selection.customerId || updated.status !== providerSelection.status
        || updated.cancel_at_period_end !== true || !validPrice(updated)) throw Error('Cancellation unconfirmed');
      const stored = await tx.subscription.updateMany({ where: { id: selection.subscriptionId, userId: own.userId, stripeCustomerId: selection.customerId,
        stripePriceId: selection.priceId, plan: selection.plan, status: selection.status, cancelAtPeriodEnd: false }, data: { cancelAtPeriodEnd: true } });
      check(); if (stored.count !== 1) throw Error('Cancellation unconfirmed');
      // A provider effect cannot roll back with SQL. Ambiguous writes/markers
      // keep the separately committed admission; never reconcile from a row.
      const marked = await tx.subscriptionCancellationAttempt.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Cancellation unconfirmed');
    }, { maxWait: 10_000, timeout: 55_000 });
    check();
    return Object.freeze({ ok: true, ...own, key, subscriptionId: selection.subscriptionId, cancelAtPeriodEnd: true, mode: 'simulated' });
  } catch { return unconfirmed(); }
}
