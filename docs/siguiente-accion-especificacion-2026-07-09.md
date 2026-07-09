# "Siguiente acción" — Especificación (widget de recomendación cross-tool)

Spec 4 de la ventana Fable 5 (2026-07-09). Origen: §7 de `docs/ia-navegacion-simplificacion-2026-07-08.md`, pospuesto allí y retomado al completarse los 3 specs prioritarios. Es la pieza que remata la tesis de simplificación: **el usuario no debería tener que navegar 24 herramientas — la app le dice cuál tocar hoy y por qué.**

## Principios

1. **v1 sin IA.** Motor de reglas determinista sobre señales que ya están en BD. Ventajas: coste cero por impresión, explicable ("por qué me sugieres esto"), sin latencia, sin riesgo de recomendación inventada. La IA puede llegar en v2 para *redactar* mejor el copy, nunca para *decidir* la acción.
2. **La razón siempre lleva el dato concreto del usuario** ("Tu último vídeo puntúa 54/100", no "mejora tu SEO"). Especificidad = confianza — coherente con la marca de honestidad.
3. **Una acción, no una lista.** Mostrar 3 sugerencias es reproducir el problema del menú en miniatura. Se muestra LA primera regla que dispara; si el usuario la descarta, cae a la siguiente.
4. **Gratis para todos los planes.** El widget dirige tráfico hacia las herramientas; el upsell ocurre dentro de la herramienta Pro si toca (patrón existente). Un widget que solo recomienda a Pro sería un banner de ventas, no una guía.

## Señales disponibles (verificado en `prisma/schema.prisma`, 09/07)

`Generation` (qué ha hecho el usuario y cuándo), `VideoSeoScore` (scores por vídeo), `YoutubeToken` (canal conectado o no), `BestTimeAnalysis` (existencia + antigüedad), `TrackedCompetitor` (nº), `AbTest` (activos), `CalendarEntry` (próximos 7 días), `TrendAlert` (no vistas), `DailyIdea` (ideas del día), `ChannelSnapshot` (histórico del canal). Todo consultable con counts/latest baratos — sin tablas nuevas.

## Motor: `GET /api/next-action`

Ruta nueva con auth de sesión. Evalúa el catálogo de reglas **en orden de prioridad** y devuelve la primera que dispara:

```json
{ "action": {
    "id": "optimize_low_score",
    "title": {"es": "...", "en": "..."},
    "reason": {"es": "Tu último vídeo puntúa 54/100", "en": "..."},
    "cta": {"es": "Optimizarlo", "en": "Optimize it"},
    "href": "/optimize?video=XYZ&from=next-action"
  } }
```

Parámetro `?skip=id1,id2` (acciones descartadas hoy, ver Descartes) → el motor las salta y devuelve la siguiente. Coste: 5-8 queries count/findFirst — sin caché en v1 (las señales cambian intra-sesión: conectar canal debe actualizar la sugerencia al instante).

## Catálogo de reglas v1 (orden = prioridad)

| # | id | Condición (BD) | Acción sugerida | href |
|---|---|---|---|---|
| 1 | `connect_channel` | Sin `YoutubeToken` | Conectar el canal — desbloquea datos reales en toda la app | `/profile` (o el flujo OAuth directo) |
| 2 | `first_generation` | 0 `Generation` | Generar el primer título (continuidad del onboarding) | `/generate` |
| 3 | `score_recent_video` | Canal conectado + hay vídeo de <7 días sin `VideoSeoScore` | Puntuar el vídeo recién publicado | `/seo-score?video=…` |
| 4 | `optimize_low_score` | Último `VideoSeoScore` < 60 | Optimizar ese vídeo (mostrar el score en la razón) | `/optimize?video=…` |
| 5 | `track_competitors` | Canal conectado + 0 `TrackedCompetitor` | Añadir 1-2 competidores (alimenta Competidores hoy y `/discover` mañana) | `/competitors` |
| 6 | `best_time_stale` | Sin `BestTimeAnalysis` o >30 días | Calcular la mejor hora de publicación | `/best-time` |
| 7 | `trend_alert_unseen` | `TrendAlert` sin ver | Revisar la tendencia detectada (nombrarla en la razón) | `/trends` |
| 8 | `plan_week` | 0 `CalendarEntry` en los próximos 7 días | Planificar la semana (con las ideas de hoy si existen) | `/calendar` |
| 9 | `start_ab_test` | Canal con ≥3 vídeos + 0 `AbTest` activo + es Pro | Probar un A/B test de título | `/ab-test` |
| 10 | `daily_idea` | Hay `DailyIdea` de hoy | Desarrollar la idea nº1 del día (citarla) | `/generate?topic=…` |
| — | fallback | Nada dispara | Tip del día (comportamiento actual, `/api/daily-tip`) | — |

Notas de implementación por regla: (3) "vídeo de <7 días" sale de la lista de uploads ya cacheada (`YoutubeCache`/`ChannelSnapshot` — verificar cuál tiene los uploads al implementar); (7) `TrendAlert` necesita noción de "visto" — verificar si el modelo ya tiene campo; si no, añadir `seenAt DateTime?` (migración trivial, modelar en schema.prisma); (9) va tan abajo porque es la única Pro-gated — nunca debe ser lo primero que ve un Free.

El catálogo es **datos, no código**: implementarlo como array de reglas `{id, condition(ctx), buildAction(ctx)}` evaluado en orden, para que añadir/reordenar reglas (incluidas las de Fase 8 cuando existan: `/discover` con outliers nuevos, velocity alert…) sea añadir un elemento, no tocar el motor.

## UI

- **Dónde:** card "Siguiente acción / Next step" en la columna derecha del dashboard, ARRIBA de "Ideas para hoy"/"Tip del día" (`app/dashboard/page.tsx`, zona ~1504). No sustituye a Ideas para hoy — conviven: una guía de acción, la otra da temas. Cuando la regla 10 dispara, sí sustituye al bloque de ideas (sería redundante).
- **Anatomía:** icono de la herramienta (librería `components/icons/index.tsx`) + título corto + razón con el dato + botón CTA + "✕ hoy no".
- **Descartes:** "✕" guarda el id en `localStorage` con la fecha (`ytv_na_skip_2026-07-09: [ids]`) y re-pide con `?skip=`. Client-side es suficiente en v1 (perder los descartes al cambiar de dispositivo es inofensivo: verá la sugerencia otra vez). Los descartes expiran a diario — una acción válida puede volver mañana.
- **Medición:** el `from=next-action` en los href queda registrado por el `PageViewTracker` existente (tráfico interno — no toca la decisión de links limpios externos, que es otra cosa). Con eso `/api/analytics` puede responder "¿cuántos clics genera el widget y a qué herramientas?" sin infra nueva.

## Extensión futura (no v1)

- El panel de homepage de la extensión v2.6 ("Qué grabar hoy") podría llamar a `/api/next-action` vía una ruta `extension/` gemela — misma mecánica que daily-ideas. Dejar para v2.7 con datos de uso del widget web.
- v2 con IA: reordenar reglas empatadas según patrón de uso del usuario, o redactar la razón con más contexto. Solo si los datos de clics de v1 lo justifican.

## Criterios de aceptación

- Usuario nuevo sin canal → la card muestra "Conectar canal"; tras conectarlo, un refresh muestra ya otra regla (sin caché rancia).
- Usuario con último vídeo puntuando <60 → la razón incluye el score numérico real y el CTA lleva a `/optimize` con el vídeo preseleccionado.
- "✕ hoy no" → la card pasa a la siguiente regla sin recargar; la descartada no reaparece hasta mañana.
- Usuario Free nunca ve la regla 9 (A/B test) como primera sugerencia.
- Con todo en orden (nada dispara) → tip del día, como hoy — el dashboard nunca queda con una card vacía.
- Los clics del widget aparecen en `/api/analytics` filtrando por `from=next-action`.
