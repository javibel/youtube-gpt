import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/send-email';
import { SEQUENCES } from '@/lib/lifecycle-emails';
import { isInternalAccount } from '@/lib/internal-accounts';

// Disparo de emails lifecycle por EVENTO (G4): C1 (límite alcanzado) y C3
// (paywall tocado). Mismas garantías que el cron: DRY_RUN por defecto, respeta
// opt-out y email verificado, idempotencia vía EmailLog, y cooldown de 14 días
// entre emails de conversión para no saturar. Fire-and-forget: nunca debe
// romper el flujo del usuario.
const LIVE = process.env.LIFECYCLE_EMAILS_LIVE === 'true';
const DAY = 86400_000;

type ConvStep = 'c1' | 'c3';

export async function triggerConversionEmail(userId: string, step: ConvStep, extra?: Record<string, string | number>): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, lang: true, emailVerified: true, marketingOptOut: true },
    });
    if (!user || !user.email || !user.emailVerified || user.marketingOptOut) return;
    if (isInternalAccount(user.email)) return; // cuentas internas/de prueba

    // Idempotencia: este paso ya enviado.
    const already = await prisma.emailLog.findUnique({
      where: { userId_sequence_step: { userId, sequence: 'conv', step } },
    }).catch(() => null);
    if (already) return;

    // Cooldown: ningún email de conversión en los últimos 14 días.
    const recentConv = await prisma.emailLog.findFirst({
      where: { userId, sequence: 'conv', sentAt: { gt: new Date(Date.now() - 14 * DAY) } },
    }).catch(() => null);
    if (recentConv) return;

    const lang = (user.lang === 'en' ? 'en' : 'es') as 'es' | 'en';
    const name = user.name?.split(' ')[0] || (lang === 'en' ? 'there' : 'crack');
    const tpl = step === 'c1' ? SEQUENCES.conversion.c1 : SEQUENCES.conversion.c3;

    if (!LIVE) {
      console.log(`[lifecycle-trigger DRY_RUN] conv/${step} → ${user.email} (${lang})`);
      return;
    }

    await sendTransactionalEmail({ to: user.email, subject: tpl.subject[lang], html: tpl.build(name, lang, userId, extra) });
    await prisma.emailLog.create({ data: { userId, sequence: 'conv', step } });
  } catch (e) {
    console.error('[lifecycle-trigger] failed', step, (e as Error).message);
  }
}

// Emails de facturación (trial ending, pago fallido) — transaccionales sobre el
// estado de la cuenta, NO marketing: a diferencia de triggerConversionEmail,
// deliberadamente NO gatean por marketingOptOut/emailVerified ni aplican cooldown
// (isTransactional:true en sendTransactionalEmail omite el header de baja).
// Idempotentes por EmailLog porque Stripe reintenta webhooks.
//
// A diferencia de triggerConversionEmail, estos SÍ propagan errores: su único
// caller es el webhook de Stripe, que responde 500 en error para que Stripe
// reintente — si nos tragáramos el fallo aquí, un error transitorio de envío
// perdería el email para siempre. Única excepción: si el email YA salió y solo
// falla el registro en EmailLog, no se relanza (relanzar duplicaría el envío
// en el reintento).
async function sendBillingEmail(
  userId: string,
  step: string,
  tpl: (typeof SEQUENCES.billing)[keyof typeof SEQUENCES.billing],
  extra: Record<string, string | number>,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, lang: true } });
  if (!user?.email || isInternalAccount(user.email)) return;

  const already = await prisma.emailLog.findUnique({
    where: { userId_sequence_step: { userId, sequence: 'billing', step } },
  });
  if (already) return;

  const lang = (user.lang === 'en' ? 'en' : 'es') as 'es' | 'en';
  const name = user.name?.split(' ')[0] || (lang === 'en' ? 'there' : 'crack');

  if (!LIVE) {
    console.log(`[lifecycle-trigger DRY_RUN] billing/${step} → ${user.email} (${lang})`);
    return;
  }

  await sendTransactionalEmail({ to: user.email, subject: tpl.subject[lang], html: tpl.build(name, lang, userId, extra), isTransactional: true });
  try {
    await prisma.emailLog.create({ data: { userId, sequence: 'billing', step } });
  } catch (e) {
    console.error('[lifecycle-trigger] email sent but EmailLog failed', step, (e as Error).message);
  }
}

export async function triggerTrialEndingEmail(
  userId: string,
  subscriptionId: string,
  extra: { trialEndTs: number; amountCents: number; currency: string; manageUrl: string },
): Promise<void> {
  await sendBillingEmail(userId, `trial_ending_${subscriptionId}`, SEQUENCES.billing.trialEnding, extra);
}

export async function triggerPaymentFailedEmail(
  userId: string,
  invoiceId: string,
  extra: { amountCents: number; currency: string; manageUrl: string },
): Promise<void> {
  await sendBillingEmail(userId, `payment_failed_${invoiceId}`, SEQUENCES.billing.paymentFailed, extra);
}
