import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

/**
 * Fechas de periodo de una suscripción de Stripe con los edge cases cubiertos:
 * en trial, current_period_end puede venir null a nivel de suscripción (la fecha
 * real es trial_end); en versiones nuevas de la API el periodo vive en el item.
 */
export function subscriptionPeriod(sub: Stripe.Subscription): { start: Date; end: Date } {
  const item = sub.items.data[0] as (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number }) | undefined;
  const startTs = sub.current_period_start ?? item?.current_period_start ?? sub.trial_start;
  const endTs = (sub.status === 'trialing' ? sub.trial_end : null) ?? sub.current_period_end ?? item?.current_period_end ?? sub.trial_end;
  return {
    start: startTs ? new Date(startTs * 1000) : new Date(),
    end: endTs ? new Date(endTs * 1000) : new Date(),
  };
}

/**
 * URL de un Stripe Billing Portal session para que el usuario actualice tarjeta
 * o gestione su suscripción. Requiere el portal activado en el dashboard de
 * Stripe (Settings → Billing → Customer portal) — si no lo está, Stripe
 * devuelve error y aquí se resuelve a null para que el caller haga fallback
 * a /profile en vez de romper el envío del email.
 */
export async function createBillingPortalUrl(
  customerId: string,
  returnUrl = 'https://ytubviral.com/profile',
): Promise<string | null> {
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return session.url;
  } catch (e) {
    console.error('createBillingPortalUrl failed:', (e as Error).message);
    return null;
  }
}
