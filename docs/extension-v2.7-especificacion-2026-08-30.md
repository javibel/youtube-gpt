# Extensión Chrome v2.7 — Especificación (P1 + P2 del teardown vidIQ)

Origen: teardown competitivo de la extensión de vidIQ (30/08/2026, artefacto `https://claude.ai/code/artifact/acb3a1b4-bed7-42cd-aaeb-2e66a8432c45`). Conclusión: en **capacidades** ya empatamos o ganamos a vidIQ; perdemos en **presencia** (aparecemos a trozos, sin lanzador fijo), **legibilidad** (paneles sueltos con cabeceras distintas, vista expandida = muro) y porque **todo está detrás del login** (instalación nueva no ve nada).

Alcance v2.7 = las dos palancas de mayor impacto:
- **P1** — Lanzador fijo + panel unificado en toda la web.
- **P2** — Valor en el segundo 1, sin login.

Backlog posterior (P3–P8) al final del doc.

**Restricciones heredadas (no negociables):** cero permisos nuevos en `manifest.json`, reutilizar backend existente, coste Claude solo tras Pro, verificar en local antes de push (`tsc --noEmit`, `node --check` en los `.js`).

---

## Hechos del código verificados (30/08/2026)

### Extensión (`chrome-extension/`, movida dentro del repo en `youtube-gpt/chrome-extension/`)
- `content.js` (~2140 líneas). Injectores **independientes**, cada uno crea su propio DOM con su cabecera `.ytv-header` ("YTubViral / Keywords", "YTubViral / Tu Canal") o su píldora "YTV":
  `injectVideoPanel`, `injectShortsPanel`, `injectSearchPanel`, `injectChannelPanel`, `injectChannelStats`, `injectStudioEditor`, `injectStudioUploadPanel` (vía `watchStudioUpload`), `injectStudioVideoList`, `injectVelocityBadges`, `injectDailyIdeasPanel`, `injectLoggedOutPanel`.
- `onPageChange()` (~línea 2026) despacha por `getPageType()` + hostname. `dispatchWithRetry` + `expectedPanelId()` reintentan hasta 2 veces si el panel esperado no aparece (carrera con el render SPA de YouTube).
- `SELECTORS` centralizado (v2.5.0). `createPanel(id)` = factory mínima (`div.ytv-panel`, quita duplicado previo).
- `maybeShowReviewPrompt()` (prompt de reseña CWS tras 5 usos del scorecard). `chrome.runtime.onMessage` escucha `YTV_RECHECK_IDEAS` del popup.
- `background.js`: 17 handlers en `handleMessage`, helper `apiFetch()` (timeout 15s + JSON seguro). **Todos** los handlers de datos hacen `const token = await getToken(); if (!token) throw new Error('not_logged_in')` **salvo**: `GET_USER`/`HAS_TOKEN`/`GET_LANG` (devuelven estado) y `DAILY_IDEAS` (devuelve `{ideas: null}` sin token).
- `manifest.json` v2.6.2: permisos = solo `storage`. host_permissions = youtube.com, studio.youtube.com, ytubviral.com.

### Web (`youtube-gpt/`, Next.js 16 en Vercel)
- Rutas de extensión en `app/api/extension/*`, autentican con `getExtensionUser(request)` de `lib/extension-auth.ts` (Bearer token propio, tabla `extensionToken`). Devuelve `null` si no hay token válido; también registra señal de retención (`extensionEvent`, throttle 10 min).
- **`app/api/extension/video-batch/route.ts`** (badges VPH de miniaturas): usa **solo** la YouTube Data API pública (`YOUTUBE_API_KEY`). Único dato de usuario: el gate `not_logged_in`. Devuelve `{videos:[{videoId,views,vph,ageDays}]}`, cap 50 ids.
- **`app/api/extension/video-scorecard/route.ts`** (scorecard de /watch y /shorts): YouTube API pública + tabla `videoVelocitySnapshot` (VPH reciente, **no** es dato de usuario) + cálculo de outlier vía stats del canal. Único dato de usuario: gate `not_logged_in` y flag `isPro` en la respuesta (el content script lo usa solo para pintar/ocultar botones Pro client-side). SEO checks son heurísticos, sin Claude.
- `lib/rate-limit-db.ts` ya expone `rateLimitRequest(request, prefix, limit, windowMinutes)` — atómico, cross-instance (tabla `rate_limits`), **fail-open**. Lee IP de `x-forwarded-for`.
- Rutas que **sí** dependen de datos de usuario o cuestan Claude (NO abrir): `seo-live`, `comments`, `channel-stats`, `best-time`, `ab-test`, `daily-ideas`, y las de `keywords`/`competitor`/`generate` (en `app/api/...`).

---

## P1 — Lanzador fijo + panel unificado

### Concepto

Un **shell persistente**, montado una sola vez en `document.body` (`position: fixed`, borde derecho), presente en **toda** página de `youtube.com` y `studio.youtube.com`. Dos estados:
- **Colapsado**: pestaña/botón "YTV" fijo (~40 px de ancho, vertical), siempre visible.
- **Abierto**: panel de ~340 px con una **barra de pestañas** arriba y el contenido debajo.

Recuerda en `chrome.storage.local`: abierto/cerrado (`ytv_shell_open`) y última pestaña activa (`ytv_shell_tab`). No tapa YouTube: se superpone al borde derecho con sombra; en Studio se ancla igual (no dentro del nav-panel).

### Pestañas

| Pestaña | Contenido | Depende de la página |
|---|---|---|
| **Esta página** (título dinámico) | `/watch` y `/shorts` → scorecard · `/results` → panel de keyword · canal → auditoría de canal · `/` y `/feed/*` → "nada que analizar aquí, mira Ideas" · Studio editor/upload → SEO Live · Studio lista → resumen | Sí |
| **Tu Canal** | Widget `channel-stats` (subs, vistas 7d/30d, sparkline, progreso de monetización + ETA). Igual en todas las páginas | No |
| **Ideas** | Las 5 Daily Ideas del día. Igual en todas las páginas (**ya no solo en la home**) | No |
| **Coach** | Placeholder ("Próximamente") hasta P5 | No |

Pestaña activa por defecto: la recordada; si no, "Esta página" cuando tiene contenido, si no "Tu Canal".

### Arquitectura de código

**Nuevo (`content.js`, sección `panel-shell`):**
- `mountShell()` — idempotente, crea el DOM del shell una vez (launcher + barra de pestañas + `#ytv-shell-body` vacío). Cablea colapsar/expandir y clic de pestañas.
- `openShell(tabId?)`, `closeShell()`, `setShellTab(tabId)`, `renderShellTab(tabId, html, wireFn?)`.
- `refreshShell()` — llamado desde `onPageChange()`: decide el título y el contenido de "Esta página" según `getPageType()`/hostname y lo rellena; refresca "Tu Canal" e "Ideas" si están abiertas.

**Reconversión de injectores:** cada `injectXPanel()` deja de crear su propio panel con cabecera y pasa a ser un **renderizador de contenido de pestaña** `renderPageTab_X()` que devuelve `{ html, wire }`. Su lógica de fetch (mensajes a `background.js`) **no cambia**. Ejemplos:
- `injectVideoPanel` / `injectShortsPanel` → `renderPageTab_Scorecard()`
- `injectSearchPanel` → `renderPageTab_Keyword()`
- `injectChannelPanel` → `renderPageTab_Channel()`
- `injectStudioEditor` / `injectStudioUploadPanel` → `renderPageTab_StudioSeo()`
- `injectChannelStats` → `renderTab_YourChannel()` (pestaña fija)
- `injectDailyIdeasPanel` → `renderTab_Ideas()` (pestaña fija)

**Se quedan fuera del shell (siguen como overlays sobre YouTube):**
- `injectVelocityBadges` — badges VPH sobre miniaturas.
- El teaser de "inicia sesión" — se mueve al **pie del shell** (discreto, persistente), sustituye al `injectLoggedOutPanel` flotante.

**Se elimina:** todas las cabeceras `.ytv-header` sueltas, el panel de ideas flotante independiente, el widget "Tu Canal" como panel aparte, `injectStudioVideoList` mantiene solo los badges por fila (eso no es un panel).

**`onPageChange()` nuevo:** `mountShell()` (idempotente) → `refreshShell()`. Ya no inserta N paneles. `expectedPanelId()` se simplifica: el panel esperado es siempre `#ytv-shell`.

**Migración de comportamientos:**
- `YTV_RECHECK_IDEAS` (botón "Mostrar ideas de hoy" del popup) → `openShell('ideas')`.
- `maybeShowReviewPrompt` → se ancla al pie de `#ytv-shell-body`.
- Estado colapsado/descartado de Ideas → se conserva por pestaña.

**CSS (`content.css`):** un único sistema visual para el shell — colapsable, `prefers-color-scheme`, no tapar el contenido de YouTube. Retirar los estilos de las cabeceras sueltas y paneles independientes.

### Criterios de aceptación P1
- En cualquier página de YouTube/Studio hay un launcher "YTV" fijo y consistente.
- Abrirlo muestra pestañas; "Esta página" corresponde a la página actual.
- Navegación SPA entre páginas actualiza "Esta página" sin recargar y **sin duplicar** paneles.
- Abierto/cerrado y pestaña activa se recuerdan entre páginas y sesiones.
- No queda ningún panel con cabecera propia fuera del shell (salvo badges de miniatura).
- `node --check content.js` limpio, cero permisos nuevos, `pack.js` regenera el zip.

---

## P2 — Valor en el segundo 1, sin login

### Backend (desplegable solo, sin release de extensión)

**`video-batch/route.ts` y `video-scorecard/route.ts`** — cambiar el gate:

```
const extUser = await getExtensionUser(request);   // puede ser null
if (!extUser) {
  const ok = await rateLimitRequest(request, 'ext-pub-scorecard', 60, 10); // 60 / 10 min / IP
  if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
}
// ... resto igual ...
// en la respuesta:  isPro: extUser?.isPro ?? false
```

- `video-batch` (badges, se piden en lotes al hacer scroll): límite más alto, `('ext-pub-batch', 300, 10)`, o subir el TTL de `vphCache` client-side.
- Con token válido → sin rate limit (o uno laxo).
- **No tocar** ninguna otra ruta de extensión.
- Verificado 30/08: ninguna de las dos rutas devuelve datos del usuario; `videoVelocitySnapshot` es por `videoId`, no por usuario. `rateLimitRequest` ya falla-open.

### Extensión

**`background.js`:** los handlers `SCORECARD` y `VIDEO_BATCH` dejan de hacer `if (!token) throw 'not_logged_in'`. Mandan `Authorization: Bearer` **solo si hay token**; si no, sin header. Mapear `429` → `throw new Error('rate_limited')`.

**`content.js`:**
- `onPageChange()`: sin user ya **no** hace `return` temprano. Monta el shell igual.
- Pestaña "Esta página" en `/watch` y `/shorts` sin login → **scorecard real** (vía `SCORECARD` público): SEO score, checks, Quick Wins, VPH, VPH reciente ⚡, outlier ×N, percentil, tags. (Hoy sin login solo se ve el score heurístico del título.)
- `injectVelocityBadges` corre para todos (home, search, channel, sidebar de vídeo).
- Las partes del scorecard que necesitan login (comentarios, analizar canal, generar títulos, mejor hora, pestañas "Tu Canal" e "Ideas") → **CTA inline** "Inicia sesión para {X}" con enlace a `ytubviral.com/signup?utm_source=extension&utm_medium=…`, en vez de desaparecer o dar error.
- `renderError('rate_limited')` → "Demasiadas consultas, espera un momento" / "Too many requests, hold on".
- El teaser de signup vive en el pie del shell (P1).

### Criterios de aceptación P2
- Extensión recién instalada, sin cuenta: al abrir YouTube se ven badges VPH en miniaturas; en un vídeo el shell abre con SEO score + checks + Quick Wins + VPH + outlier + tags **reales**.
- Las funciones con login muestran CTA claro, nunca error ni vacío.
- Con cuenta: todo lo de hoy + sigue igual.
- `curl` sin token a `/api/extension/video-scorecard` con un `videoId` válido devuelve datos; en bucle → `429`.
- Ninguna ruta con datos de usuario o coste Claude se ha abierto (revisar el diff de rutas).

---

## Orden de trabajo

**Decisión de Javier (30/08):** P1 + P2 salen en **una sola versión (v2.7)**. Nada de releases incrementales de la extensión — cada envío a la CWS es una revisión de varios días y no queremos encadenar dos. El backend puede desplegarse a Vercel cuando esté listo (no es una "publicación" y la v2.6.2 en producción sigue funcionando igual porque manda token), pero **la extensión se sube a la CWS una única vez, con todo dentro**.

1. **Backend P2** (2 rutas + rate limit). `tsc --noEmit`, verificar 200 con y sin token, 429 en bucle. Deploy a Vercel — inofensivo para la v2.6.2 viva.
2. **P1 shell + migración de injectores** (el grueso). `node --check` frecuente, probar cada superficie.
3. **P2 extensión** (quitar gates en `background.js`, CTAs inline en `content.js`) — encima del shell nuevo.
4. Verificación integral local: `tsc --noEmit`, `node --check` en los `.js`, `pack.js` → zip v2.7.
5. Javier prueba sin empaquetar en Chrome real: todas las superficies, con y sin login.
6. Actualizar listing CWS si cambia algo visible. **Subir v2.7 una vez.** En el envío, describir el cambio de UI y que dos endpoints ahora sirven datos públicos de YouTube sin login (por si alarga la revisión).

## Riesgos
- El refactor del shell toca casi todo `content.js` — disciplina de `node --check` y prueba superficie por superficie.
- Abrir endpoints: última revisión del diff de `video-scorecard` antes de mergear (que no se haya colado un campo de usuario). El rate-limit es fail-open por diseño (ya lo era).
- Revisión CWS más larga por cambio de UI grande + endpoints sin auth. No bloquea, solo tarda.

---

## Backlog posterior (teardown, artefacto acb3a1b4)
- **P3** Barra de stats al hover sobre cualquier miniatura (reutiliza el endpoint público de P2).
- **P4** Página de canal = auditoría real (top vídeos, patrones de títulos/tags, cadencia, "ingeniería inversa con Claude"). Ampliar el endpoint de competidores.
- **P5** AI Coach — chat en el panel (pestaña "Coach"). Ruta de chat con streaming. Claude = diferenciador vs su GPT genérico.
- **P6** Popup como centro de mando + bucle diario (badge en el icono de Chrome). Reescribir `popup.js` + endpoint "resumen diario".
- **P7** Paridad Studio (SERP preview, deep-link al thumbnail generator) + reorganizar la vista expandida del scorecard en sub-secciones + A/B testing visible como bandera.
- **P8** Trending videos en búsqueda + explorador de outliers de canal/nicho.

**Qué NO copiar de vidIQ:** saturación de paneles, pop-ups de upsell, bloquear acciones de YouTube, peso/lentitud, IA genérica.
