// Devengo y reversión de comisiones del programa de afiliados — ver
// docs/programa-afiliados-especificacion-2026-07-09.md. Llamado desde el
// webhook de Stripe (invoice.payment_succeeded / charge.refunded).
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

// "Primera factura pagada" real del customer en Stripe, no derivada de nuestra
// BD — el afiliado puede aprobarse DESPUÉS de la primera factura del usuario
// (no habría AffiliateCommission del mes 1 en ese caso) y el reloj de 12 meses
// debe arrancar igualmente en esa primera factura real, no en la aprobación.
async function getFirstPaidInvoiceDate(customerId: string): Promise<Date | null> {
  const invoices = await stripe.invoices.list({ customer: customerId, status: 'paid', limit: 100 });
  if (!invoices.data.length) return null;
  const earliest = invoices.data.reduce((min, inv) => (inv.created < min ? inv.created : min), invoices.data[0].created);
  return new Date(earliest * 1000);
}

export async function accrueAffiliateCommission(referredUserId: string, invoice: Stripe.Invoice): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: { referredByCode: true, email: true },
  });
  if (!user?.referredByCode) return;

  const affiliate = await prisma.affiliate.findUnique({ where: { code: user.referredByCode } });
  if (!affiliate || affiliate.status !== 'active') return;

  // Anti-abuso v1 (proporcional a la escala — el resto lo cubre la aprobación
  // manual de afiliados y de payouts): bloquear auto-referido.
  if (affiliate.userId === referredUserId) return;
  if (user.email && affiliate.email.toLowerCase() === user.email.toLowerCase()) return;

  const customerId = invoice.customer as string;
  const firstPaidAt = await getFirstPaidInvoiceDate(customerId);
  if (!firstPaidAt) return; // no debería pasar (esta misma invoice ya está pagada), guard defensivo

  const windowEnd = new Date(firstPaidAt);
  windowEnd.setMonth(windowEnd.getMonth() + affiliate.monthsPaid);
  const invoiceDate = new Date(invoice.created * 1000);
  if (invoiceDate >= windowEnd) return; // fuera de la ventana de meses pagados (p.ej. mes 13)

  // Comisión sobre el importe SIN IVA y con descuentos ya aplicados — comisionar
  // el IVA sería regalar dinero; comisionar el subtotal ignorando un cupón
  // aplicado sobrepagaría al afiliado.
  const amountCents = invoice.total_excluding_tax;
  if (!amountCents || amountCents <= 0) {
    console.error(`accrueAffiliateCommission: invoice ${invoice.id} sin total_excluding_tax utilizable — comisión omitida, revisar a mano`);
    return;
  }
  const commissionCents = Math.round((amountCents * affiliate.commissionPct) / 100);

  // Idempotente por stripeInvoiceId — Stripe puede reenviar el evento.
  await prisma.affiliateCommission.upsert({
    where: { stripeInvoiceId: invoice.id },
    update: {},
    create: {
      affiliateId: affiliate.id,
      referredUserId,
      stripeInvoiceId: invoice.id,
      invoiceAmountCents: amountCents,
      commissionCents,
      status: 'pending',
    },
  });
}

export async function reverseAffiliateCommissionForInvoice(stripeInvoiceId: string): Promise<void> {
  await prisma.affiliateCommission.updateMany({
    where: { stripeInvoiceId, status: { not: 'reversed' } },
    data: { status: 'reversed' },
  });
}
