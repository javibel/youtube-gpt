import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ytbeviral@gmail.com';

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: 'userId requerido' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  // Cancelar suscripción en Stripe si existe y está activa
  if (user.subscription?.stripeCustomerId && user.subscription.status === 'active') {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: user.subscription.stripeCustomerId,
        status: 'active',
        limit: 1,
      });
      if (subscriptions.data.length > 0) {
        await stripe.subscriptions.cancel(subscriptions.data[0].id);
      }
    } catch (err) {
      console.error('Error cancelando suscripción Stripe:', err);
      // Continuar con el borrado aunque falle Stripe
    }
  }

  // Eliminar usuario y todos sus datos en cascada (generaciones, suscripción, sesiones, etc.)
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
