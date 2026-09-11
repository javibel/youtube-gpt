# Email sequences — Diseño (Tarea G4, 2026-06-12)

Estado: IMPLEMENTADO en DRY_RUN (2026-06-13, commits e9cab02 + 682d76c). El sistema
corre cada día a las 08:00 y devuelve el preview de lo que enviaría SIN enviar nada.
Para activar el envío real: poner `LIFECYCLE_EMAILS_LIVE=true` en las env vars de
Vercel (decisión final de Javier, tras revisar unos días de preview).

### Cómo revisar el preview diario (DRY_RUN)
`curl -H "Authorization: Bearer $CRON_SECRET" https://ytubviral.com/api/cron/lifecycle-emails`
Devuelve `{ mode, eligibleUsers, candidates, preview[] }`. Si los candidatos tienen
sentido varios días seguidos → activar LIVE. CRON_SECRET está en youtube-gpt/.env.local.

### Cómo activar el envío real
1. Vercel → proyecto → Settings → Environment Variables → `LIFECYCLE_EMAILS_LIVE=true`
2. Redeploy (o esperar al siguiente). El cron de las 08:00 empezará a enviar y a
   registrar en EmailLog (idempotente: nunca repite un paso).
3. Para parar: borrar la env var o ponerla a cualquier valor != 'true'.

## 0. Fundamentos (obligatorios antes de enviar el primer email)

**Legal (LSSI art. 21.2 + RGPD):** los emails de reactivación y conversión son
comunicaciones comerciales. A usuarios existentes se les puede enviar sin
consentimiento previo (soft opt-in: servicio similar ya contratado) PERO cada
email debe llevar link de baja funcional y hay que respetarla.

**Técnico (no existe aún):**
1. Campo `marketingOptOut Boolean @default(false)` en el modelo User
2. Ruta `/api/email/unsubscribe?token=` (token firmado con userId) que marca opt-out — sin login, un clic
3. Campo `lastGenerationAt` o query sobre `Generation.createdAt` para detectar inactividad
4. Tabla `EmailLog (userId, sequence, step, sentAt)` — idempotencia: nunca repetir un paso, máximo 1 email/día por usuario entre todas las secuencias
5. Cron diario (p. ej. 10:00 — buena hora de apertura ES) que evalúa triggers y envía
6. Modo `DRY_RUN=true` por defecto: loguea lo que enviaría sin enviar (primera semana de validación)

**Vía de envío:** `lib/send-email.ts` (Resend, hello@ytubviral.com) + plantillas nuevas en `lib/emails.ts` siguiendo el estilo de las existentes. Todo bilingüe — usar el idioma de preferencia del usuario si lo tenemos (cookie/perfil), ES por defecto.

**Exclusiones globales:** opt-out activo · email sin verificar · usuario en otra secuencia ese día.

---

## A. Onboarding (nuevos usuarios)

Objetivo: activación = primera generación + canal conectado. Trigger de entrada: email verificado.
Salida anticipada: si el usuario completa la acción objetivo de un email, se salta ese email.

| # | Cuándo | Asunto ES | Asunto EN | Objetivo / CTA |
|---|--------|-----------|-----------|----------------|
| A1 | Día 0 (tras verificar) | Tu SEO Score te espera (30 segundos, en serio) | Your SEO Score is waiting (30 seconds, really) | Analizar un vídeo → /seo-score. Ya existe email de bienvenida orientado a SEO Score — A1 lo sustituye o se fusiona |
| A2 | Día 1 (si no generó nada) | Pega un tema, te damos 5 títulos | Paste a topic, get 5 titles | Primera generación → /generate. Cuerpo: 1 ejemplo real de input→output |
| A3 | Día 3 (si no conectó canal) | Conecta tu canal y todo se personaliza | Connect your channel and everything gets personal | OAuth YouTube → beneficio concreto: "la IA deja de ser genérica: usa tu nicho, tu audiencia y tus datos reales". Recordar solo-lectura |
| A4 | Día 7 | La herramienta que casi nadie conoce (y es gratis) | The tool almost nobody knows (and it's free) | Best Time / Trends según lo que NO haya usado. Rotar para descubrir herramientas |
| A5 | Día 14 | ¿Cómo va el canal? Respuesta honesta en 1 clic | How's the channel going? Honest answer in 1 click | Mini-encuesta 1 clic (bien/regular/mal → mailto o link) + invitación a reseña (/dashboard#review). Cierra la secuencia |

Tono: el de la marca — honesto, cercano, sin humo. Emails CORTOS (4-6 líneas + CTA), texto plano con un botón, firmados "Javier — YTubViral".

## B. Reactivación (usuarios inactivos)

Trigger: 14 días sin ninguna Generation Y sin login (updatedAt). Máximo 2 emails — si no vuelve, parar para siempre (no quemar la lista).

| # | Cuándo | Asunto ES | Asunto EN | Contenido |
|---|--------|-----------|-----------|-----------|
| B1 | Día 14 inactivo | Tus 10 generaciones de junio siguen ahí | Your 10 June generations are still there | Recordatorio de valor no usado (los límites se renuevan cada mes — urgencia suave y VERDADERA). CTA: generar algo para el próximo vídeo |
| B2 | Día 30 inactivo | ¿Lo dejamos aquí? (sin rencor) | Should we leave it here? (no hard feelings) | Honestidad total: "si YTubViral no encajó, nos ayudaría saber por qué" — link a mini-encuesta/reply directo + CTA secundario de volver. Si no abre/clica: fin, nunca más |

Nota: NO ofrecer descuentos de reactivación sin OK de Javier (decisión de pricing).

## C. Conversión free→Pro

Trigger: momentos de fricción real, no spam por calendario. Máximo 1 email por trigger, cooldown 14 días entre emails de esta secuencia.

| # | Trigger | Asunto ES | Asunto EN | Contenido |
|---|---------|-----------|-----------|-----------|
| C1 | Alcanzó el límite mensual (evento, no cron) | Te quedaste sin generaciones a mitad de idea | You ran out of generations mid-idea | Empatía + Pro 9,99€ con las 3 features que más usa + garantía 30 días + recordatorio de que el límite se renueva el día X (alternativa honesta a pagar) |
| C2 | ≥80% del límite usado 2 meses seguidos | Usas YTubViral como un Pro (literalmente) | You use YTubViral like a Pro (literally) | "Estos 2 meses has usado X/10 — con Pro tendrías 200". Datos reales del usuario. CTA /pricing |
| C3 | Intentó usar herramienta Pro (paywall del Coach, A/B test...) ≥2 veces en 7 días | El Coach que intentaste abrir, explicado | That Coach you tried to open, explained | Qué hace la herramienta que tocó + caso de uso de su nicho + Pro 9,99€ + garantía. Solo si tocó el paywall — intención demostrada |

Principios C: siempre con la garantía de 30 días (real, en Terms), nunca falsa urgencia, nunca descuentos no aprobados, y el email C1 SIEMPRE menciona la alternativa gratuita (esperar al ciclo) — honestidad que convierte mejor a largo plazo.

---

## Métricas y control

- UTM en todos los links: `utm_source=email&utm_medium=lifecycle&utm_campaign={secuencia}-{paso}` (el sistema UTM ya existe; ojo: solo trackea con consentimiento de cookies — los datos serán parciales)
- Objetivo inicial: open rate >35%, click rate >5%, 0 quejas de spam
- Revisión a los 30 días de activar: matar los pasos con <2% de click

## Plan de implementación (cuando Javier dé OK)

1. Migración Prisma: `marketingOptOut` + tabla `EmailLog` (~30 min)
2. `/api/email/unsubscribe` con token firmado (~30 min)
3. 10 plantillas en `lib/emails.ts` (copys de este doc, estilo de las existentes) (~2 h)
4. `/api/cron/lifecycle-emails` + entrada en vercel.json (10:00 diario) con DRY_RUN (~1,5 h)
5. C1/C3 son por evento: hook en el endpoint de límite alcanzado y en los paywalls (~1 h)
6. Una semana en DRY_RUN revisando logs → activar con OK explícito

Total estimado: medio día de implementación + 1 semana de validación en seco.
