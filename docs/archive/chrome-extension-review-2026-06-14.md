# C2 — Review de la extensión Chrome (2026-06-14)

Revisión completa (performance, bugs, UX) + comparación con vidIQ + los 5 quick wins más
impactantes. Extensión: `chrome-extension/` v2.1.0, Manifest V3.

---

## Veredicto

La extensión está **bien construida técnicamente y es rica en features** (SEO scorecard en vídeo,
SEO en vivo en Studio, análisis de competidores, keywords en búsqueda, badges de velocidad,
stats de canal, comentarios) — arguablemente MÁS que el free de vidIQ. PERO tiene **un fallo de
adopción que la mata**: está 100% gateada tras login, así que un usuario que la instala **no ve
NADA** hasta crear cuenta + iniciar sesión. vidIQ da valor instantáneo sin login. Ese es el gap.

## Lo que está BIEN

- MV3, permisos mínimos (`storage` solo — ni tabs ni scripting amplios). Limpio para la review de CWS.
- SPA de YouTube bien manejado: `yt-navigate-finish` + `popstate` + polling de URL con debounce.
- Badges de velocidad bien diseñados: `IntersectionObserver` (rootMargin 200px) + batch 500ms +
  `vphCache`. Patrón competitivo, no machaca la página.
- `background.js` limpio: auth por bearer token, `GET_USER` con cache + refresh en background
  (respuesta instantánea), Pro-gating consistente (403 `pro_required` → upsell).
- i18n completo (ES/EN) en todo el content script.

## BUGS / problemas

### 1. CRÍTICO (adopción) — la extensión es INVISIBLE sin login
`content.js` `onPageChange()`: `const user = await sendMsg({type:'GET_USER'}); if (!user) return;`
→ si no hay sesión, NO se inyecta absolutamente nada. Un install nuevo = pantalla vacía hasta que
el usuario (a) se entera de que tiene que crear cuenta, (b) la crea en ytubviral.com, (c) vuelve,
(d) abre el popup, (e) mete email+password. Funnel brutal. vidIQ enseña valor en el segundo 1.

### 2. CRÍTICO (acceso) — usuarios de Google OAuth NO pueden entrar
El popup solo hace login con **email+password** (`LOGIN` → `/api/extension/login`). Pero
`User.password` es nullable: quien se registró con Google no tiene password → **no puede iniciar
sesión en la extensión**. `detect.js` solo marca `data-ytv-ext=1` (no hay handoff de token web).
Una porción de usuarios queda fuera por completo.

### 3. PERF — fuga de IntersectionObserver en cada navegación
`injectVelocityBadges()` crea un `IntersectionObserver` nuevo en cada navegación SPA pero solo
desconecta `badgeObserver`, nunca el `io` anterior. Los observers se acumulan a lo largo de la
sesión de navegación → coste creciente. (El `badgeObserver` sí se limpia; el `io` no.)

### 4. FIABILIDAD — expiración de token a medias
Si el token caduca, las features fallan con `not_logged_in` (algunos sitios muestran "Inicia
sesión", otros un error genérico) pero el token NO se limpia y el popup sigue mostrando el usuario
cacheado → el usuario cree que la extensión está "rota". Falta: detectar 401 → limpiar token →
prompt de re-login claro.

### 5. UX/POSICIONAMIENTO — el popup no lidera con el gancho
El intro del login dice "activa el análisis de canales y keywords" — infravende la feature hero
(SEO Score, que es el gancho de toda la estrategia/PH). No hay onboarding en la página (un install
sin sesión no recibe ninguna pista de qué hacer).

---

## Comparación con vidIQ

| | vidIQ | YTubViral ext |
|---|---|---|
| Valor sin login | ✅ VPH, views, tags al instante | ❌ nada hasta login |
| Login | cuenta vidIQ / Google | ❌ solo email+password (OAuth fuera) |
| Overlays nativos en YouTube | ✅ | ✅ (panel + badges) |
| SEO score por vídeo | parcial | ✅ (mejor) |
| SEO en vivo en Studio | ❌ | ✅ (ventaja propia) |
| Calidad del análisis | GPT genérico | Claude (ventaja) |
| Fricción de primer uso | baja | **alta (login obligatorio)** |

Resumen: en FEATURES YTubViral compite o gana; en FRICCIÓN DE ADOPCIÓN pierde de calle. El moat de
vidIQ no son las features, es que enganchas en el segundo 1 sin registrarte.

---

## Los 5 quick wins más impactantes (ordenados)

### 1. Mostrar valor SIN login + CTA inline (el lever de adopción #1)
Cambiar el `if (!user) return`. Para usuario sin sesión, inyectar un panel mínimo con:
(a) algo útil calculable client-side desde el DOM público — checklist SEO básico (largo de título,
largo de descripción, ¿hay tags?, ¿hay capítulos?) y/o una velocidad aproximada (views ÷ antigüedad);
(b) CTA claro "Inicia sesión / regístrate gratis para el SEO Score completo". Convierte installs →
signups (y alimenta el funnel/waitlist). Aunque sea UNA métrica + CTA, bate a la invisibilidad.

### 2. Arreglar el bloqueo de Google OAuth (login web por token)
Usar `detect.js` (ya inyectado en ytubviral.com) para un handoff de token: botón "Conectar" que
abre ytubviral.com (donde el usuario YA está logueado, OAuth incluido), la web expone un token de
extensión y `detect.js` lo pasa a `chrome.storage`. Elimina la barrera password y desbloquea a los
usuarios de Google. (Mantener email+password como alternativa.)

### 3. Arreglar la fuga de IntersectionObserver (perf)
Guardar el `io` en scope de módulo y `io.disconnect()` al inicio de `injectVelocityBadges()`, igual
que ya se hace con `badgeObserver`. Una línea, elimina la acumulación de observers por sesión.

### 4. Manejo limpio de expiración de token
En `background.js`, ante un 401 limpiar `ytv_token`/`ytv_user` y devolver una señal de re-login;
en el content, mostrar un prompt único y claro de "tu sesión caducó, vuelve a entrar" en vez de
errores dispersos. Evita la percepción de "extensión rota".

### 5. Popup + onboarding que lideran con SEO Score
Reescribir el intro del popup para liderar con la feature hero ("Puntuación SEO instantánea en
cualquier vídeo") en vez de "canales y keywords". Añadir una pista de primer uso en YouTube
("👋 YTubViral activo — abre cualquier vídeo"). Alinea la extensión con el posicionamiento
SEO-Score-first (mismo gancho que la landing y PH).

---

## Notas
- #1 y #2 son los grandes (adopción + acceso). #3 es el único bug de perf real. #4 fiabilidad,
  #5 conversión/claridad.
- Ninguno requiere permisos nuevos en el manifest (importante para no resetear la revisión de CWS).
- Implementarlos NO está en C2 (solo identificar). Si Javier prioriza, #1 y #2 son los que mueven
  la aguja de instalaciones→usuarios.
