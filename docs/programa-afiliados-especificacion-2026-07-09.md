# Programa de afiliados — Especificación (producto + tracking + legal)

Spec 5 de la ventana Fable 5 (2026-07-09). Origen: revisión estratégica 07/07 — programa `/affiliates` genérico para prescriptores (no solo Erika), como canal de distribución. **Parámetros ya decididos por Javier (no reabrir):** 30% de comisión recurrente durante 12 meses; techo negociable individual 40-50% el primer año para partners grandes.

## Marco

- **Objetivo:** que YouTubers/creadores con audiencia recomienden YTubViral a cambio de comisión recurrente. Es EL canal de prescriptores del plan de distribución.
- **Escala realista v1:** puñado de afiliados curados a mano (aprobación manual), no un programa self-service masivo. Esto simplifica radicalmente el diseño: nada de anti-fraude industrial ni payouts automatizados — un fundador solo puede liquidar 5-20 afiliados al mes a mano.
- **No usar servicio externo** (Rewardful, FirstPromoter…): coste mensual fijo con MRR≈0, y la infra de atribución interna ya existe a medias. Todo first-party.

## Hechos del código verificados (09/07)

- `users` ya tiene `utmSource/utmMedium/utmCampaign/signupReferrer/signupLandingPage` y el pipeline signup/auth los persiste.
- `UTMCapture.tsx` → cookie `ytv_utm` first-touch 30 días, **gateada por consentimiento RGPD** (relevante abajo).
- Stripe: `app/api/stripe/{checkout,webhook,sync,cancel,downgrade}`; el checkout ya pasa `allow_promotion_codes: true`.
- Modelo `Subscription` en Prisma; plan Pro 9,99€/mes con trial 7 días (la comisión debe engancharse a facturas PAGADAS, no a inicios de trial).

## Diseño

### 1. Atribución

**Link de afiliado:** `ytubviral.com/a/{code}` — route handler server-side que:
1. Registra el clic (tabla `AffiliateClick`: code, ts, referer, país — para que el afiliado vea que su link funciona aunque nadie convierta aún).
2. Redirige a `/` (o a `?to=/seo-score` si el afiliado quiere apuntar a una tool concreta) **añadiendo `?ref={code}` a la URL destino**.
3. Setea cookie first-party `ytv_ref={code}` (60 días, first-touch: no sobrescribir si ya existe otra).

**Doble mecanismo por el gating RGPD** (lección del ytv_utm: sin consentimiento, la cookie se pierde):
- **Primario:** cookie `ytv_ref` — mismo gating de consentimiento que `ytv_utm` (no inventar una categoría nueva de cookie; legalmente es tracking).
- **Fallback sin cookie:** el `?ref=` se propaga por query param hasta el formulario de signup (los links internos de la landing conservan el param; el form lo lee y lo manda en el POST). Cubre la conversión en la misma sesión aunque se rechace la cookie.
- **Fallback humano:** campo opcional "¿Te ha recomendado alguien? Código" en el signup (colapsado tras un link discreto, no un campo más del form). Cubre el caso "vi el vídeo hace 2 semanas y entré escribiendo la URL" — que con YouTubers será EL caso común. Este campo es también el argumento de venta al afiliado: "tu audiencia puede citarte aunque no haga clic".

**Persistencia:** en signup, guardar `referredByCode` + `referredAt` en `users` (2 columnas nuevas) con prioridad: código tecleado > query param > cookie. La atribución es **first-touch y se congela en el signup** — cambios posteriores no la tocan.

### 2. Modelo de datos (todo en `schema.prisma`)

```prisma
model Affiliate {
  id             String   @id @default(cuid())
  code           String   @unique          // corto, elegible por el afiliado: "erika"
  name           String
  email          String
  userId         String?  @unique          // opcional: cuenta YTubViral vinculada
  commissionPct  Int      @default(30)     // por afiliado (permite el 40-50 negociado)
  monthsPaid     Int      @default(12)
  status         String   @default("pending") // pending | active | paused | terminated
  payoutMethod   String?                   // "paypal:email" | "bank:IBAN" — texto, v1 manual
  createdAt      DateTime @default(now())
}

model AffiliateClick {   // volumen bajo esperado; si crece, agregar por día
  id String @id @default(cuid())
  affiliateId String
  createdAt DateTime @default(now())
  referer String?
  country String?
}

model AffiliateCommission {
  id               String   @id @default(cuid())
  affiliateId      String
  referredUserId   String
  stripeInvoiceId  String   @unique        // idempotencia: 1 factura = 1 comisión
  invoiceAmountCents Int
  commissionCents  Int
  status           String   @default("pending") // pending | approved | paid | reversed
  createdAt        DateTime @default(now())
  paidAt           DateTime?
}
```

No hace falta tabla `AffiliateReferral`: la relación vive en `users.referredByCode`.

### 3. Devengo de comisiones (webhook Stripe)

En el handler existente de `app/api/stripe/webhook`, al evento **`invoice.paid`** (el que ya procese el webhook — verificar al implementar):
1. ¿El usuario de la factura tiene `referredByCode` de un afiliado `active`? Si no, fin.
2. ¿La factura está dentro de los `monthsPaid` (12) desde la PRIMERA factura pagada de ese usuario? Si no, fin (el reloj empieza en el primer pago, no en el signup ni en el trial).
3. Crear `AffiliateCommission` con `commissionCents = amount * commissionPct / 100` sobre el importe SIN IVA (`invoice.subtotal_excluding_tax` — verificar el campo exacto de la API de Stripe al implementar; comisionar el IVA sería regalar dinero).
4. Idempotente por `stripeInvoiceId` (los webhooks de Stripe se reintentan).

**Reversión:** al evento de refund (`charge.refunded` / `credit_note`), marcar la comisión de esa factura `reversed`. Crítico por la garantía de 30 días que va a entrar en Terms (ver spec de trial/Stripe — dependencia entre ambos docs): sin reversión, un refund con comisión pagada es pérdida doble.

**Anti-abuso v1 (proporcional a la escala):** bloquear auto-referido (email del afiliado == email del referido, o `affiliate.userId == referredUserId`); todo lo demás lo cubre la aprobación manual de afiliados y de payouts. NO construir detección de fraude elaborada para 10 afiliados.

### 4. Páginas

- **`/affiliates` (pública):** pitch del programa — 30% recurrente 12 meses, cookie 60 días, código citable de viva voz, panel de stats. Números de ejemplo honestos con el precio real (10 suscriptores Pro = ~36€/mes durante un año), SIN proyecciones infladas (regla de autenticidad). Form de solicitud: nombre, email, canal/audiencia, cómo piensa promocionar → crea `Affiliate` en `pending` + email a Javier. **Aprobación manual siempre.**
- **Panel del afiliado (`/affiliates/dashboard`):** requiere `Affiliate.userId` vinculado (el afiliado se crea cuenta normal y Javier la vincula al aprobar). Muestra: su link y código, clics 30d, signups atribuidos, comisiones por estado, total pendiente. Solo lectura — cero acciones peligrosas.
- **Admin (en `/admin` existente):** lista de afiliados con aprobar/pausar, comisiones `pending` → `approved` → marcar `paid` (batch mensual). El pago en sí es manual (PayPal/transferencia) — el sistema solo lleva la contabilidad.

### 5. Liquidación y fiscal

- **Ciclo:** mensual, con **umbral mínimo de 50€** (bajo el umbral, arrastra al mes siguiente) y **retención de 30 días** desde el devengo antes de ser pagable (cubre la ventana de refund/garantía).
- **Fiscal (España, flag para revisión antes de lanzar):** los pagos a afiliados son pagos a terceros por servicios — el afiliado debería emitir factura (autónomo) o el programa operar con recibo/autofactura según su situación. Los términos deben decir explícitamente que el afiliado es responsable de sus obligaciones fiscales y que se puede requerir factura para liquidar. **Consultar gestor antes del primer pago real** — no bloquea construir el sistema.
- **Términos del programa (`/affiliates/terms`, ES+EN):** relación no laboral; prohibido: pujar por la marca en ads, spam, cupones no autorizados, auto-referido; YTubViral puede terminar con 30 días de aviso pagando lo devengado; comisiones sobre importes netos efectivamente cobrados; reversión por refunds. Redactar al implementar partiendo de esta lista.

### 6. Lo que queda explícitamente fuera de v1

Payout automático (Stripe Connect), descuento asociado al código (decisión de pricing → Javier; el sistema lo soporta después vía `allow_promotion_codes` que ya está activo), self-service sin aprobación, multi-nivel (nunca), dashboards en tiempo real (los datos del panel pueden cachearse 1h).

## Orden de implementación

1. Schema (4 columnas/tablas) + route `/a/{code}` + captura en signup — el tracking puede vivir ANTES que las páginas (los links de Erika/Krishna empezarían a atribuir ya).
2. Devengo en webhook + reversión.
3. `/affiliates` pública + form de solicitud.
4. Panel afiliado + admin.
5. Términos legales + revisión fiscal → primer pago.

## Criterios de aceptación

- Visitar `/a/test` → clic registrado, cookie/param seteados, redirect limpio; signup posterior (con y sin consentimiento de cookies, y via código tecleado) → `users.referredByCode='test'`.
- Usuario referido convierte trial→pago → aparece comisión `pending` con el 30% del neto sin IVA; el webhook reenviado por Stripe NO la duplica.
- Factura nº13 del mismo usuario (mes 13) → cero comisión.
- Refund de una factura comisionada → comisión `reversed` y descontada del pendiente del panel.
- Afiliado con `commissionPct=45` → sus comisiones usan 45, el resto 30.
- Auto-referido (mismo email) → sin comisión, sin error visible.

## Decisiones que quedan para Javier (pricing/comercial — regla: no decidir sin consultar)

1. ¿El código de afiliado lleva descuento para el referido (p. ej. 10% primer mes)? El sistema v1 funciona sin ello.
2. Umbral de payout (propuesto 50€) y método preferido (PayPal vs transferencia).
3. ¿Se relanza la propuesta a Erika con el programa ya montado como gancho? (3 toques sin respuesta a 07/07 — el doc estratégico dejaba esa decisión abierta.)
