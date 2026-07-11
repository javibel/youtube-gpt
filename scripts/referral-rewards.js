'use strict';
/**
 * Liquida recompensas de referidos: 1 mes gratis de Pro para quien trajo a un
 * usuario que ya se ha hecho de pago (Pro o Business). Es liquidación manual —
 * no hay cron ni dashboard; Javier lo ejecuta cuando quiere pasar revista.
 *
 * Mecanismo:
 *  - Si quien refiere ya paga por Stripe: cupón 100% off (once) en su próxima factura.
 *  - Si no paga (Free): se le concede Pro gratis 30 días directamente en BD
 *    (igual que scripts/grant-pro.js), sin tarjeta ni suscripción real en Stripe.
 *
 *   node scripts/referral-rewards.js            → aplica recompensas pendientes
 *   node scripts/referral-rewards.js --dry-run  → solo muestra qué haría, no cambia nada
 */
const fs = require('fs');
for (const f of ['.env.local', '.env', '.env.production']) {
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const { PrismaClient } = require('@prisma/client');
const Stripe = require('stripe');
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Hibernado (11/07/2026): el programa de afiliados/referidos está en pausa —
// ver docs/hibernacion-afiliados-referidos-2026-07-11.md y lib/features.ts
// (AFFILIATES_DORMANT). Este script es manual (sin cron), pero por si acaso:
// no ejecutar mientras dure la hibernación salvo --force explícito.
const AFFILIATES_DORMANT = true;

(async () => {
  if (AFFILIATES_DORMANT && !process.argv.includes('--force')) {
    console.error('[referral-rewards] Programa de referidos hibernado — usa --force si de verdad quieres saltarte esto.');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');

  const pending = await prisma.user.findMany({
    where: {
      referredBy: { not: null },
      referralRewardedAt: null,
      subscription: { status: 'active', plan: { in: ['pro', 'business'] } },
    },
    select: { id: true, email: true, referredBy: true },
  });

  if (pending.length === 0) {
    console.log('Sin recompensas pendientes.');
    await prisma.$disconnect();
    return;
  }

  console.log(`${pending.length} conversión(es) de referido pendiente(s) de recompensar.${dryRun ? ' (dry-run)' : ''}\n`);

  for (const referred of pending) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: referred.referredBy },
      include: { subscription: true },
    });

    if (!referrer) {
      console.log(`⚠️  ${referred.email}: código "${referred.referredBy}" no corresponde a ningún usuario. Marcando como procesado sin recompensa.`);
      if (!dryRun) await prisma.user.update({ where: { id: referred.id }, data: { referralRewardedAt: new Date() } });
      continue;
    }

    const hasStripeSub = referrer.subscription?.stripeCustomerId?.startsWith('cus_') && referrer.subscription.status === 'active';

    if (hasStripeSub) {
      console.log(`💳 ${referrer.email}: aplicar cupón 100% en su próxima factura (referido convertido: ${referred.email})`);
      if (!dryRun) {
        const subs = await stripe.subscriptions.list({ customer: referrer.subscription.stripeCustomerId, status: 'active', limit: 1 });
        if (subs.data[0]) {
          const coupon = await stripe.coupons.create({ percent_off: 100, duration: 'once', name: 'Recompensa por referido — YTubViral' });
          await stripe.subscriptions.update(subs.data[0].id, { discounts: [{ coupon: coupon.id }] });
        } else {
          console.log('   ⚠️  Sin suscripción activa encontrada en Stripe pese al registro en BD — revisar a mano, no se ha aplicado nada.');
        }
      }
    } else {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 86400000);
      console.log(`🎁 ${referrer.email}: sin plan de pago activo — concediendo Pro gratis 30 días (referido convertido: ${referred.email})`);
      if (!dryRun) {
        await prisma.subscription.upsert({
          where: { userId: referrer.id },
          update: { plan: 'pro', status: 'active', currentPeriodEnd: end, cancelAtPeriodEnd: false },
          create: { userId: referrer.id, plan: 'pro', status: 'active', currentPeriodStart: now, currentPeriodEnd: end },
        });
      }
    }

    if (!dryRun) await prisma.user.update({ where: { id: referred.id }, data: { referralRewardedAt: new Date() } });
  }

  console.log(dryRun ? '\n(dry-run: nada aplicado)' : '\n✅ Recompensas aplicadas. El script no avisa a nadie — notifica tú a cada referente si quieres.');
  await prisma.$disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
