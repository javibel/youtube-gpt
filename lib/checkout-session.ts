import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { PRICES, formatPrice, type Currency } from '@/lib/pricing';
import type { Prisma } from '@prisma/client';

type CheckoutPlan = 'monthly' | 'yearly' | 'business_monthly' | 'business_yearly';

function getPriceId(plan: CheckoutPlan): string | null {
  switch (plan) {
    case 'monthly': return process.env.STRIPE_PRO_PRICE_ID?.trim() || null;
    case 'yearly': return process.env.STRIPE_PRO_YEARLY_PRICE_ID?.trim() || null;
    case 'business_monthly': return process.env.STRIPE_BUSINESS_PRICE_ID?.trim() || null;
    case 'business_yearly': return process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID?.trim() || null;
  }
}

// Importe del plan en la moneda que se va a cobrar. Los dígitos son idénticos entre
// EUR y USD (currency_options en Stripe), solo cambia el símbolo.
function planAmount(plan: CheckoutPlan): number {
  switch (plan) {
    case 'monthly': return PRICES.pro.monthly.eur;
    case 'yearly': return PRICES.pro.yearly.eur;
    case 'business_monthly': return PRICES.business.monthly.eur;
    case 'business_yearly': return PRICES.business.yearly.eur;
  }
}

function getPlanDescription(plan: CheckoutPlan, isEn: boolean, currency: Currency): string {
  const p = formatPrice(planAmount(plan), currency, isEn ? 'en' : 'es');
  switch (plan) {
    case 'monthly': return isEn ? 'YTubViral.com — Pro Plan (200 gen/mo)' : 'YTubViral.com — Plan Pro (200 generaciones/mes)';
    case 'yearly': return isEn ? `YTubViral.com — Pro Annual Plan (200 gen/mo · ${p}/yr)` : `YTubViral.com — Plan Pro Anual (200 generaciones/mes · ${p}/año)`;
    case 'business_monthly': return isEn ? `YTubViral.com — Business Plan (Unlimited · ${p}/mo)` : `YTubViral.com — Plan Business (Ilimitado · ${p}/mes)`;
    case 'business_yearly': return isEn ? `YTubViral.com — Business Annual Plan (Unlimited · ${p}/yr)` : `YTubViral.com — Plan Business Anual (Ilimitado · ${p}/año)`;
  }
}

function getSubmitMessage(plan: CheckoutPlan, isEn: boolean, trialEligible: boolean, currency: Currency): string {
  const p = formatPrice(planAmount(plan), currency, isEn ? 'en' : 'es');
  if (plan === 'business_monthly' || plan === 'business_yearly') {
    const yearly = plan === 'business_yearly';
    return yearly
      ? (isEn ? `Annual plan — ${p}/yr. Your Business access activates instantly. No surprise renewals.` : `Plan anual — ${p}/año. Tu acceso Business se activa al instante. Sin renovaciones sorpresa.`)
      : (isEn ? 'Your YTubViral.com Business subscription activates instantly. Cancel anytime.' : 'Tu suscripción a YTubViral.com Business se activa al instante. Puedes cancelar en cualquier momento.');
  }
  const yearly = plan === 'yearly';
  if (trialEligible) {
    return yearly
      ? (isEn ? `7 days free, then ${p}/yr. Cancel before day 7 at no cost.` : `7 días gratis, luego ${p}/año. Cancela antes del día 7 sin coste.`)
      : (isEn ? `7 days free, then ${p}/mo. Cancel before day 7 at no cost.` : `7 días gratis, luego ${p}/mes. Cancela antes del día 7 sin coste.`);
  }
  return yearly
    ? (isEn ? `Annual plan — ${p}/yr. Your Pro access activates instantly. No surprise renewals.` : `Plan anual — ${p}/año. Tu acceso Pro se activa al instante. Sin renovaciones sorpresa.`)
    : (isEn ? 'Your YTubViral.com Pro subscription activates instantly. Cancel anytime.' : 'Tu suscripción a YTubViral.com Pro se activa al instante. Puedes cancelar en cualquier momento.');
}


export const validCheckoutKey = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
export function validCheckoutInput(v: unknown): v is { plan: CheckoutPlan; lang: 'es' | 'en' } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return Object.keys(r).length === 2 && Object.hasOwn(r, 'plan') && Object.hasOwn(r, 'lang')
    && ['monthly', 'yearly', 'business_monthly', 'business_yearly'].includes(r.plan as string)
    && ['es', 'en'].includes(r.lang as string);
}
export function checkoutURL(v: unknown): v is string {
  if (typeof v !== 'string' || !v || v.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(v)) return false;
  try { const u = new URL(v); return u.href === v && u.protocol === 'https:' && u.hostname === 'example.invalid'
    && !u.port && !u.username && !u.password && !u.hash && u.pathname === '/checkout'; } catch { return false; }
}
type Owner = { userId: string; email: string };
type Outcome = { ok: true; userId: string; email: string; key: string; plan: CheckoutPlan; lang: 'es' | 'en'; mode: 'simulated'; url: string }
  | { ok: false; status: number; error: string };
const unconfirmed = (): Outcome => ({ ok: false, status: 503, error: 'checkout_unconfirmed' });
// A row can only deny another producer. No row, URL, key or clock restores this
// invocation's capability. Completion confirms a mock session, not payment;
// even complete rows retain account-wide denial until trusted retirement exists.
export async function checkoutOriginal(owner: Owner, input: unknown, key: string, currency: Currency, check: () => void): Promise<Outcome> {
  try {
    check();
    if (!validCheckoutInput(input) || !validCheckoutKey(key) || !validCheckoutKey(owner.userId)
      || typeof owner.email !== 'string' || !owner.email || owner.email.length > 320 || !['eur', 'usd'].includes(currency))
      return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email });
    const { plan, lang } = input, priceId = getPriceId(plan), isEn = lang === 'en';
    if (!priceId || !/^price_[A-Za-z0-9_-]{1,128}$/.test(priceId)) return { ok: false, status: 500, error: 'checkout_price_unavailable' };
    const captured = Object.freeze({ id: randomUUID(), ...own, key, plan, lang, currency, priceId });
    const user = await prisma.user.findUnique({ where: { id: own.userId }, include: { subscription: true } });
    check();
    if (!user || user.id !== own.userId || user.email !== own.email) return { ok: false, status: 401, error: 'Unauthorized' };
    const selection = Object.freeze({ name: user.name, subscriptionId: user.subscription?.id ?? null,
      customerId: user.subscription?.stripeCustomerId ?? null, previousPrice: user.subscription?.stripePriceId ?? null });
    const lock = async (tx: Prisma.TransactionClient) => {
      check();
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId);
      check();
      if (rows.length !== 1 || rows[0].id !== own.userId || rows[0].email !== own.email) throw Error('Checkout unconfirmed');
      await tx.$queryRawUnsafe('SELECT id FROM subscriptions WHERE "userId"=$1 FOR UPDATE', own.userId);
      check();
      const latest = await tx.user.findUnique({ where: { id: own.userId }, include: { subscription: true } });
      check();
      if (!latest || latest.id !== own.userId || latest.email !== own.email || latest.name !== selection.name
        || (latest.subscription?.id ?? null) !== selection.subscriptionId
        || (latest.subscription?.stripeCustomerId ?? null) !== selection.customerId
        || (latest.subscription?.stripePriceId ?? null) !== selection.previousPrice) throw Error('Checkout unconfirmed');
    };
    const matches = (r: Record<string, unknown> | null) => !!r && r.state === 'pending'
      && Object.entries(captured).every(([k,v]) => r[k] === v);
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
      const cancellation = await tx.subscriptionCancellationAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (cancellation) return null;
      const prior = await tx.checkoutAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (prior) return null;
      const row = await tx.checkoutAttempt.create({ data: { ...captured, state: 'pending' } });
      check(); return row;
    }, { maxWait: 10_000, timeout: 15_000 });
    check(); if (!matches(admission)) return unconfirmed();
    // Only this live invocation enters the effect transaction. A lost admission
    // acknowledgement ends here; a later SQL read never resumes the provider.
    const url = await prisma.$transaction(async tx => {
      await lock(tx);
      const billingWebhook = await tx.billingWebhookDenial.findUnique({ where: { userId: own.userId } });
      check(); if (billingWebhook) throw Error('Billing webhook original reconciliation pending');
      const webhook = await tx.checkoutWebhookDenial.findUnique({ where: { userId: own.userId } });
      check(); if (webhook) throw Error("Webhook original reconciliation pending");
      const row = await tx.checkoutAttempt.findUnique({ where: { userId: own.userId } });
      check(); if (!matches(row)) throw Error('Checkout unconfirmed');
      let customerId = selection.customerId;
      if (!customerId || !/^cus_[A-Za-z0-9_-]{1,128}$/.test(customerId)) {
        check();
        const customer = await stripe.customers.create({ email: own.email, name: selection.name ?? undefined, metadata: { userId: own.userId } });
        check(); if (!customer || typeof customer.id !== 'string' || !/^cus_[A-Za-z0-9_-]{1,128}$/.test(customer.id)) throw Error('Checkout unconfirmed');
        customerId = customer.id;
      }
      const tierPlan = plan.startsWith('business') ? 'business' : 'pro';
      const trialEligible = (plan === 'monthly' || plan === 'yearly') && !selection.previousPrice;
      check();
      const session = await stripe.checkout.sessions.create({
        customer: customerId, payment_method_types: ['card'], line_items: [{ price: priceId, quantity: 1 }], mode: 'subscription',
        currency, allow_promotion_codes: true, locale: lang,
        success_url: 'https://ytubviral.com/stripe/success', cancel_url: 'https://ytubviral.com/dashboard', metadata: { userId: own.userId },
        subscription_data: { description: getPlanDescription(plan, isEn, currency), metadata: { userId: own.userId, service: 'YTubViral.com', plan: tierPlan },
          ...(trialEligible ? { trial_period_days: 7 } : {}) },
        custom_text: { submit: { message: getSubmitMessage(plan, isEn, trialEligible, currency) } },
      });
      check(); if (!session || !checkoutURL(session.url)) throw Error('Checkout unconfirmed');
      // Provider effects cannot be rolled back with SQL. An ambiguous provider,
      // marker or transaction acknowledgement keeps denial; never issue again.
      const marked = await tx.checkoutAttempt.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Checkout unconfirmed');
      return session.url;
    }, { maxWait: 10_000, timeout: 55_000 });
    check();
    return Object.freeze({ ok: true, ...own, key, plan, lang, mode: 'simulated', url });
  } catch { return unconfirmed(); }
}
