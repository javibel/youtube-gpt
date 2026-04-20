import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Reutilizar customer de Stripe si ya existe
    let customerId = user.subscription?.stripeCustomerId ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRO_PRICE_ID!,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: 'https://ytubviral.com/stripe/success',
      cancel_url: 'https://ytubviral.com/dashboard',
      metadata: { userId: user.id },
      subscription_data: {
        description: 'YTubViral.com — Plan Pro (200 generaciones/mes)',
        metadata: { userId: user.id, service: 'YTubViral.com' },
      },
      custom_text: {
        submit: { message: 'Tu suscripción a YTubViral.com Pro se activa al instante. Puedes cancelar en cualquier momento desde tu panel.' },
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
