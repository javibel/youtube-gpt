// Devengo y reversión de comisiones del programa de afiliados — ver
// docs/programa-afiliados-especificacion-2026-07-09.md. Llamado desde el
// webhook de Stripe (invoice.payment_succeeded / charge.refunded).
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { AFFILIATES_DORMANT } from '@/lib/features';

// "Primera factura pagada" real del customer en Stripe, no derivada de nuestra
// BD — el afiliado puede aprobarse DESPUÉS de la primera factura del usuario
// (no habría AffiliateCommission del mes 1 en ese caso) y el reloj de 12 meses
// debe arrancar igualmente en esa primera factura real, no en la aprobación.
// OJO: el alta de un trial genera una factura de 0€ con status 'paid' — se
// filtra por amount_paid > 0 para que el reloj arranque en el primer COBRO,
// no en el inicio del trial (que es lo que dice el spec).
async function getFirstPaidInvoiceDate(customerId: string): Promise<Date | null> {
  const invoices = await stripe.invoices.list({ customer: customerId, status: 'paid', limit: 100 });
  const realPaid = invoices.data.filter(inv => (inv.amount_paid ?? 0) > 0);
  if (!realPaid.length) return null;
  const earliest = realPaid.reduce((min, inv) => (inv.created < min ? inv.created : min), realPaid[0].created);
  return new Date(earliest * 1000);
}

export async function accrueAffiliateCommission(referredUserId: string, invoice: Stripe.Invoice): Promise<void> {
  // Hibernado (docs/hibernacion-afiliados-referidos-2026-07-11.md): con 0
  // afiliados activos esto nunca devengaría nada, pero el gate evita sorpresas
  // si alguien insertara datos de afiliado a mano mientras dura la pausa.
  if (AFFILIATES_DORMANT) return;

  // Factura sin cobro real (la de 0€ que Stripe genera al INICIAR un trial
  // también dispara invoice.payment_succeeded) — no es un caso de error,
  // simplemente no comisiona.
  if ((invoice.amount_paid ?? 0) <= 0) return;

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
  // aplicado sobrepagaría al afiliado. Si total_excluding_tax viene null
  // (facturas sin configuración de impuestos), total - tax es equivalente.
  const amountCents = invoice.total_excluding_tax ?? (invoice.total - (invoice.tax ?? 0));
  if (amountCents <= 0) return; // ya cubierto por el guard de amount_paid, defensivo
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
  const existing = await prisma.affiliateCommission.findUnique({ where: { stripeInvoiceId } });
  if (!existing || existing.status === 'reversed') return;

  // Revertir una comisión YA PAGADA significa que hay que reclamar el dinero al
  // afiliado a mano (clawback) — dejar rastro ruidoso en logs, que el flip de
  // status por sí solo pasa desapercibido. paidAt se conserva como evidencia.
  if (existing.status === 'paid') {
    console.error(`[affiliate] CLAWBACK MANUAL NECESARIO: refund de la factura ${stripeInvoiceId} cuya comisión de ${(existing.commissionCents / 100).toFixed(2)}€ ya se pagó al afiliado ${existing.affiliateId} el ${existing.paidAt?.toISOString()}`);
  }

  await prisma.affiliateCommission.update({
    where: { stripeInvoiceId },
    data: { status: 'reversed' },
  });
}
