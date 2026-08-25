import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';
import { PRICES, formatPrice, currencyForCountry, type Currency } from '@/lib/pricing';

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

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const validPlans: CheckoutPlan[] = ['monthly', 'yearly', 'business_monthly', 'business_yearly'];
    const plan: CheckoutPlan = validPlans.includes(body.plan) ? body.plan : 'monthly';
    const lang: 'es' | 'en' = body.lang === 'en' ? 'en' : 'es';
    const isEn = lang === 'en';

    // La moneda se decide SIEMPRE en servidor con la misma regla que /api/geo-currency,
    // nunca desde el cliente: así lo que se cobra coincide con lo que se mostró en la web.
    const currency = currencyForCountry(request.headers.get('x-vercel-ip-country'));

    const priceId = getPriceId(plan);
    if (!priceId) {
      return NextResponse.json({ error: `Price ID not configured for plan: ${plan}` }, { status: 500 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Reutilizar customer de Stripe si ya existe (must start with 'cus_' to be a real Stripe ID)
    let customerId = user.subscription?.stripeCustomerId;
    if (!customerId || !customerId.startsWith('cus_')) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
    }

    const tierPlan = plan.startsWith('business') ? 'business' : 'pro';
    const trialEligible = (plan === 'monthly' || plan === 'yearly') && !user.subscription?.stripePriceId;
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      // Requiere currency_options en el Price (configurado 25/08/2026: USD con los
      // mismos dígitos que EUR). Sin esto Stripe cobraría siempre en EUR.
      currency,
      allow_promotion_codes: true,
      locale: lang === 'en' ? 'en' : 'es',
      success_url: 'https://ytubviral.com/stripe/success',
      cancel_url: 'https://ytubviral.com/dashboard',
      metadata: { userId: user.id },
      subscription_data: {
        description: getPlanDescription(plan, isEn, currency),
        metadata: { userId: user.id, service: 'YTubViral.com', plan: tierPlan },
        ...(trialEligible ? { trial_period_days: 7 } : {}),
      },
      custom_text: {
        submit: { message: getSubmitMessage(plan, isEn, trialEligible, currency) },
      },
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ error: 'No se pudo crear la sesión de pago' }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    const message = err instanceof Error ? err.message : 'Error al crear la sesión de pago';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
