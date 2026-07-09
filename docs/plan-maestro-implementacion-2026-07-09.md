# Plan maestro de implementación — specs de la ventana Fable 5

2026-07-09. Documento coordinador de los 7 specs escritos el 08-09/07. Define **orden temporal, dependencias y puertas de activación**. Cualquier modelo que implemente algo de esta lista debe leer PRIMERO este documento, luego el spec concreto.

## Los 7 specs

| # | Spec | Doc | Naturaleza |
|---|------|-----|-----------|
| S1 | Arquitectura de navegación | `ia-navegacion-simplificacion-2026-07-08.md` | UX / prerequisito de S2 |
| S2 | Fase 8 (9 features web) | `fase8-especificacion-2026-07-08.md` | Producto nuevo |
| S3 | Extensión v2.6 | `extension-v2.6-especificacion-2026-07-08.md` | Producto nuevo (canal CWS) |
| S4 | Widget "Siguiente acción" | `siguiente-accion-especificacion-2026-07-09.md` | UX / activación |
| S5 | Programa de afiliados | `programa-afiliados-especificacion-2026-07-09.md` | Distribución |
| S6 | Data study explotación v2 | `data-study-explotacion-v2-2026-07-09.md` | Distribución / SEO |
| S7 | Trial/Stripe hardening | `trial-stripe-hardening-2026-07-09.md` | Seguridad de ingresos |

## Principio rector: el freeze del 07/07 clasifica todo

La revisión estratégica vigente congela la construcción de producto y vuelca todo en distribución. Eso divide los specs en tres vías con puertas distintas:

- **Vía A — EXENTA del freeze, ejecutar ya:** S7 (proteger el dinero no es construir producto) y S5+S6 (SON distribución, el freeze existe para priorizarlas).
- **Vía B — Trabajo barato de UX, no gated pero no urgente:** S4 y la parte estructural de S1 (reordenar el sidebar + badges PRO). No son "features nuevas" en sentido estricto, pero tampoco corren prisa: encajar en huecos.
- **Vía C — GATED por tracción, NO empezar sin cruzar la puerta:** S2 (Fase 8) y S3 (extensión v2.6).

**Puertas de la vía C (medibles, no vibes):**
- S3 se desbloquea cuando: v2.5.0 aprobada por Google Y ≥25 instalaciones activas en CWS (señal de que hay a quién convertir).
- S2 se desbloquea cuando: primer pago externo real (meta 30d del plan estratégico) O ≥20 usuarios activos semanales. Hasta entonces, Fase 8 no existe.
- Si Javier decide descongelar antes, es su llamada — pero el implementador no debe asumirlo.

## Orden temporal

### Fase 0 — INMEDIATA (esta semana; hay un trial real que vence ~13/07)

Solo S7, gaps 3, 5, 1 y 2 — en ese orden:
1. **S7-Gap3** (webhook devuelve 200 en errores): ~10 líneas, elimina pérdida silenciosa de eventos. Va PRIMERO porque todo lo demás que toque el webhook (S7-Gap1/2, S5 más adelante) se construye encima de un webhook que ya no pierde eventos.
2. **S7-Gap5** (verificación del trial activo): checklist contra BD y Stripe test mode. Mismo día.
3. **S7-Gap1** (trial ending reminder): **fecha límite dura ≈ 10/07** — el evento `trial_will_end` del trial actual dispara 3 días antes del fin (~13/07). Si no llega a tiempo, avisar a ese usuario a mano por email (con OK de Javier) y el código llega para el siguiente trial.
4. **S7-Gap2** (email de pago fallido + revisión Smart Retries en dashboard).

S7-Gap4 (garantía 30d) y Gap6 (reconciliación) no son urgentes: Gap4 espera el OK de Javier al texto; Gap6 puede ir en Fase 1.

### Fase 1 — DISTRIBUCIÓN (próximas 1-3 semanas, el grueso del esfuerzo)

En paralelo si hay capacidad, o en este orden si no:

**S6 primero (es lo que más tiempo lleva en dar fruto — SEO):**
1. Re-recogida de datasets (~1.630 unidades de cuota → **ese día no ejecutar nada más intensivo en cuota**) + versionar en `data/` del repo.
2. 16 sub-páginas por nicho + cableado SEO (sitemap, cache pattern, Indexing API).
3. Ola 2 de outreach: los segmentos 1-2 (autores que rankean + newsletters) pueden arrancar ANTES de que las sub-páginas estén live; el segmento 3 (blogs por nicho) las necesita.

**S5 después de S7-Fase 0 (dependencia técnica dura):**
1. El devengo de comisiones de S5 vive en el MISMO webhook que S7 endurece — implementar S5 sobre el webhook ya arreglado, nunca antes (comisiones sobre eventos que se pierden = contabilidad rota).
2. Orden interno de S5 (del propio spec): tracking primero (schema + `/a/{code}` + captura en signup) → devengo → página pública → panel → legal/fiscal. El tracking desplegado temprano permite dar link de afiliado a Erika/Krishna aunque el resto no exista.
3. S7-Gap4 (garantía) conviene resolverlo antes del primer payout de S5 (la reversión de comisiones por refund depende de que la garantía esté operativa) — no bloquea construir, sí bloquea PAGAR.

**Cierre de Fase 1:** S7-Gap6 (reconciliación semanal) — cuando ya existan las suscripciones + comisiones que reconciliar.

### Fase 2 — UX BARATO (encajar en huecos, sin fecha)

1. **S1 estructural**: reordenar `SECTIONS` del sidebar + badges PRO consistentes. Un fichero, cero riesgo. Hacerlo ANTES de S4 (el widget referencia la taxonomía final) y obligatoriamente antes de S2.
2. **S4** (Siguiente acción): tras S1. Nota: su regla 9 (A/B test) y el prellenado `?topic=` de `/generate` son también piezas que S3 y S2 reutilizan — S4 es el mejor "primer cliente" de ese prellenado.

### Fase 3 — GATED (solo tras cruzar las puertas de la vía C)

1. **S3** (extensión v2.6) cuando su puerta abra. Su paso 1 (rutas backend `app/api/extension/{ab-test,daily-ideas}` + extracción `lib/ab-test.ts`) es desplegable ANTES sin riesgo si conviene adelantar — son rutas sin tráfico hasta que la extensión las llame.
2. **S2** (Fase 8) cuando su puerta abra, en su orden interno: F8.8 → F8.3 → F8.1 → F8.4 → F8.2 → F8.5 → F8.7 → F8.6 → F8.10. Recordatorios duros del spec: F8.1 antes que F8.4/F8.7 (crea `/discover` y las tablas que reutilizan); F8.7 nunca en paralelo con F8.1.

## Grafo de dependencias (resumen)

```
S7-Gap3 ──► S7-Gap1/Gap2 ──► S5-devengo ──► S5-payouts ◄── S7-Gap4 (garantía)
   │                              ▲
   └──► (webhook sano)            └── S5-tracking (independiente, puede ir antes)

S6-datasets ──► S6-subpáginas ──► S6-outreach-seg3
                                  S6-outreach-seg1/2 (independientes)

S1 ──► S4 ──► (patrón ?topic= reutilizado por S2/S3)
S1 ──► S2 (taxonomía obligatoria)
S2-F8.1 ──► S2-F8.4, S2-F8.7
S3-backend (adelantable) ──► S3-extensión (gated)
```

## Reglas transversales para CUALQUIER implementador

1. **Leer el spec completo antes de tocar código** y ejecutar sus "verificar al implementar" — los specs fotografían el código a 08-09/07; puede haber cambiado.
2. **Colisiones de cuota YouTube (10k/día):** S6-recogida (~1.630), S2-F8.6 (search), S2-F8.2 (escrituras ~50/vídeo) — nunca dos de estas el mismo día. Al llegar la tercera feature consumidora, implementar el contador diario de cuota (S2, riesgos transversales).
3. **Emails a usuarios SIEMPRE via lifecycle emails** (fuente única). Emails a terceros (outreach S6) SIEMPRE con OK previo de Javier.
4. **Toda tabla nueva en `schema.prisma`** (el deploy corre `db push --accept-data-loss`).
5. **Flujo de cada bloque:** typecheck (`npx tsc --noEmit`) → probar en dev local (puerto 3011) → actualizar el archivo de memoria correspondiente → commit+push. Next.js 16: leer `node_modules/next/dist/docs/` antes de código de framework.
6. **Líneas rojas intactas:** precios/planes, emails a usuarios, DNS — consultar siempre.

## Decisiones pendientes de Javier (consolidadas — desbloquean piezas concretas)

| Decisión | Spec | Bloquea |
|---|---|---|
| ¿Gracia 7d en `past_due` o corte inmediato? | S7 | Gap2 (implementable con corte por defecto si no hay respuesta) |
| Aprobar texto garantía 30d | S7 | Publicación en Terms + primer payout S5 |
| Revisar Smart Retries en dashboard Stripe (5 min) | S7 | Nada (mejora) |
| ¿Descuento asociado al código de afiliado? | S5 | Nada (v1 funciona sin ello) |
| Umbral payout (50€ propuesto) y método | S5 | Primer pago a afiliado |
| ¿Relanzar propuesta a Erika con el programa montado? | S5 | Nada (táctica comercial) |
| Copy "14 herramientas" hardcodeado (legal/terms/blog) | S1 §6 | Nada (deuda de coherencia; recomendado lenguaje sin cifra) |

## Qué NO está en ningún spec (y no debe colarse)

Packs de vídeos 2-4 (decidido dejar fuera de la ventana), atribución social/UTM (decisión cerrada: no tocar), ASO del listing CWS (esperar datos de v2.5), cualquier feature no listada — si surge una idea nueva durante la implementación, va a memoria como candidata, no al código.
