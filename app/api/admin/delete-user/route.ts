import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { requireAdmin } from '@/lib/auth-guards';
import { isPaidStatus } from '@/lib/plans';

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

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

  // Cancelar suscripción en Stripe si existe y está activa (incluye trials)
  if (user.subscription?.stripeCustomerId && isPaidStatus(user.subscription.status)) {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: user.subscription.stripeCustomerId,
        status: 'all',
        limit: 10,
      });
      const target = subscriptions.data.find((s) => isPaidStatus(s.status));
      if (target) {
        await stripe.subscriptions.cancel(target.id);
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
