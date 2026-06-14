# J1 — Auditoría del sistema de outreach (2026-06-13)

Auditoría de `outreach-discover.js`, `outreach-send.js`, `outreach-followup.js` y
`outreach-tracker.json`. Pregunta del brief: ¿encuentra creadores relevantes? ¿los emails
convierten? ¿el follow-up funciona?

---

## TL;DR

El sistema **encuentra creadores reales** y **los emails se envían de verdad** (Resend
devuelve ids). Pero la pregunta "¿convierten?" **no se puede responder** porque **no se mide
nada**: los contadores `totalReplied / totalRegistered / totalActivated` son ceros
hardcodeados que **ningún código incrementa jamás**, no hay detección de respuestas, y el
UTM `utm_source=outreach` no se atribuye en el funnel. Llevamos 141 emails "a ciegas".

Además el pipeline está **medio atascado**: la mayoría de ejecuciones del cron envían 0
emails, y la plantilla de fallback es **código muerto**.

Veredicto: no es que el outreach no funcione — es que **no sabemos si funciona** y está
goteando muy por debajo de su objetivo.

---

## Datos (outreach-tracker.json)

- 143 contactos. Estados: 132 `followed-up`, 8 `sent`, 3 `pending-email`.
- `meta.stats`: totalSent **141**, totalReplied **0**, totalRegistered **0**, totalActivated **0**.
- Emails: 103 gmail.com, resto dominios propios de creadores (legítimos, no inventados).
- Arranque 2026-05-19 (~26 días). Objetivo: 100 usuarios beta, 5/día. Oferta declarada: "Pro gratis 1 mes".

---

## Hallazgos

### 1. CRÍTICO — Las métricas de resultado no se miden (ceros falsos)
`grep` de `totalReplied|totalRegistered|totalActivated` sobre todo el `.js`: **solo aparece la
definición en el JSON, ningún código los incrementa**. Ningún módulo detecta respuestas ni
marca `dateReplied`/`dateRegistered` por contacto. `gmail.js` procesa la bandeja de
hello@ytubviral.com pero **reenvía al owner / auto-responde**; no cruza el remitente contra
`outreach-tracker.json`. Conclusión: **"0 respuestas / 0 registros" NO es un resultado, es un
vacío de medición.** Es perfectamente posible que haya respuestas en hello@ que nunca se
contabilizaron. No se puede tomar ninguna decisión sobre el outreach con estos números.

### 2. CRÍTICO — Sin atribución del funnel email→herramienta→signup
Todos los emails apuntan a `ytubviral.com/seo-score?utm_source=outreach&utm_medium=email`
(herramienta gratis, SIN registro). Pero `utm_source=outreach` **no se lee en `/api/track`
ni en el funnel**. Así que aunque un creador use la herramienta desde el email, es invisible.
Y como la herramienta no pide registro, **el email por diseño no genera "registros"** — el CTA
es la herramienta gratuita, no el signup. Medir "conversión" como registro mientras el CTA es
una tool sin registro es incoherente: el embudo correcto sería email → usa SEO Score → (más
tarde) se registra, y ese puente no está instrumentado.

### 3. ALTO — Pipeline atascado: la mayoría de runs envían 0
En el log, el cron de envío dispara ~6 veces/día y casi siempre: `Sending to 3 contacts… Done.
0 emails sent.` Causa: `outreach-send.js:105` **salta** cualquier contacto sin
`latestVideo`/`seoScore`/`seoTips`. Los 3 `pending-email` atascados no tienen SEO data → se
reintentan y se saltan en cada run, para siempre. Resultado: throughput muy por debajo del
objetivo de 5/día (en los días vistos salieron 1-3 emails/día como mucho).

### 4. ALTO — La plantilla de fallback es código muerto
`TEMPLATES_FALLBACK` existe en send y followup, pero el `skip` de `send.js:105` impide que
ningún contacto sin SEO data llegue a enviarse. Es decir: el fallback **nunca se usa**. O se
borra, o se permite enviar a contactos sin SEO data con esa plantilla (decisión: ¿queremos
emails genéricos o solo los personalizados con SEO?).

### 5. MEDIO — Mismatch oferta declarada vs. copy real
`meta.offer` dice "Pro plan gratis 1 mes", pero **ningún email lo menciona**. El copy ofrece la
herramienta gratis sin registro. No es malo (baja fricción), pero la estrategia escrita y la
ejecución no coinciden — hay que decidir cuál es la real (ver J3, reescritura de templates).

### 6. MEDIO — Follow-up de un solo disparo
`followup` manda 1 recordatorio (sent→followed-up, `dateFollowUp=null`) y el contacto queda
terminal. 132/143 ya están en `followed-up` = secuencia agotada. Un 2º toque con ángulo
distinto (no "¿lo probaste?" otra vez) suele recuperar respuestas. El asunto "Re: …" finge un
hilo previo en el 1er follow-up — borderline, puede leerse como engaño.

### 7. POSITIVO — Discovery y envío funcionan
`discover.js` encuentra canales vía YouTube API, extrae email (about/web) y **adjunta
`latestVideo` + `seoScore` + `seoTips` reales** (líneas 629-636). El copy de send es decente:
personalizado con el título del vídeo y un tip real, plano, corto, link a tool gratis. Los
envíos tienen éxito (Resend ids en el log). BCC al owner permite verificar entrega.

### 8. NO VERIFICABLE AQUÍ — Entregabilidad / spam
Dominio nuevo (~mayo) + cold email con link + 72% destinatarios gmail = riesgo alto de
Promociones/Spam. No se puede confirmar sin el dashboard de Resend ni ver dónde caen. El BCC al
owner (ytbeviral@gmail.com) permite a Javier comprobar si caen en inbox o spam — **acción
manual recomendada**.

---

## Mejoras propuestas (priorizadas)

### P0 — Empezar a MEDIR (sin esto, todo lo demás es a ciegas)
1. **Detección de respuestas**: en `gmail.js`, cruzar el remitente de cada email entrante
   contra `outreach-tracker.json`; si coincide, marcar `dateReplied` y `meta.stats.totalReplied++`.
   (Hoy las respuestas, si las hay, se pierden.)
2. **Atribución de signups**: leer `utm_source=outreach` en el signup/track del webapp y marcar
   `dateRegistered` en el contacto (match por email del registro ↔ email del contacto).
   Cierra el bucle email→tool→signup.
3. **Sustituir los ceros hardcodeados** por un cálculo derivado de los campos por-contacto, para
   que `meta.stats` no mienta.

### P1 — Desatascar el pipeline
4. Decidir el fallback: o se borra `TEMPLATES_FALLBACK`, o se permite enviar a contactos sin SEO
   data con él (quitar/relajar el `skip` de send.js:105). Hoy 3 contactos están congelados.
5. Si el objetivo es 5/día, `discover` debe alimentar suficientes contactos CON SEO data; revisar
   por qué la cola de `pending-email` está casi vacía (¿discover encuentra pocos con email válido?).

### P2 — Subir tasa de respuesta (tras tener medición)
6. Alinear oferta: si la baza es "Pro gratis 1 mes", decirlo en el email (más potente que solo la
   tool). Decisión de Javier (pricing) — se ejecuta en J3.
7. Follow-up con 2º ángulo distinto (un dato concreto / caso, no "¿lo probaste?" repetido).
8. Comprobar inbox vs spam (BCC owner) y, si caen en Promociones, suavizar señales (menos "link
   pelado", warm-up de dominio, etc.).

---

## Respuesta directa al brief
- **¿Encuentra creadores relevantes?** Sí — canales reales del nicho con email y SEO data real.
- **¿Los emails convierten?** **No se sabe** — no hay medición de respuestas ni de signups; los
  contadores son ceros que nadie incrementa. Hay que instrumentar antes de juzgar.
- **¿El follow-up funciona?** Se envía (1 toque), pero igualmente sin medir si genera respuesta;
  y es de un solo disparo con asunto "Re:" que finge hilo previo.

Conexión con J2 (waitlist) y J3 (templates): J3 debe reescribir el copy/oferta; este audit dice
que **antes de optimizar copy hay que instrumentar la medición**, o se seguirá iterando a ciegas
igual que el bucle social del audit I1.
