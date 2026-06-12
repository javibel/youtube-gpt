# Auditoría UX del Dashboard — Top 10 problemas (Tarea E1, 2026-06-12)

Método: auditoría de código (dashboard, generate, DashboardShell, Sidebar, páginas de herramientas)
+ verificación visual en preview local (viewport 375px y 1440px) sobre `/learn` (única página
pública que usa el DashboardShell completo). Las claims de severidad ALTA se verificaron en
código/navegador antes de incluirse; dos hallazgos de los agentes de exploración se DESCARTARON
por falsos (ver final).

## Top 10 (ordenados por gravedad)

### 1. ALTA — `alert()` nativo para errores de pago y cancelación
`app/dashboard/page.tsx:239-243,286` + `components/LimitReachedModal.tsx:25-29`. Siete `alert()`
bloqueantes en los flujos más sensibles (upgrade fallido, cancelación). En móvil es una caja del
sistema sin estilo; incumple WCAG y transmite poca confianza justo cuando el usuario va a pagar.
**Fix**: sistema de toasts global (componente único, auto-dismiss 4s) y sustituir los 7 usos.

### 2. ALTA — El paywall del AI Coach se descubre DESPUÉS de escribir
`app/coach/page.tsx:114`. La API está bien protegida server-side (403 si no es Pro), pero la UI
deja al usuario free entrar, escribir su pregunta y solo entonces recibe "Necesitas el plan Pro".
Esfuerzo invertido → frustración → percepción de engaño. **Fix**: pantalla de upgrade al entrar
(`if (!isPro)` → hero con beneficios del Coach + CTA a /pricing), patrón reutilizable para
cualquier herramienta Pro.

### 3. ALTA — Generación sin timeout ni retry
`app/generate/page.tsx:176-179`. Si la llamada a Claude se cuelga, el spinner gira para siempre;
no hay timeout, ni mensaje de progreso, ni botón de reintentar. Es el flujo core del producto.
**Fix**: `AbortController` a 45s + mensaje "está tardando más de lo normal" a los 15s + retry.

### 4. ALTA — Tap targets por debajo del mínimo táctil en móvil
Verificado en vivo: items del sidebar a 36px de alto (mínimo WCAG/plataformas: 44px). Iconos de
descargar/borrar en el historial de 13×13px (`app/dashboard/page.tsx:787-810`) — imposibles de
tocar con el pulgar. El target del producto consulta desde el móvil. **Fix**: media query móvil
`.yv-sidebar__item { height: 44px }` + iconos del historial a ≥20px con padding táctil de 44px.

### 5. MEDIA — Navegación sin semántica ni teclado en el drawer móvil
Verificado en vivo: 0 `aria-current` en toda la app, el sidebar no es un landmark `<nav>`,
Escape NO cierra el drawer móvil y no hay focus trap (el foco escapa al contenido de detrás).
Sin skip-link. **Fix**: envolver items en `<nav>`, `aria-current="page"` en el activo, listener
de Escape + focus trap en el drawer, skip-to-content en el shell.

### 6. MEDIA — El item activo del sidebar apenas se distingue (y se duplica)
`app/globals.css:651-656`: el activo usa el mismo fondo que el hover (diferencia: borde inset de
1px imperceptible). Además `isActive()` usa `startsWith` (`components/Sidebar.tsx:130-133`), así
que en `/generate/bulk` se marcan activos `/generate` Y `/generate/bulk` a la vez. **Fix**: borde
izquierdo 2px de marca + fondo `--yv-brand-soft` para el activo; `isActive` estricto
(`pathname === href || pathname.startsWith(href + '/')`).

### 7. MEDIA — 7 campos de formulario sin label asociado
`app/generate/page.tsx:296-302` (textarea de tema) y `:350-392` (6 inputs/selects): solo
placeholder o texto suelto sin `htmlFor`. Rompe lectores de pantalla, control por voz y el
comportamiento de click-en-label. También sin focus ring visible (`.soft-field`). **Fix**:
`<label htmlFor>` visible en cada campo + `focus:ring-2` en la clase `.soft-field`.

### 8. MEDIA — Filtros del historial desbordan en pantallas <375px
`app/dashboard/page.tsx:882-889`: 6 botones de filtro en `flex gap-2` sin wrap ni scroll — en
móviles estrechos quedan cortados sin indicación. **Fix**: `overflow-x-auto` con
`scrollbar-none` y fade en el borde, o `flex-wrap`.

### 9. MEDIA — Errores de red silenciosos en todo el dashboard
8+ `catch(() => {})` vacíos en dashboard/generate (daily-tip, stats, onboarding, track...). Si la
red falla, secciones enteras desaparecen sin explicación y el usuario cree que no tiene datos.
**Fix**: helper `fetchJson()` central con toast de error genérico + estados de error por sección
("No se pudo cargar — reintentar").

### 10. MEDIA — Layout shift al cargar datos
`app/globals.css:440-446`: `yv-page-header` sin altura reservada y varias páginas (analytics,
coach, revenue) sin skeleton — el contenido salta cuando llegan los datos. **Fix**: skeletons
consistentes (ya existen en algunas páginas — extraer a componente compartido) + `min-height` en
header.

## Hallazgos descartados tras verificación (no incluir en fixes)

- ~~"`overflow: hidden` en `<main>` bloquea el scroll en móvil"~~ — FALSO: verificado en vivo,
  el scroll vertical va por el body (scrollY 3109 en /learn móvil); el overflow-hidden solo
  recorta desbordes horizontales, que es intencional con `min-w-0`.
- ~~"El Coach es accesible sin validación para usuarios free"~~ — PARCIALMENTE FALSO: la API
  valida server-side (403). Es un problema de UX (problema #2), no de seguridad.

## Extras de menor prioridad (backlog, fuera del top 10)

- Estrellas de rating sin aria-label (dashboard:1028-1032)
- `truncate` + `break-all` en conflicto (dashboard:924)
- Contador 0/400 del textarea de feedback solo aparece al escribir (dashboard:1035)
- Scrollbar invisible en `<pre>` de output (generate:609)
- Contraste de items inactivos del sidebar ~2.8:1 (#8b8b8b sobre #0a0a0a) — por debajo de AA para texto pequeño
- Botón disabled sin `cursor-not-allowed` (generate:475)
- Sidebar plano de 14+ items sin agrupación por categoría ni indicación Pro inline en las páginas
- Dos "Learn" duplicados: `/learn` (dashboard) y `/features/learning-hub/*` (público) sin canonical entre ellos
