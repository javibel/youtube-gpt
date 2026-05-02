import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';

type CheckoutPlan = 'monthly' | 'yearly' | 'business_monthly' | 'business_yearly';

function getPriceId(plan: CheckoutPlan): string | null {
  switch (plan) {
    case 'monthly': return process.env.STRIPE_PRO_PRICE_ID?.trim() || null;
    case 'yearly': return process.env.STRIPE_PRO_YEARLY_PRICE_ID?.trim() || null;
    case 'business_monthly': return process.env.STRIPE_BUSINESS_PRICE_ID?.trim() || null;
    case 'business_yearly': return process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID?.trim() || null;
  }
}

function getPlanDescription(plan: CheckoutPlan, isEn: boolean): string {
  switch (plan) {
    case 'monthly': return isEn ? 'YTubViral.com — Pro Plan (200 gen/mo)' : 'YTubViral.com — Plan Pro (200 generaciones/mes)';
    case 'yearly': return isEn ? 'YTubViral.com — Pro Annual Plan (200 gen/mo · €99.99/yr)' : 'YTubViral.com — Plan Pro Anual (200 generaciones/mes · 99,99€/año)';
    case 'business_monthly': return isEn ? 'YTubViral.com — Business Plan (Unlimited · €29.99/mo)' : 'YTubViral.com — Plan Business (Ilimitado · 29,99€/mes)';
    case 'business_yearly': return isEn ? 'YTubViral.com — Business Annual Plan (Unlimited · €299/yr)' : 'YTubViral.com — Plan Business Anual (Ilimitado · 299€/año)';
  }
}

function getSubmitMessage(plan: CheckoutPlan, isEn: boolean): string {
  if (plan === 'business_monthly' || plan === 'business_yearly') {
    const yearly = plan === 'business_yearly';
    return yearly
      ? (isEn ? 'Annual plan — €299/yr. Your Business access activates instantly. No surprise renewals.' : 'Plan anual — 299€/año. Tu acceso Business se activa al instante. Sin renovaciones sorpresa.')
      : (isEn ? 'Your YTubViral.com Business subscription activates instantly. Cancel anytime.' : 'Tu suscripción a YTubViral.com Business se activa al instante. Puedes cancelar en cualquier momento.');
  }
  const yearly = plan === 'yearly';
  return yearly
    ? (isEn ? 'Annual plan — €99.99/yr. Your Pro access activates instantly. No surprise renewals.' : 'Plan anual — 99,99€/año. Tu acceso Pro se activa al instante. Sin renovaciones sorpresa.')
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
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      locale: lang === 'en' ? 'en' : 'es',
      success_url: 'https://ytubviral.com/stripe/success',
      cancel_url: 'https://ytubviral.com/dashboard',
      metadata: { userId: user.id },
      subscription_data: {
        description: getPlanDescription(plan, isEn),
        metadata: { userId: user.id, service: 'YTubViral.com', plan: tierPlan },
      },
      custom_text: {
        submit: { message: getSubmitMessage(plan, isEn) },
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
