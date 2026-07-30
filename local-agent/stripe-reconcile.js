'use strict';

/**
 * STRIPE RECONCILE — detecta deriva silenciosa entre Stripe y la tabla `subscriptions`.
 *
 * Los webhooks (app/api/stripe/webhook/route.ts) ahora reintentan en error (S7-Gap3),
 * pero no son infalibles — un evento puede perderse igualmente si Stripe agota sus
 * reintentos o si hay un bug futuro. Este script solo LEE y alerta: nunca corrige
 * solo, dinero = decisión humana (ver docs/trial-stripe-hardening-2026-07-09.md §Gap6).
 *
 * Cruza: (a) cada Subscription real (stripeCustomerId ≠ null/'manual_admin') contra
 * la suscripción más reciente de ese customer en Stripe — status/plan/periodo deben
 * coincidir; (b) suscripciones Stripe activas/trialing sin fila correspondiente en BD.
 *
 * Nota de implementación: local-agent NO tiene el SDK de stripe ni @prisma/client como
 * dependencia (a diferencia de scripts/referral-rewards.js, que los importa y por tanto
 * nunca ha podido ejecutarse — ver memoria). Este script usa fetch() directo a la REST
 * API de Stripe (mismo patrón que gsc-index-urls.js/dmarc-monitor.js con Gmail) y
 * db.js (pg crudo) para la BD, sin añadir dependencias nuevas.
 *
 * Cron: domingos 02:35 (antes del Manager de las 03:15).
 * Uso: node stripe-reconcile.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const db = require('./db');

const REPORTS_DIR = path.join(__dirname, 'reports');
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

const BUSINESS_PRICE_IDS = new Set(
  [process.env.STRIPE_BUSINESS_PRICE_ID, process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID]
    .filter(Boolean).map(id => id.trim())
);
function detectPlan(priceId) {
  return BUSINESS_PRICE_IDS.has(priceId) ? 'business' : 'pro';
}

async function stripeGet(pathAndQuery) {
  const res = await fetch(`https://api.stripe.com/v1/${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe API error ${res.status}`);
  return data;
}

function samePeriod(a, b) {
  if (!a || !b) return a === b;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000; // margen de 1 min
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  // Un fallo total (BD caída, Stripe inaccesible, key ausente) debe dejar un
  // reporte con severidad critical — si solo lanzáramos, no habría archivo y
  // el Manager no mostraría NADA: el silencio parecería éxito.
  try {
    return await reconcile(today);
  } catch (err) {
    console.error('[stripe-reconcile] Fallo total:', err.message);
    const result = {
      date: today, checkedCount: 0, issueCount: 1, severity: 'critical',
      issues: [{ severity: 'critical', email: null, customerId: null, note: `La reconciliación NO pudo ejecutarse: ${err.message}` }],
    };
    try {
      if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
      fs.writeFileSync(path.join(REPORTS_DIR, `stripe-reconcile-${today}.json`), JSON.stringify(result, null, 2));
    } catch {}
    return result;
  }
}

async function reconcile(today) {
  if (!STRIPE_KEY) throw new Error('Falta STRIPE_SECRET_KEY en local-agent/.env');
  console.log('[stripe-reconcile] Comparando subscriptions (BD) vs Stripe...');

  // OJO: "currentPeriodEnd" es `timestamp without time zone` (DateTime por defecto
  // en Prisma, sin @db.Timestamptz). Prisma lo trata como UTC de forma consistente,
  // pero el driver `pg` crudo interpreta el valor naive con la zona horaria LOCAL
  // del proceso Node — en esta máquina (Europe/Madrid) eso desplaza el valor 2h y
  // genera una discrepancia falsa en CADA fila, CADA semana. `AT TIME ZONE 'UTC'`
  // fuerza la lectura correcta (verificado contra Stripe: sin el cast salía
  // 08:33:45Z, con el cast 10:33:45Z — la hora real es la segunda).
  const dbSubs = await db.query(`
    SELECT s."stripeCustomerId" as "stripeCustomerId", s.status, s.plan,
           s."currentPeriodEnd" AT TIME ZONE 'UTC' as "currentPeriodEnd", u.email
    FROM subscriptions s
    JOIN users u ON u.id = s."userId"
    WHERE s."stripeCustomerId" IS NOT NULL AND s."stripeCustomerId" != 'manual_admin'
  `);

  const issues = [];
  const checkedCustomerIds = new Set();

  // (a) cada fila de BD contra su suscripción real más reciente en Stripe
  for (const dbSub of dbSubs) {
    checkedCustomerIds.add(dbSub.stripeCustomerId);
    let list;
    try {
      list = await stripeGet(`subscriptions?customer=${encodeURIComponent(dbSub.stripeCustomerId)}&status=all&limit=3`);
    } catch (err) {
      issues.push({ severity: 'critical', email: dbSub.email, customerId: dbSub.stripeCustomerId, note: `No se pudo consultar Stripe: ${err.message}` });
      continue;
    }
    const latest = (list.data || []).sort((a, b) => b.created - a.created)[0];

    if (!latest) {
      issues.push({ severity: 'critical', email: dbSub.email, customerId: dbSub.stripeCustomerId, note: `BD dice status="${dbSub.status}" pero no existe NINGUNA suscripción en Stripe para este customer` });
      continue;
    }

    if (latest.status !== dbSub.status) {
      issues.push({ severity: 'critical', email: dbSub.email, customerId: dbSub.stripeCustomerId, note: `status distinto — BD="${dbSub.status}" vs Stripe="${latest.status}"` });
    }
    const stripePlan = detectPlan(latest.items?.data?.[0]?.price?.id);
    if (stripePlan !== dbSub.plan) {
      issues.push({ severity: 'critical', email: dbSub.email, customerId: dbSub.stripeCustomerId, note: `plan distinto — BD="${dbSub.plan}" vs Stripe="${stripePlan}"` });
    }
    const stripeEnd = (latest.status === 'trialing' ? latest.trial_end : null) ?? latest.current_period_end;
    if (stripeEnd && !samePeriod(dbSub.currentPeriodEnd, new Date(stripeEnd * 1000))) {
      const dbEndStr = dbSub.currentPeriodEnd ? new Date(dbSub.currentPeriodEnd).toISOString() : 'null';
      issues.push({ severity: 'info', email: dbSub.email, customerId: dbSub.stripeCustomerId, note: `currentPeriodEnd distinto — BD="${dbEndStr}" vs Stripe="${new Date(stripeEnd * 1000).toISOString()}"` });
    }
  }

  // (b) suscripciones activas/trialing en Stripe sin fila real en BD
  const [activeList, trialingList] = await Promise.all([
    stripeGet('subscriptions?status=active&limit=100'),
    stripeGet('subscriptions?status=trialing&limit=100'),
  ]);
  for (const sub of [...(activeList.data || []), ...(trialingList.data || [])]) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (checkedCustomerIds.has(customerId)) continue;
    issues.push({ severity: 'critical', email: null, customerId, note: `Suscripción "${sub.status}" en Stripe sin ninguna fila en subscriptions (BD) — el usuario probablemente NO tiene acceso Pro que sí está pagando` });
  }

  const severity = issues.some(i => i.severity === 'critical') ? 'critical' : issues.length > 0 ? 'info' : 'ok';
  const result = { date: today, checkedCount: dbSubs.length, issueCount: issues.length, severity, issues };

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, `stripe-reconcile-${today}.json`), JSON.stringify(result, null, 2));

  console.log(`[stripe-reconcile] ${dbSubs.length} suscripciones comprobadas, ${issues.length} discrepancia(s), severidad=${severity}`);
  if (issues.length) console.log(JSON.stringify(issues, null, 2));

  return result;
}

module.exports = { runStripeReconcile: main };

if (require.main === module) {
  main().then(() => db.disconnect()).catch(e => { console.error('Fatal:', e.message); process.exit(1); });
}
