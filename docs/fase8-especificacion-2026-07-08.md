# Fase 8 — Especificación funcional y técnica

Spec 2/3 de la ventana Fable 5 (2026-07-08). Prerrequisito: la taxonomía de `docs/ia-navegacion-simplificacion-2026-07-08.md` (§4) — este doc asume esas decisiones (fusiones + `/discover` con 4 pestañas).

**Contexto de ejecución:** el producto está congelado por la revisión estratégica del 07/07 — este documento NO es una orden de implementar ahora. Es el trabajo de diseño hecho por adelantado para que, cuando haya tracción y se descongele, otro modelo pueda ejecutar sin re-derivar decisiones. Por eso cada feature lleva criterios de aceptación verificables y notas explícitas de "verificar al implementar" donde el estado del código puede haber cambiado.

## Convenciones globales (aplican a todas las features)

- **Gating:** todas las features de Fase 8 son Pro salvo teaser indicado. Añadir los límites nuevos a `PLAN_LIMITS` en `lib/plans.ts` y aplicar enforcement en la API route (patrón existente en ~46 rutas), nunca solo en UI. Mostrar la feature en el nav con badge `PRO` (patrón `NavItem.badge`), con upsell in-page al tocarla en Free — coherente con la política de transparencia.
- **Personalización IA:** usar `lib/channel-context.ts` (builder compartido ya usado por Generator y Coach) en todo prompt que dependa del canal del usuario. Prompt caching ya activado en la infra — estructurar prompts con el contexto estable primero.
- **Bilingüe:** todo copy ES+EN (patrón `{es, en}` existente). La respuesta IA en el idioma de la UI del usuario.
- **Cuota YouTube Data API:** 10.000 unidades/día. Referencia de costes: `search.list` = 100 unidades (EVITAR, es el devorador de cuota), `videos.list` / `playlistItems.list` / `channels.list` = 1 unidad. Cada feature indica su estrategia de cuota.
- **BD:** toda tabla nueva se modela en `schema.prisma` (regla crítica: el deploy corre `db push --accept-data-loss` — una tabla creada a mano fuera del schema se BORRA en el siguiente deploy).
- **Verificar al implementar:** Next.js 16 tiene breaking changes — leer `node_modules/next/dist/docs/` antes de escribir código de framework. Verificar el modelo Claude vigente en las rutas de generación existentes y usar el mismo.

## Esfuerzo y orden de implementación

| Orden | Feature | Ubicación | Esfuerzo | Por qué este orden |
|---|---|---|---|---|
| 1 | F8.8 Hook Analyzer | dentro de `/generate` | S | Solo IA, cero APIs nuevas, cero tablas. Valor inmediato |
| 2 | F8.3 CTR Predictor | dentro de `/thumbnail-preview` | S-M | Una llamada de visión, muy visual, gancho de marketing |
| 3 | F8.1 Outlier Detector | `/discover` › Outliers | M | Crea la página `/discover` y la tabla de baselines que F8.7 reutiliza |
| 4 | F8.4 Content Gap Finder | `/discover` › Gaps | M | Reutiliza competidores trackeados + OAuth ya existentes |
| 5 | F8.2 Bulk Optimizer | modo en `/optimize` | L | Alto valor para canales grandes; el más delicado (escrituras en YouTube) |
| 6 | F8.5 Velocity Analytics | dentro de `/analytics` | M | Requiere cron de snapshots; mejor con usuarios activos reales |
| 7 | F8.7 Viral Ideas DB | `/discover` › Ideas | M | Depende de los datos acumulados por F8.1 |
| 8 | F8.6 Niche Scanner | `/discover` › Nicho | M-L | El más caro en cuota; mitigable pero mejor al final |
| 9 | F8.10 Agency Lite | extender `/team` | L | Solo con demanda real de agencias |

F8.9 no está aquí: es roadmap de extensión (spec 3/3).

---

## F8.8 — Script Hook Analyzer (dentro de `/generate`)

**Objetivo:** el usuario pega los primeros ~30 segundos de su guion y recibe un diagnóstico del hook + reescrituras.

**UX:** nueva acción "Analizar hook" en `/generate` (junto a los tipos de generación existentes). Input: textarea 50–500 palabras. Output: score 0–100 con 4 subscores (curiosidad, tensión, promesa, pattern interrupt), 2–3 frases de diagnóstico, y 3 reescrituras completas del hook ordenadas por diferencia respecto al original (una conservadora, una intermedia, una agresiva).

**Implementación:** una llamada IA con salida JSON estructurada `{score, subscores{}, diagnostico, reescrituras[]}`. Prompt: rúbrica explícita de los 4 subscores con ejemplos de hooks 90+ y hooks 30- (escribir 3-4 ejemplos por extremo en el prompt, estables para cacheo), + channel-context para que las reescrituras suenen al canal del usuario. Sin APIs externas, sin tablas nuevas.

**Gating:** consume el contador `generationsPerMonth` existente (1 análisis = 1 generación) — cero contadores nuevos, disponible en Free dentro de su límite.

**Aceptación:** texto de 50–500 palabras → score + subscores + 3 reescrituras en <15s, en el idioma de la UI; con canal conectado, las reescrituras reflejan el nicho (verificable manualmente); textos fuera de rango dan error claro sin consumir generación.

---

## F8.3 — Thumbnail CTR Predictor (dentro de `/thumbnail-preview`)

**Objetivo:** subir una miniatura (o dos) antes de publicar y saber si funcionará.

**UX:** pestaña/sección nueva "Predictor CTR" dentro de `/thumbnail-preview` (NO página nueva). Modo single: upload → score 0–100 + subscores (contraste, rostro/expresión, legibilidad del texto, composición/foco) + 3–5 sugerencias accionables ("el texto ocupa <15% del frame, agrándalo"). Modo A/B: dos uploads lado a lado → ganadora declarada + por qué, en 2–3 frases.

**Implementación:** visión de Claude — imagen + prompt de rúbrica, salida JSON. Reglas de la rúbrica en el prompt (estable, cacheable): contraste figura/fondo, presencia y expresión de rostro, nº de palabras y tamaño relativo del texto, regla de tercios/foco único, saturación. Aceptar JPG/PNG/WebP ≤2MB, redimensionar server-side a ~1280px antes de enviar (coste de tokens de imagen contenido).

**Restricción de autenticidad (regla de marca):** v1 NO tiene dataset propio de CTR real — presentar el resultado como "análisis IA de buenas prácticas", NUNCA como "benchmark de tu nicho" ni "datos reales de CTR". El benchmark de nicho queda explícitamente fuera de v1 hasta tener datos propios.

**Gating:** Free 3 análisis/mes (teaser con valor real), Pro 50/mes. Contador nuevo `thumbnailAnalysesPerMonth` en `PLAN_LIMITS`.

**Aceptación:** imagen válida → score + ≥3 sugerencias en <10s; modo A/B declara ganadora con razones; imagen >2MB o formato inválido → error claro sin consumir cupo; Free al 4º análisis ve upsell, no error genérico.

---

## F8.1 — Outlier Detector (pestaña "Outliers" de `/discover`)

**Objetivo:** encontrar vídeos del nicho con rendimiento anómalo (views muy por encima de la media de su canal) y poder hacerles ingeniería inversa.

**UX:** primera pestaña de la página nueva `/discover`. Filtros: ratio mínimo (3×/5×/10×), periodo (30/90/365 días), formato (largos/Shorts/todos). Card por outlier: thumbnail, título, canal, views, media del canal, ratio destacado, edad del vídeo. Botón por card: **"Ingeniería inversa"** → genera un brief adaptado al canal del usuario (ángulo, hook sugerido, 3 títulos, estructura) usando channel-context.

**Fuente de datos (estrategia de cuota — la decisión clave):** NO usar `search.list`. Seeds = los canales competidores que el usuario ya trackea (feature F2.2 existente — verificar el modelo/tabla de competitors al implementar). Por cada canal seed: `playlistItems.list` de su playlist de uploads (1 unidad) → últimos ~30 vídeos → `videos.list` batch de stats (1 unidad/50 vídeos). Media del canal = media de views de esos vídeos, excluyendo el top y bottom 10% (media truncada, robusta a outliers previos). Outlier = vídeo con views ≥ N× esa media.

**Modelo de datos:** tabla `ChannelBaseline` (channelId, avgViews, videoCount, computedAt) — caché 7 días, compartida entre usuarios que trackean el mismo canal. Tabla `OutlierVideo` (videoId, channelId, views, ratio, title, thumbnailUrl, publishedAt, detectedAt) — persistir los detectados: es el corpus que alimenta F8.7. Ambas en `schema.prisma`.

**Gating:** Free ve los 3 primeros outliers y el resto con blur + upsell (transparencia: se ve QUE hay más, no QUÉ hay). Pro completo + 20 ingenierías inversas/mes (`reverseEngineerPerMonth`).

**Aceptación:** usuario con ≥1 competidor trackeado → la pestaña lista ≥5 outliers 3× en <5s con caché caliente (<20s en frío); ingeniería inversa produce brief completo en el idioma de la UI; usuario sin competidores → empty state que enlaza a `/competitors`, no pantalla rota.

---

## F8.4 — Content Gap Finder (pestaña "Gaps" de `/discover`)

**Objetivo:** "temas donde tus competidores tienen vídeos y tú no", ordenados por oportunidad.

**Pipeline:** (1) recoger títulos+tags de los últimos ~30 vídeos de cada competidor trackeado (mismos datos y caché que F8.1 — implementar F8.1 primero); (2) una llamada IA batch: dado el listado de vídeos de competidores Y el listado de títulos del canal propio (OAuth), extraer temas recurrentes de competidores y clasificar cada uno como cubierto/no-cubierto por el usuario, con salida JSON `{tema, canalesQueLoTienen, viewsMedios, cubierto, videoPropioMasCercano?}`; (3) opportunity score = nº de competidores con el tema × views medios normalizados × (no cubierto). Una sola llamada IA por refresh, no una por tema.

**UX:** lista de gaps ordenada por score. Por gap: tema, qué competidores lo tienen (con views), y botón **"Crear vídeo"** → navega a `/generate` con el tema prellenado (query param). Refresh manual con caché de 24h (no recalcular en cada visita).

**Gating:** Pro. Free: teaser con el gap nº1 visible y el resto con blur.

**Aceptación:** canal con OAuth + ≥2 competidores → ≥5 gaps con score y CTA funcional a `/generate` prellenado; sin OAuth → empty state que lleva a conectar canal; el refresh dentro de las 24h sirve caché (verificable por tiempo de respuesta).

---

## F8.2 — Bulk Optimizer (modo dentro de `/optimize`)

**Objetivo:** optimizar N vídeos propios de una vez en lugar de uno a uno.

**UX:** en `/optimize`, toggle "Modo lote" → la lista de vídeos propios gana checkboxes + barra de acciones: (a) regenerar títulos con IA, (b) regenerar descripciones, (c) regenerar tags, (d) aplicar plantilla de descripción (texto con variables `{titulo}`, `{link_canal}`, modo append o replace). Flujo estricto en 3 pasos: seleccionar → **preview con diff por vídeo** (antes/después, editable por item, item descartable) → aplicar. Nada se escribe en YouTube sin pasar por el preview.

**Implementación de la escritura (la parte delicada):**
- Aplicación **secuencial con cola y estado por item** (pending/done/failed), no `Promise.all` — un fallo a mitad no puede dejar el lote en estado desconocido. UI de progreso item a item; lote reanudable si el usuario cierra.
- **Rollback:** antes de escribir cada vídeo, snapshot del estado previo (title, description, tags) en tabla `BulkOperation` + `BulkOperationItem` (en `schema.prisma`). Botón "Revertir lote" disponible 30 días.
- Escritura via `videos.update` con el write scope de OAuth ya concedido — **verificar al implementar** que el scope concedido incluye escritura y el coste de cuota vigente de `videos.update` (históricamente ~50 unidades: un lote de 20 vídeos ≈ 1.000 unidades, 10% de la cuota diaria → límite duro de 20 vídeos/lote y aviso de cuota en UI).
- Generación IA del preview en batch (una llamada por tipo de campo para todo el lote, no una por vídeo).

**Gating:** Pro, contra el límite `bulkPerMonth` que ya existe en `PLAN_LIMITS` (verificar su valor al implementar).

**Aceptación:** seleccionar 5 vídeos → preview con diff editable → aplicar → los 5 actualizados en YouTube (verificación manual) con estado done por item; matar el proceso a mitad → el lote queda reanudable sin items duplicados ni perdidos; "Revertir lote" restaura los 5 exactos; intento de lote de 21+ vídeos → bloqueado con mensaje de límite.

---

## F8.5 — Velocity Analytics (dentro de `/analytics`)

**Objetivo:** "¿cómo va este vídeo en sus primeras horas/días comparado con lo normal en mi canal?"

**Ubicación:** sección nueva en `/analytics` (ya es la página de series temporales del canal; `/predictor` se descartó porque su mental model es pre-publicación y esto es post-publicación).

**Implementación:**
- **Snapshots:** cron de Vercel cada 2h que, para cada vídeo con <7 días de usuarios Pro con OAuth, guarda (videoId, viewCount, likeCount, commentCount, capturedAt). **Reutilizar/extender el modelo `VideoVelocitySnapshot` que ya existe** (creado 2026-06-14 para el VPH del scorecard de la extensión) — verificar su shape al implementar y extender antes que duplicar. Coste: `videos.list` batch = ~1 unidad por usuario por tick, trivial.
- **UI:** gráfico de las primeras 24h/48h/7d del vídeo vs (a) la mediana de los últimos 10 vídeos del canal a la misma edad y (b) el best performer. Insight de una línea generado por regla, no por IA ("A las 24h lleva 2,3× tu mediana").
- **Alertas:** email "este vídeo va ≥3× tu mediana en sus primeras 4h" (momento de acción: pinnear comentario, compartir, etc.). **Integrar en el sistema de lifecycle emails existente** — es la fuente única de email a usuarios; NO crear un sender standalone (regla establecida tras retirar los duplicados en junio). Máximo 1 alerta por vídeo.

**Gating:** Pro (el cron solo trackea vídeos de usuarios Pro — el gating es también control de coste de cuota).

**Aceptación:** usuario Pro publica un vídeo → a las 24h existen ≥10 snapshots y el gráfico compara vs mediana y best performer; vídeo que supera 3× → exactamente 1 email; usuario Free no genera snapshots (verificable en BD).

---

## F8.7 — Viral Ideas Database (pestaña "Ideas" de `/discover`)

**Objetivo:** feed de ideas/formatos probados, adaptables al canal del usuario con un clic. **Depende de F8.1** (su corpus).

**v1 sin curación manual continua** (el roadmap original decía "puede empezar manual" — esto lo evita):
- **Corpus dinámico:** la tabla `OutlierVideo` de F8.1, agregada cross-usuarios. Solo vídeos públicos de terceros ya detectados como outliers — sin datos privados de usuarios, sin problema de privacidad. Un job semanal "promociona" a la DB de ideas los outliers nuevos con ratio ≥5×, deduplicados por tema (IA batch: agrupar por patrón).
- **Corpus estático inicial:** lista curada de ~30 formatos probados atemporales ("X vs Y", "Probé X durante 30 días", rankings, "errores que cometes con X"…) para que la pestaña tenga contenido desde el día 1, antes de que el corpus dinámico engorde. Escribir los 30 al implementar (o encargar a Fable en una futura ventana).
- **UX:** feed filtrable por nicho/formato/duración. Por idea: patrón identificado, ejemplo real (si viene del corpus dinámico), botón **"Adaptar a mi canal"** → genera con channel-context el ángulo concreto + título + hook, o navega a `/generate` prellenado.

**Gating:** Pro. Free: 3 ideas visibles, resto blur.

**Aceptación:** filtrar por nicho devuelve ideas con patrón + CTA "Adaptar" funcional; tras 2+ semanas con F8.1 activo, el feed contiene entradas dinámicas (no solo las 30 estáticas); no aparece ningún dato de canales privados de usuarios.

---

## F8.6 — Niche Scanner (pestaña "Nicho" de `/discover`)

**Objetivo:** dado un tema, encontrar canales pequeños (<10k subs) creciendo rápido — "¿hay hueco en este nicho y quién lo está aprovechando?"

**El problema es la cuota** (esta feature es la razón de ir al final): descubrir canales por tema requiere `search.list` (100 unidades). Mitigación en tres capas:
1. **Caché agresiva compartida:** tabla `NicheScan` (tema normalizado, resultados JSON, scannedAt) — un escaneo de "ajedrez en español" sirve a TODOS los usuarios durante 14 días. Normalizar el tema con IA barata (lowercase + canonicalización: "chess español" → "ajedrez") antes de buscar en caché.
2. **Presupuesto:** máx. 2 `search.list` por escaneo (200 unidades) → pipeline: search por tema (50 resultados) → `channels.list` batch de stats (1 unidad) → filtrar <10k subs → growth rate estimado comparando la edad del canal con subs/views (sin API de histórico: aproximación honesta, etiquetarla como estimación en UI) → para los top 5-8 canales, `playlistItems` + `videos.list` de sus mejores vídeos (~10 unidades).
3. **Límite de producto:** 5 escaneos nuevos (cache-miss)/mes en Pro (`nicheScansPerMonth`); los cache-hit no consumen.

**UX:** input de tema → tarjetas de canales emergentes (subs, views, ritmo estimado, sus 3 mejores vídeos, keywords que usan) + bloque "huecos detectados" (IA: temas con demanda aparente y poca oferta de calidad, generado del propio resultado).

**Aceptación:** tema nuevo → ≥5 canales emergentes con métricas en <30s; repetir el mismo tema (u otro usuario) dentro de 14 días → respuesta <2s desde caché sin gasto de cuota (verificable en BD/logs); el 6º escaneo cache-miss del mes en Pro → upsell/aviso, no error.

---

## F8.10 — Agency Lite (extender `/team`)

**Objetivo:** que una agencia o creador multi-canal gestione 2–5 canales con una cuenta Business. Baja prioridad — **no implementar sin demanda real** (regla del roadmap original, sigue vigente).

**Alcance cuando toque:**
- **Multi-canal:** hoy la relación usuario↔canal YouTube es 1:1 (verificar el modelo al implementar). Pasar a N canales por cuenta Business con un **selector de canal activo** global (en el header del dashboard) que fija el contexto de TODAS las páginas — el resto de la app no cambia, lee "el canal activo" en vez de "el canal". Este es el 80% del esfuerzo y es transversal: hacerlo de una vez, no página a página.
- **Permisos:** extender el modelo de team existente con rol por miembro (viewer/editor/admin): viewer no genera ni escribe en YouTube, editor todo menos gestionar miembros/facturación, admin todo.
- **Reporting:** export PDF por canal (métricas del mes, top vídeos, evolución) con logo subible por la cuenta — es el entregable que la agencia reenvía a SU cliente, y la razón de pagar Business.

**Gating:** exclusivo Business (29,99€) — da contenido real a un tier que hoy se diferencia poco.

**Aceptación:** cuenta Business conecta 2º canal → el selector aparece y todas las páginas reflejan el canal activo; un viewer no puede generar (bloqueado en API, no solo UI); el PDF exporta con branding correcto.

---

## Riesgos transversales

1. **Cuota YouTube compartida:** F8.1+F8.4 (lecturas), F8.2 (escrituras caras), F8.5 (polling) y F8.6 (search) beben del mismo pozo de 10k unidades/día para TODA la app. Al implementar la 3ª de estas features, añadir un contador diario de unidades consumidas (tabla simple o counter en BD) con alerta al Manager al 70% — antes de eso no hace falta.
2. **Coste IA:** las llamadas nuevas más caras son visión (F8.3) y los batch de F8.4/F8.7. Todas van gateadas por límites de plan desde el día 1, y el prompt caching ya activo amortigua los prompts de rúbrica largos.
3. **Datos de terceros mostrados a usuarios:** F8.1/F8.6/F8.7 muestran métricas de canales ajenos — todo dato público de la API oficial, mismo terreno que ya pisan vidIQ/Social Blade. No mostrar nunca estimaciones como hechos (etiquetar "estimado" donde aplique — coherente con la marca de honestidad).
4. **Orden importa:** F8.1 crea infra que F8.4 y F8.7 reutilizan (baselines, corpus, la propia página `/discover`). No paralelizar F8.7 antes que F8.1.
