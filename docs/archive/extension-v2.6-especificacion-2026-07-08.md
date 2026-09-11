# Extensión Chrome v2.6.0 — Especificación (Tier 2: conversión Pro)

Spec 3/3 de la ventana Fable 5 (2026-07-08). Origen: Tier 2 de `docs/extension-feature-opportunities-2026-07-03.md` (en el directorio padre `C:/Users/jimen/youtube-gpt/docs/`). Alcance: **2 features** — botón "Crear A/B test" en Studio + panel "Qué grabar hoy" en la homepage de YouTube.

**Precondiciones para empezar a implementar** (del doc de oportunidades, siguen vigentes):
1. v2.5.0 aprobada por Google y estable unos días (sin reportes de rotura).
2. Alguna señal de instalaciones — v2.6 está orientada a convertir usuarios a Pro; sin usuarios no convierte nada.

**Restricciones heredadas (no negociables):** cero permisos nuevos en el manifest (cada permiso = fricción de revisión CWS y de instalación), reutilizar backend existente, coste Claude solo tras Pro.

## Hechos del código verificados (08/07) que condicionan el diseño

- Las rutas de extensión viven en `app/api/extension/*` y autentican con `getExtensionUser` de `lib/extension-auth` (token propio), NO con sesión NextAuth.
- `app/api/youtube/ab-test/route.ts` (POST crea el test) autentica por **sesión** → la extensión no puede llamarlo. Payload actual: `{videoId, variantA, variantB, hoursPerVariant=48}`; valida Pro (`pro_required` 403), YouTube conectado (`youtube_not_connected` 400), test activo duplicado por vídeo (`active_test_exists` 400) y límite `abTestsSimultaneous` del plan.
- `app/api/daily-ideas/route.ts` (GET) también autentica por sesión; lee tabla `DailyIdea` por `(userId, date)` y devuelve `{ideas, date}` o `{ideas: null}`.
- `background.js` tiene 17 handlers de mensajes con el helper `apiFetch()` (timeout 15s + JSON seguro, v2.5.0) — los handlers nuevos deben usarlo.
- `content.js` ya tiene `wireGenTitlesButton` (extraído en v2.5.0, compartido entre editor de Studio y diálogo de subida) y el objeto `SELECTORS` centralizado.

---

## Feature 1 — Botón "Crear A/B test" en Studio

**Por qué:** el A/B testing real (rotación automática de títulos + métricas) es de lo poco que NI vidIQ ofrece, y es Pro → empuja la conversión exactamente en el momento en que el usuario ve el valor (acaba de generar títulos alternativos y le gustan dos).

### Backend (primero — desplegable sin release de extensión)

Nueva ruta `app/api/extension/ab-test/route.ts`:
- `POST` con `getExtensionUser` + mismo cuerpo y misma lógica que el POST de `/api/youtube/ab-test`. **Extraer la lógica de creación a una función compartida** (p. ej. `lib/ab-test.ts` → `createAbTest(userId, {videoId, variantA, variantB, hoursPerVariant})`) y que ambas rutas la llamen — NO copiar/pegar las ~60 líneas (dos copias de lógica que escribe títulos en YouTube divergirían mal).
- Mismos códigos de error (`pro_required`, `youtube_not_connected`, `active_test_exists`, límite) — el content script mapea cada uno a un mensaje bilingüe distinto (ver UX).
- `GET` opcional: contar tests activos del usuario (para mostrar "2/3 tests activos" en el panel). Barato de añadir a la vez.

### Extensión

- `background.js`: handler nuevo `AB_CREATE` → `apiFetch('/api/extension/ab-test', {method:'POST', body})`.
- `content.js`: en los resultados de `wireGenTitlesButton`, junto al botón "Usar" de cada título sugerido, botón compacto **"A/B"**. Al pulsar: `variantA` = título actual del campo de Studio (leerlo en ese momento, no cachearlo — el usuario puede haberlo editado), `variantB` = el sugerido, `videoId` = el del editor.
- **Solo en el editor de vídeos ya publicados, NO en el diálogo de subida:** un A/B test necesita un vídeo publicado acumulando métricas; en el upload dialog el vídeo aún no existe públicamente. `wireGenTitlesButton` recibe (o infiere) el contexto editor/upload y solo pinta el botón en editor. Si el vídeo del editor está en privado/oculto, el error del backend se muestra tal cual (no hace falta detectar visibilidad client-side).
- **Respuestas en UI** (todas bilingües, patrón `t(es,en)` existente):
  - Éxito → confirmación inline + link "Ver test" a `https://ytubviral.com/ab-test`.
  - `pro_required` → **el momento de conversión de toda la release**: mini-card con valor concreto ("La rotación automática A/B es Pro — ni vidIQ la tiene") + botón a `/pricing`. No un error genérico.
  - `active_test_exists` → "Este vídeo ya tiene un test activo" + link a /ab-test.
  - Límite alcanzado → mensaje con el límite del plan + link a /ab-test para cerrar alguno.

### Criterios de aceptación

- En el editor de Studio de un vídeo publicado, generar títulos → cada sugerencia lleva botón "A/B"; pulsarlo con cuenta Pro+OAuth crea el test (visible en `/ab-test` de la web) sin salir de Studio.
- El botón NO aparece en el diálogo de subida.
- Cuenta Free → card de upsell con link a pricing (no error crudo).
- Segundo intento sobre el mismo vídeo → mensaje de test activo con link.
- La ruta web `/api/youtube/ab-test` sigue funcionando idéntica (regresión cero tras extraer la lógica compartida).

---

## Feature 2 — Panel "Qué grabar hoy" en la homepage de YouTube

**Por qué:** las Daily Ideas (5 ideas personalizadas/día) ya se generan en servidor — coste marginal cero. La homepage de YouTube es exactamente donde el creador procrastina sin saber qué grabar (el dolor fundacional del proyecto). Visita diaria = hábito = retención.

### Backend

Nueva ruta `app/api/extension/daily-ideas/route.ts`: `GET` con `getExtensionUser`, misma lectura que `/api/daily-ideas` (tabla `DailyIdea` por userId+fecha UTC). Devuelve `{ideas, date}` o `{ideas: null}`. Sin lógica nueva — si crece, extraer a helper compartido como en F1.

### Extensión

- `getPageType()` en content.js: caso nuevo `home` (pathname `/` en youtube.com; excluir `/feed/*` salvo que se quiera incluir Suscripciones — v1 solo `/`).
- `background.js`: handler `DAILY_IDEAS` con **caché por fecha en `chrome.storage.local`** (`ytv_ideas_{YYYY-MM-DD}`): la homepage se visita muchas veces al día y las ideas no cambian — 1 fetch/día máximo. Limpiar claves de días anteriores al escribir la nueva.
- **Panel:** colapsable y discreto (esquina, estilo del scorecard fijo de v2.5.0), cabecera "💡 Qué grabar hoy / What to film today" + las 5 ideas (título + 1 línea). Cada idea con acción "Desarrollar" → link a `https://ytubviral.com/generate?topic=...` (la web ya recibe prellenado por query param según el spec de Fase 8 — si aún no existe ese param al implementar, link simple a /generate).
- **Reglas de aparición (anti-ruido, en este orden):**
  1. Sin login en la extensión → NO mostrar nada en homepage (el logged-out ya tiene su superficie en /watch; la homepage no debe mendigar).
  2. Login pero `ideas: null` (Free o sin canal conectado) → por defecto nada. **Opcional de conversión:** 1 línea compacta, máx. 1 vez/semana (`ytv_ideas_upsell_last` en storage), dismissible: "Los usuarios Pro ven aquí 5 ideas para su canal cada mañana" + link. Implementar detrás de un flag simple para poder apagarlo si molesta.
  3. Con ideas → panel colapsado o expandido según última preferencia del usuario (`ytv_ideas_collapsed`), y dismissible por día (`ytv_ideas_dismissed_{date}`).
- Cero llamadas Claude desde la extensión: solo lectura de lo ya generado.

### Criterios de aceptación

- Usuario Pro con canal conectado e ideas del día generadas → panel en homepage con 5 ideas; recargar la página no dispara fetch nuevo (verificable en Network/logs: 1 al día).
- Cerrar el panel → no reaparece hasta el día siguiente; colapsar → persiste colapsado.
- Sin login → homepage intacta, cero elementos inyectados.
- `ideas: null` → nada (o la línea semanal si el flag opcional está activo, nunca más de 1 vez/semana).

---

## Empaquetado, listing y riesgos

- **Una sola release** con las 2 features + el remanente de deuda consciente de v2.5.0 si cabe sin riesgo: desconectar `uploadDialogObserver` (B3) y humanizar errores del popup (C4) — ambos triviales y reducen superficie de rechazo. `runSeoScore` (código muerto): borrar.
- **Listing CWS:** añadir a la descripción ES/EN las dos capacidades nuevas ("A/B testing desde YouTube Studio", "ideas diarias personalizadas en tu homepage") — keywords de búsqueda reales en CWS: "ab test youtube title", "youtube video ideas". Actualizar 1-2 screenshots (el panel de ideas es muy fotogénico para el listing).
- **Sin permisos nuevos:** ambas features operan en hosts ya declarados (youtube.com, studio.youtube.com) con mensajes al background existente. Verificar antes de empaquetar que el manifest no cambió salvo `version`.
- **Riesgos:** (1) selectores del editor de Studio — el botón A/B se cuelga de UI propia (los resultados de generación), no del DOM de YouTube, así que el riesgo real es solo leer el campo de título actual → usar `SELECTORS.studio` centralizado; (2) re-review de CWS en cada release — agrupar todo en una (regla ya establecida); (3) el panel de homepage es lo más visible que ha hecho nunca la extensión → probar en ventana estrecha y con el guide de YouTube expandido/colapsado antes de subir.
- **Fuera de alcance (sin cambios):** Tier 3 (ingeniería inversa de outliers) sigue condicionado a usuarios activos y ahora está especificado como F8.1 web en `docs/fase8-especificacion-2026-07-08.md` — la versión extensión, si llega, será un botón que llame al mismo backend de F8.1, no lógica propia. Las rechazadas del doc de oportunidades siguen rechazadas.

## Orden de implementación

1. Backend F1 + F2 (2 rutas + extracción `lib/ab-test.ts`) — desplegable a producción sin tocar la extensión, sin riesgo (rutas nuevas sin tráfico).
2. Extensión F2 (panel ideas) — la más simple, valida el patrón de homepage.
3. Extensión F1 (botón A/B) — la de más valor y más edge cases.
4. Limpieza (B3, C4, código muerto) + listing + zip (`node pack.js`) → prueba manual completa en local (checklist de aceptación de arriba) → subir a CWS.
