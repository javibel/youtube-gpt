# Hibernación del programa de afiliados y del sistema de referidos

**Fecha de decisión:** 2026-07-11 · **Decisión de:** Javier (CEO) · **Estado:** DURMIENTE (pendiente de ejecutar el ocultamiento)

---

## 1. Motivo

Javier no está dado de alta como autónomo ni tiene constituida una SL, y no puede asumir los costes de formalizar la empresa hasta que YTubViral consolide ingresos suficientes.

El programa de afiliados implica **pagar comisiones en dinero a terceros** (30% recurrente 12 meses). Operar eso sin estructura legal formalizada expone a problemas fiscales y mercantiles: pagos a terceros sin poder emitir/recibir facturas correctamente, obligaciones de retención e información, y un contrato público (`/affiliates/terms`) que compromete a una "empresa" que aún no existe como tal. La propia especificación original ya lo señalaba: *"Consultar gestor antes del primer pago real"* — y no hay gestor ni estructura que lo soporte.

**Decisión:** ocultar toda la superficie pública de afiliados y referidos, conservando el 100% del código y del modelo de datos, hasta que la empresa esté oficialmente formalizada. No es una cancelación: es hibernación.

## 2. Estado verificado en el momento de hibernar (11/07/2026)

Consultas directas a la BD de producción (Neon):

| Métrica | Valor |
|---|---|
| Afiliados registrados (`Affiliate`) | **0** |
| Clics en links `/a/{code}` (`AffiliateClick`) | **0** |
| Comisiones devengadas (`AffiliateCommission`) | **0** |
| Usuarios atribuidos a afiliado (`users.referredByCode`) | **0** |
| Usuarios referidos peer-to-peer (`users.referredBy`) | **0** |
| Recompensas de referido concedidas (`referralRewardedAt`) | **0** |

**Consecuencia clave: no hay NINGUNA obligación pendiente con terceros.** Nadie solicitó entrar al programa, nadie ha compartido links, no se debe ni un céntimo. El ocultamiento no requiere comunicación a nadie ni periodo de transición. Es el momento perfecto para hibernar: coste cero.

`/affiliates` **no está en el sitemap** (verificado en `app/sitemap.ts`), así que la huella SEO es mínima. Tras ocultar, comprobar en GSC que no quedó indexada; si apareciera, la página devolverá 404 y saldrá sola del índice.

## 3. Alcance — dos sistemas distintos, ambos duermen

1. **Programa de afiliados** (spec `docs/programa-afiliados-especificacion-2026-07-09.md`): comisiones en **dinero** a prescriptores. Es el que genera el riesgo legal. Duerme.
2. **Referidos peer-to-peer** (`ReferralCard` del dashboard): recompensa **en especie** (1 mes de Pro gratis al que invita). Legalmente es un descuento promocional, no un pago a terceros — la exposición es mucho menor. Aun así **duerme también** por decisión de Javier ("afiliados / referidos") y por coherencia: cero uso real, y evita explicar por qué uno sí y otro no.

**Fuera de alcance (no se toca):**
- **Enlaces de Amazon Associates en `/gear`** y su cláusula en `/terms` §10. Es comisión *entrante* de Amazon, no un programa propio de pagos a terceros. *Observación anotada:* cualquier ingreso real de Amazon activaría el disparador de alta (ver §6), pero eso es una cuestión aparte de este documento.
- **Atribución de marketing** (`utmSource`, `signupReferrer`, `ytv_utm`, `PageViewTracker`): no tiene nada que ver con afiliados y sigue activa.

## 4. Plan de ocultamiento (ejecución técnica)

**Principio: un solo interruptor, cero borrado.** Crear una constante única en código (no env var — así la reactivación es un commit y no depende del panel de Vercel):

```ts
// lib/features.ts (nuevo)
// Programa de afiliados + referidos en hibernación hasta formalizar la empresa
// (autónomo/SL). Ver docs/hibernacion-afiliados-referidos-2026-07-11.md.
export const AFFILIATES_DORMANT = true;
```

Todo lo que se lista abajo se condiciona a esa constante (`if (AFFILIATES_DORMANT) notFound()` / render null / return temprano). **No se borra ningún archivo, componente, tabla ni columna** — en particular, los modelos `Affiliate`, `AffiliateClick` y `AffiliateCommission` se quedan en `schema.prisma` (regla vigente: el deploy corre `db push --accept-data-loss`; quitar un modelo del schema destruiría las tablas).

### 4.1 Superficie pública → oculta

| Superficie | Archivo | Acción en modo durmiente |
|---|---|---|
| Landing del programa | `app/affiliates/page.tsx` | `notFound()` → 404 |
| Términos del programa | `app/affiliates/terms/page.tsx` | `notFound()` → 404 |
| Panel del afiliado | `app/affiliates/dashboard/page.tsx` | `notFound()` → 404 |
| Form de solicitud (API) | `app/api/affiliates/apply/route.ts` | 404 (sin crear `Affiliate` ni email) |
| API panel afiliado | `app/api/affiliates/dashboard/route.ts` | 404 |
| Links de afiliado | `app/a/[code]/route.ts` | Redirect limpio a `/` **sin** registrar clic ni añadir `?aff=` (el link no rompe, pero no atribuye) |
| Captura global de `?aff=` | `components/AffiliateCapture.tsx` (montado en `app/layout.tsx`) | No setear cookie `ytv_aff` |
| Campo "Código de afiliado" en signup | `app/signup/SignupForm.tsx` | Ocultar el campo y no enviar `aff` ni `ref`; no setear cookies `ytv_aff`/`ytv_ref` |
| Persistencia en signup | `app/api/signup/route.ts` | Ignorar `aff`/`ref` entrantes (no escribir `referredByCode`/`referredBy`) |
| Tarjeta "Invita amigos" | `components/ReferralCard.tsx` (montada en `app/dashboard/page.tsx`) | No renderizar |
| API de referidos de usuario | `app/api/user/referral/route.ts` | 404 |

### 4.2 Backend → inerte por defensa en profundidad

| Pieza | Archivo | Acción |
|---|---|---|
| Devengo de comisiones (webhook Stripe) | `lib/affiliate.ts` → llamado desde `app/api/stripe/webhook/route.ts` | Return temprano si durmiente. (Con 0 afiliados nunca devengaría, pero el gate evita sorpresas si alguien insertara datos a mano.) |
| Reversión por refunds | `lib/affiliate.ts` | Se deja ACTIVA — es contabilidad correctiva, inofensiva y deseable si algún día hubiera datos |
| Recompensas de referidos | `scripts/referral-rewards.js` | Es manual (no está en ningún cron — verificado). No ejecutarlo mientras dure la hibernación; añadirle un aviso en cabecera |

### 4.3 Se queda como está (no visible para usuarios)

- `/admin/affiliates` y sus APIs (`app/api/admin/affiliates/*`): tras auth de admin, no exponen nada al público. Se conservan operativas para poder inspeccionar el estado durante la hibernación.
- Todo el schema Prisma de afiliados/referidos y las columnas de `users`.
- La especificación original (`docs/programa-afiliados-especificacion-2026-07-09.md`) como plano de referencia.

### 4.4 Verificación post-ocultamiento

1. `npx tsc --noEmit` limpio y prueba en dev local (puerto 3011) antes de push (regla local-first).
2. `/affiliates`, `/affiliates/terms`, `/affiliates/dashboard` → 404.
3. `/a/test?to=/seo-score` → redirect a `/seo-score` sin `?aff=` y sin fila nueva en `AffiliateClick`.
4. Signup sin campo de código de afiliado; registro con `?aff=x&ref=y` en la URL → usuario creado con `referredByCode` y `referredBy` a NULL.
5. Dashboard de usuario sin tarjeta "Invita amigos".
6. `/admin/affiliates` sigue funcionando para el admin.
7. GSC: confirmar que `/affiliates` no está indexada (si lo está, dejar que el 404 la expulse).

## 5. Qué NO se hace

- No se borra código, ni tablas, ni columnas, ni la spec.
- No se toca `/gear` ni la cláusula de Amazon en `/terms`.
- No se toca la atribución UTM/referrer de marketing.
- No se comunica nada a usuarios (no hay a quién: 0 afectados).
- No se modifica nada de precios/planes.

## 6. Condiciones de reactivación

El programa despierta cuando se cumplan **todas**:

1. **Empresa formalizada:** alta de autónomo o SL constituida y operativa. Disparador ya definido en memoria: el primer ingreso externo real obliga al alta — y a partir de ahí puede plantearse la reactivación, no antes.
2. **Revisión fiscal con gestor** (cuando lo haya): régimen de los pagos a afiliados (factura del afiliado autónomo vs. particulares, retenciones, IVA), tal como exigía la spec original antes del primer pago.
3. **Revisión de `/affiliates/terms`** con la entidad legal real (nombre, NIF, jurisdicción) antes de volver a publicarlos.

### Checklist de reactivación (orden)

1. `AFFILIATES_DORMANT = false` (un commit).
2. Re-ejecutar los criterios de aceptación de la spec original (§ "Criterios de aceptación"): clic `/a/test`, atribución en signup con/sin cookies, devengo idempotente, ventana 12 meses, reversión por refund, anti auto-referido.
3. Actualizar `/affiliates/terms` con los datos legales reales.
4. Decidir si `/affiliates` entra ya en el sitemap (en hibernación nunca estuvo).
5. Reevaluar las 3 decisiones comerciales que quedaron abiertas en la spec (descuento asociado al código, umbral de payout, relanzar propuesta a Erika).
6. Actualizar memoria (`project_affiliates_program.md`) y este documento con la fecha de reactivación.

---

*Documento de decisión operativa. Complementa (no sustituye) a `docs/programa-afiliados-especificacion-2026-07-09.md`, que sigue siendo el plano técnico del sistema.*
