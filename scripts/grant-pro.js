'use strict';
/**
 * Grant (or check) a paid plan for a user by email — for hand-held outreach conversions.
 *
 *   node scripts/grant-pro.js <email>            → grant Pro (12 months)
 *   node scripts/grant-pro.js <email> business   → grant Business
 *   node scripts/grant-pro.js <email> --check     → just show current plan, no change
 *
 * Pro is read by lib/plans.ts getUserPlan from Subscription {status:'active', plan}.
 */
const fs = require('fs');
for (const f of ['.env.local', '.env', '.env.production']) {
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const email = (process.argv[2] || '').toLowerCase().trim();
  const arg3 = process.argv[3] || '';
  const check = arg3 === '--check';
  const plan = ['pro', 'business'].includes(arg3) ? arg3 : 'pro';

  if (!email) { console.error('Uso: node scripts/grant-pro.js <email> [pro|business|--check]'); process.exit(1); }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
  if (!user) {
    console.log(`❌ No existe usuario con ${email}. Que se registre primero en ytubviral.com con ese email.`);
    await prisma.$disconnect(); process.exit(0);
  }

  const cur = await prisma.subscription.findUnique({ where: { userId: user.id }, select: { plan: true, status: true, stripeCustomerId: true } });
  console.log(`Usuario: ${user.email}${user.name ? ' (' + user.name + ')' : ''}`);
  console.log(`Plan actual: ${cur ? cur.plan + '/' + cur.status : 'free (sin subscription)'}`);

  if (check) { await prisma.$disconnect(); return; }
  if (cur && cur.stripeCustomerId !== 'manual_admin') {
    throw new Error('Suscripción existente sin concesión manual verificada; requiere revisión');
  }

  const now = new Date();
  const end = new Date(now.getTime() + 365 * 86400000);
  const data = { plan, status: 'active', stripeCustomerId: 'manual_admin', stripePriceId: 'manual_admin', currentPeriodStart: now, currentPeriodEnd: end, cancelAtPeriodEnd: true };
  if (cur) {
    const changed = await prisma.subscription.updateMany({ where: { userId: user.id, stripeCustomerId: 'manual_admin' }, data });
    if (changed.count !== 1) throw new Error('La suscripción cambió; revisar antes de conceder');
  } else {
    await prisma.subscription.create({ data: { userId: user.id, ...data } });
  }
  console.log(`✅ Concedido ${plan.toUpperCase()} (activo hasta ${end.toISOString().slice(0, 10)}) a ${user.email}`);
  await prisma.$disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
