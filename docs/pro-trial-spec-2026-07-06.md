# Spec — Trial gratuito de Pro (7 días)

**Fecha**: 2026-07-06
**Origen**: respuesta competitiva a la promo "$1" de TubeBuddy detectada por Scout (05-06/07). Verificado que NO es un plan permanente: su estructura 2026 sigue siendo Free / Pro $4,99-7,99 / Star $11,99-15,99 / Legend $29,99-39,99, con un 50% permanente para canales <1.000 subs (código RisingStarBuddy). El "$1" es un gancho promocional puntual.
**Decisión de Javier (06/07)**: implementar SOLO el trial de 7 días de Pro. Descartados (por ahora): cupón para canales pequeños, tier Starter 4,99€, segmentación por herramienta y pay-per-use — razones en la conversación: con ~25 usuarios y 6-7 registros/semana el cuello es adquisición, no estructura de precios; la segmentación rompería el diferenciador "todo incluido por 9,99€" y el pay-per-use mata la recurrencia.
**Estado**: SPEC — nada implementado. Un intento de implementación se inició y se revirtió a petición de Javier; este documento captura todo lo aprendido en ese arranque.

---

## Resumen ejecutivo

Un visitante que pulse "Empezar con Pro" obtiene 7 días de Pro completo sin cargo; introduce tarjeta al inicio y Stripe cobra automáticamente el día 7 salvo cancelación. Neutraliza el "prueba por $1" de TubeBuddy con "prueba por 0€", sin tocar la estructura de precios existente.

**Esfuerzo estimado**: 2-3 h de implementación + verificación.
**Cambios de schema Prisma**: ninguno.
**Env vars nuevas**: ninguna.
**Tareas de Javier**: solo las opcionales de la sección 8.

---

## 1. Decisiones de diseño (tomadas, cambiar solo si Javier lo pide)

| Decisión | Elección | Razonamiento |
|---|---|---|
| Alcance del trial | **Solo Pro** (monthly y yearly), no Business | Es el plan gancho; Business es compra deliberada de un perfil distinto |
| Tarjeta | **Requerida al inicio** (comportamiento por defecto de Stripe) | Auto-convierte el día 7 sin infra extra; Stripe puede enviar el recordatorio de fin de trial; filtra curiosos. Trade-off: menos trials iniciados que sin tarjeta, pero mejor conversión y cero desarrollo adicional. Alternativa descartada: `payment_method_collection: 'if_required'` (trial sin tarjeta) exigiría flujo propio de "añade tarjeta antes del día 7" con emails — más infra para un beneficio dudoso a este volumen |
| Anti-abuso | Trial **solo si el usuario nunca tuvo suscripción real de Stripe** | Heurística sin cambio de schema: elegible si `user.subscription?.stripePriceId == null`. Impide el bucle cancelar→resuscribir→trial. Nota: los grants manuales (`scripts/grant-pro.js`) no escriben `stripePriceId`, así que un usuario con Pro regalado que luego pague SÍ recibe trial — correcto |
| Duración | 7 días | Estándar del sector (el propio TubeBuddy usa 7 días en sus tiers de pago) |

---

## 2. El problema técnico central: `status = 'trialing'`

Las suscripciones de Stripe en periodo de prueba tienen `status: 'trialing'`, **no** `'active'`. El código compara `status === 'active'` a mano en ~16 sitios: sin corregirlos TODOS, un usuario en trial pagaría con tarjeta metida y vería la app como Free (generaciones limitadas, tools bloqueadas) — el trial sería un engaño.

### 2.1. Helper central (nuevo, en `lib/plans.ts`)

```ts
export const PAID_STATUSES = ['active', 'trialing'] as const;

export function isPaidStatus(status: string | null | undefined): boolean {
  return !!status && (PAID_STATUSES as readonly string[]).includes(status);
}
```

Y en `getUserPlan()` (línea ~52): sustituir `if (sub?.status !== 'active') return 'free';` por `if (!isPaidStatus(sub?.status)) return 'free';`.

**Regla a partir de aquí**: prohibido comparar `status === 'active'` a mano para decidir "es de pago" — siempre `isPaidStatus()` o `status: { in: [...PAID_STATUSES] }` en cláusulas Prisma.

### 2.2. Inventario completo de sitios a cambiar (verificado por grep el 06/07)

**Comparaciones directas** → usar `isPaidStatus(...)`:

| Archivo | Línea aprox. | Contexto |
|---|---|---|
| `lib/plans.ts` | 52 | `getUserPlan` — el central |
| `app/api/user/stats/route.ts` | 74 | calcula `plan` para dashboard/profile |
| `app/api/cron/lifecycle-emails/route.ts` | 62 | `isPaid` — evita mandar emails de upgrade a quien está en trial |
| `app/api/extension/login/route.ts` | 82 | `isPro` extensión Chrome |
| `app/api/extension/me/route.ts` | 24 | ídem |
| `app/api/extension/token/route.ts` | 42 | ídem |
| `lib/extension-auth.ts` | 37 | ídem |
| `app/api/youtube/competitors/route.ts` | 20 | gate Pro de competidores |
| `app/api/admin/delete-user/route.ts` | 25 | cancela la sub de Stripe antes de borrar usuario — debe cancelar también trials |
| `app/api/admin/export/route.ts` | 47 | etiqueta Pro/Free en export (cosmético; opción: etiquetar 'Trial' aparte) |

**Cláusulas Prisma `where`** → usar `status: { in: [...PAID_STATUSES] }`:

| Archivo | Línea aprox. | Contexto |
|---|---|---|
| `app/api/cron/morning/route.ts` | 94 | daily ideas para usuarios Pro |
| `app/api/cron/snapshots/route.ts` | 22 | snapshots de canal |
| `app/api/cron/trends/route.ts` | 26 | alertas de tendencias |

**Llamadas a la API de Stripe `subscriptions.list({ status: 'active' })`** → deben encontrar también trials:

| Archivo | Línea aprox. | Cambio |
|---|---|---|
| `app/api/stripe/cancel/route.ts` | 27 | Cancelar durante el trial debe funcionar (es la promesa del copy). Cambiar a `list({ status: 'all', limit: 10 })` y tomar la primera con `['active','trialing'].includes(s.status)`. `cancel_at_period_end: true` sobre una sub en trial termina al final del trial **sin cobrar** — comportamiento deseado |
| `app/api/stripe/sync/route.ts` | 29 | El botón "¿Ya pagaste? Sincronizar" debe encontrar también subs en trial. Mismo cambio |

**NO tocar (deliberado)**:
- `app/api/admin/grant-pro/route.ts` y `scripts/grant-pro.js` — ESCRIBEN `status: 'active'`, no lo leen.
- `scripts/referral-rewards.js` — recompensa referidos solo con `status: 'active'`: **correcto**, un trial no es conversión de pago; la recompensa llega cuando Stripe cobra de verdad (trialing→active).
- `lib/demo-data.ts` — fixture del modo demo.
- `app/api/stripe/downgrade/route.ts` (línea 26) — downgrade Business→Pro; el trial es solo Pro así que no puede existir un Business en trial. Dejar como está.

---

## 3. Cambios en el checkout (`app/api/stripe/checkout/route.ts`)

1. Calcular elegibilidad tras cargar el usuario (ya se hace `include: { subscription: true }`):
   ```ts
   const trialEligible = (plan === 'monthly' || plan === 'yearly') && !user.subscription?.stripePriceId;
   ```
2. En `stripe.checkout.sessions.create`, dentro de `subscription_data`, añadir condicionalmente:
   ```ts
   ...(trialEligible ? { trial_period_days: 7 } : {}),
   ```
3. **`custom_text.submit` condicional** — el mensaje actual promete cobro inmediato; con trial debe decir la verdad y cumplir las expectativas de consumo UE (consentimiento informado del cargo diferido):
   - Con trial (ES): `"7 días gratis. El primer cobro (9,99 €/mes) será el {fecha}. Cancela antes sin coste."` — o sin fecha exacta: `"7 días gratis, luego 9,99 €/mes. Cancela antes del día 7 sin coste."`
   - Con trial anual: mismo patrón con `99,99 €/año`.
   - Sin trial (repetidor): mensajes actuales sin cambios.
   - Implementación: pasar `trialEligible` a `getSubmitMessage(plan, isEn, trialEligible)`.

Nada más cambia en el checkout: Business y usuarios no elegibles siguen el flujo actual idéntico.

---

## 4. Webhook — sin cambios de código, verificar comportamiento

`app/api/stripe/webhook/route.ts` ya guarda `status: subscription.status` tal cual en el upsert, así que `'trialing'` fluye solo a la BD. Las transiciones están cubiertas por los handlers existentes:

| Evento | Momento | Efecto en BD (ya implementado) |
|---|---|---|
| `checkout.session.completed` | Al iniciar el trial | upsert con `status: 'trialing'`, `currentPeriodEnd` = fin del trial |
| `invoice.payment_succeeded` | Día 7, cobro OK | sync a `status: 'active'` |
| `customer.subscription.updated` | Día 7, cobro falla → `past_due`; o cancelación durante trial | sync del estado real → `getUserPlan` devuelve 'free' automáticamente |

**Verificación necesaria en implementación**: confirmar en el Stripe Dashboard que el endpoint del webhook está suscrito a esos 3 eventos (ya lo está para el flujo actual — solo confirmar).

---

## 5. UI

1. **`components/PricingSection.tsx`** (superficie de venta principal):
   - CTA del plan Pro: `"Empezar con Pro →"` → `"Prueba Pro 7 días gratis →"` (EN: `"Try Pro free for 7 days →"`).
   - Añadir línea pequeña bajo el CTA: `"Sin cargo hasta el día 7 · Cancela cuando quieras"` / `"No charge until day 7 · Cancel anytime"`.
2. **`app/dashboard/page.tsx` y `app/profile/page.tsx`** — estado visible del trial:
   - Ambos ya reciben `subscription.status` vía `/api/user/stats`. Cuando `status === 'trialing'`: mostrar badge `"TRIAL"` junto al plan y texto `"Tu prueba termina el {currentPeriodEnd}"` en lugar de `"Renovación el ..."`. Cambio pequeño en la lógica de etiqueta existente (`planLabel` / bloque de renovación).
3. **Heredan el trial sin tocar nada** (todas llaman al mismo `/api/stripe/checkout`): dashboard (upgrade card), `/profile` (botón upgrade), `LimitReachedModal`. Actualizar su copy es opcional — recomendado solo `LimitReachedModal` (CTA `"Actualizar a Pro"` → `"Probar Pro gratis 7 días"`), porque es el punto de máxima intención.
4. **`components/PricingFAQ.tsx`** (opcional): añadir pregunta "¿Cómo funciona la prueba gratis?" — 2 frases, mantiene el schema FAQPage.

---

## 6. Orden de implementación

1. `lib/plans.ts` (helper + `getUserPlan`) → typecheck.
2. Los 15 call-sites de la sección 2.2 → typecheck.
3. Checkout (sección 3) → typecheck.
4. Cancel + sync (sección 2.2 último bloque).
5. UI (sección 5).
6. Verificación (sección 7), memoria, commit, push.

Sin orden de deploy especial: todo va en un commit y es retrocompatible (usuarios existentes tienen `status: 'active'`, nada cambia para ellos).

---

## 7. Verificación

**Antes de push** (`tsc --noEmit` + dev server):
- Grep final: cero `status === 'active'` restantes fuera de la lista "NO tocar".
- `/pricing` renderiza el nuevo CTA; checkout de un usuario SIN historial Stripe abre la página de Stripe mostrando "7 días gratis / primer cargo el {fecha}" (verificable en dev con las claves live: la sesión de checkout se puede abrir sin completar pago).
- Checkout de un usuario CON `stripePriceId` previo NO muestra trial.

**Post-deploy (prueba real controlada, coste 0€)**:
- Registrarse con una cuenta propia limpia → iniciar trial con tarjeta real → confirmar en BD `status='trialing'` y que la app da experiencia Pro completa (generar, coach, tools Pro) → cancelar desde `/profile` antes del día 7 → confirmar `cancelAtPeriodEnd: true` y que Stripe no cobra al vencer.

**Métricas de seguimiento** (manual, Stripe Dashboard + BD, revisar a las 2-4 semanas):
- Trials iniciados / semana.
- Conversión trial→pago (Stripe la muestra; señal sana del sector: 25-40% con tarjeta requerida).
- Cancelaciones durante trial y momento (día 1 vs día 6).

---

## 8. Tareas de Javier (todas opcionales, ninguna bloquea el código)

1. **Stripe Dashboard → Settings → Subscriptions and emails**: activar el email automático "Trial ending reminder" (Stripe avisa al cliente ~3 días antes del cobro). Recomendado: refuerza confianza y reduce disputas.
2. **Decidir si mencionar el trial en `/terms`** — los Términos actuales no mencionan periodo de prueba. No es bloqueante legalmente si el checkout muestra las condiciones (lo hace, sección 3), pero sería limpio añadir 2 frases. Documento legal → no se toca sin su OK explícito.
3. Tras 2-4 semanas de datos: decidir si reabrir el cupón para canales pequeños o el tier Starter (descartados hoy, no para siempre).

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Coste API de Anthropic de trials que no convierten (Pro = 200 gen/mes, coach, etc.) | A 6-7 registros/semana el peor caso es irrelevante (~1-3 €/mes). Revisar si el volumen crece ×10. El requisito de tarjeta ya filtra el abuso barato |
| Abuso con tarjetas virtuales para re-trials | Heurística `stripePriceId` cubre el caso normal; Stripe Radar cubre tarjetas fraudulentas. No sobre-ingenierizar a este volumen |
| Olvidar un check de `'active'` y que el trial parezca roto | Sección 2.2 es un inventario exhaustivo por grep + el paso de verificación repite el grep al final |
| Usuario en trial cancela y espera seguir hasta el día 7 | `cancel_at_period_end` mantiene el acceso hasta el fin del trial — comportamiento correcto por defecto |
