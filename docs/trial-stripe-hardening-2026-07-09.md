# Trial y Stripe — Endurecimiento del ciclo de vida (spec)

Spec 7 de la ventana Fable 5 (2026-07-09). Contexto: el trial Pro de 7 días se lanzó el 06/07 y el **primer trial real está activo ahora mismo** — cada gap de este doc es dinero o confianza en juego con un usuario de verdad. Recoge también dos pendientes nombrados en la revisión estratégica del 07/07: el Trial Ending Reminder y la cláusula de garantía 30 días en Terms.

## Estado verificado en código (09/07)

- **Checkout** (`app/api/stripe/checkout/route.ts`): `trial_period_days: 7` si el usuario no tuvo nunca `stripePriceId` (un trial por cuenta ✓), tarjeta recogida en checkout → cobro automático al día 7.
- **Webhook** (`app/api/stripe/webhook/route.ts`): maneja `checkout.session.completed`, `invoice.payment_succeeded` (con fallback de matching por email) y `customer.subscription.{updated,deleted}`. Firma verificada ✓, upserts idempotentes ✓.
- **Acceso** (`lib/plans.ts`): `PAID_STATUSES = ['active','trialing']` — un `past_due` degrada a free automáticamente ✓ (quizá demasiado brusco, ver Gap 2).
- Fix reciente (commit `7d8f7a7`): `currentPeriodEnd` correcto en trials (`trial_end`).

## Gap 1 — Trial Ending Reminder (el pendiente explícito del 07/07)

**Hoy:** el día 7 se cobra sin aviso previo. Legalmente cuestionable en la UE (prácticas de renovación) y garantiza cargos-sorpresa → disputas, la métrica que Stripe más penaliza.

**Implementación:** Stripe emite **`customer.subscription.trial_will_end` 3 días antes** del fin del trial. Añadir el case al webhook → disparar email vía el **sistema de lifecycle emails (fuente única de email a usuarios — NO sender standalone)**: asunto tipo "Tu prueba Pro termina en 3 días", cuerpo con fecha exacta del primer cobro, importe, y link visible de cancelación (`/profile` → gestionar suscripción). Bilingüe según idioma del usuario. Idempotencia: máx. 1 email por suscripción (flag en BD o dedup por tipo+subscriptionId en el log de emails — `EmailLog` existe).

Alternativa descartada: el recordatorio nativo de Stripe (Billing settings) — no es bilingüe a nuestra manera ni con nuestra marca, y queremos el link de cancelación propio (transparencia = marca).

## Gap 2 — Pago fallido sin comunicación

**Hoy:** si la tarjeta falla (al fin del trial o en renovación), `subscription.updated` pone `past_due` → el usuario cae a free **sin ningún aviso**, y descubre que "la app le quitó Pro" sin saber por qué. Es la peor versión posible del evento.

**Implementación:**
1. Case **`invoice.payment_failed`** en el webhook → email lifecycle "no pudimos procesar tu pago" con link al portal de Stripe para actualizar tarjeta. Máx. 1 email por invoice (dedup por invoiceId).
2. **Verificar en el dashboard de Stripe (tarea Javier, 5 min):** Smart Retries activado (reintentos automáticos con ML) y el comportamiento final tras agotar reintentos (recomendado: cancelar suscripción, no dejarla `past_due` eterna).
3. **Gracia opcional (decisión de producto, propuesta):** mantener acceso durante `past_due` los primeros 7 días (añadir `past_due` a una ventana de gracia comprobando `currentPeriodEnd + 7d`), porque el fallo de tarjeta suele ser involuntario y cortar acceso instantáneo mata la recuperación. Si se prefiere simple: dejar el corte inmediato actual, pero SIEMPRE con el email del punto 1.

## Gap 3 — El webhook devuelve 200 aunque falle el procesamiento

**Hoy (líneas 138-141):** cualquier excepción (p. ej. un hipo de Neon) se loguea y se responde 200 → Stripe da el evento por entregado y **no reintenta** → BD desincronizada de forma silenciosa y permanente. Con un usuario de pago es exactamente el bug que no se puede tener.

**Implementación:** en el catch, devolver **500** para que Stripe reintente (reintenta con backoff hasta 3 días); los upserts ya son idempotentes así que el reintento es seguro. Mantener 200 solo para eventos no manejados o malformados (no recuperables). Añadir el error al log con el `event.id` para poder reprocesar a mano si se agotan los reintentos.

## Gap 4 — Garantía 30 días: cláusula legal + runbook operativo

La incoherencia arrastrada desde junio: se decidió ofrecer garantía de 30 días pero Terms no la recoge.

1. **Cláusula en `/terms` (ES+EN), borrador para revisión de Javier antes de publicar:** reembolso íntegro del primer pago de una suscripción nueva si se solicita en los 30 días siguientes a ese primer cobro, escribiendo a hello@ytubviral.com; una vez por cliente; no aplica a renovaciones posteriores; el reembolso conlleva el fin del acceso de pago. (El trial de 7 días + garantía 30 = riesgo cero real para el usuario — coherente con el pitch honesto.)
2. **Runbook para ejecutarla (manual, escala actual):** en Stripe dashboard → refund del pago + cancelar la suscripción inmediatamente (el refund solo NO cancela); el webhook `subscription.deleted` ya degrada el plan en BD ✓. Verificar tras el primero real.
3. **Enganche con afiliados (dependencia con `docs/programa-afiliados-especificacion-2026-07-09.md`):** cuando exista el programa, el case `charge.refunded` del webhook debe marcar `reversed` la comisión de esa factura. Hasta entonces, no hace falta handler de refunds.

## Gap 5 — Verificación del trial real activo (checklist inmediato, no espera al resto)

Con el trial en curso, verificar contra BD y Stripe: (a) `Subscription.status='trialing'` y `currentPeriodEnd` = fecha real de fin del trial; (b) el usuario ve Pro en la app; (c) simular en Stripe test mode (test clocks o `stripe trigger`) el ciclo completo: `trial_will_end` → cobro día 7 → `invoice.payment_succeeded` → `active`; y la rama de fallo: tarjeta `4000...0341` → `past_due` → acceso free. Documentar el resultado en memoria. Esta checklist sirve también como criterios de aceptación de los Gaps 1-3.

## Gap 6 — Reconciliación periódica (deriva silenciosa)

Los webhooks pueden perderse (Gap 3 los hace recuperables, no infalibles). **Script semanal en local-agent** (`stripe-reconcile.js`, cron domingo): listar suscripciones en Stripe (la restricted key existente ya opera Stripe) vs tabla `Subscription`, y reportar al Manager cualquier discrepancia de status/plan/periodo. Solo LEE y alerta — nunca corrige solo (dinero = decisión humana). A la escala actual son 2 suscripciones: el coste es cero y detecta el problema el domingo, no el día que el usuario se queja.

## Orden de implementación

1. Gap 3 (10 líneas, elimina la pérdida silenciosa de eventos) + Gap 5 (verificación, hoy mismo).
2. Gap 1 (trial reminder — hay un trial real corriendo: urgencia máxima del doc).
3. Gap 2 (payment failed + revisión de dunning en dashboard).
4. Gap 4 (cláusula → OK de Javier → publicar; runbook).
5. Gap 6 (reconciliación).

## Criterios de aceptación

- `stripe trigger customer.subscription.trial_will_end` (test mode) → exactamente 1 email bilingüe correcto, registrado en `EmailLog`; repetir el trigger no duplica.
- `stripe trigger invoice.payment_failed` → 1 email con link al portal; el usuario pasa a free (o gracia, según decisión) y al pagar de nuevo recupera Pro sin intervención.
- Matar la BD durante un webhook (simulable en local) → respuesta 500 y el reintento de Stripe deja la BD consistente.
- `/terms` publica la cláusula aprobada en ES y EN; un refund manual siguiendo el runbook deja al usuario en free y sin acceso de pago residual.
- El script de reconciliación detecta una discrepancia inyectada a mano (editar status en BD) y la reporta al Manager.

## Decisiones para Javier

1. Gap 2.3: ¿ventana de gracia de 7 días en `past_due` o corte inmediato con email? (Propuesta: gracia.)
2. Aprobar el texto de la cláusula de garantía antes de publicar en Terms.
3. Confirmar configuración de Smart Retries/cancelación en el dashboard de Stripe (5 min, con guía del runbook).
