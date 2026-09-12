# YTubViral — Sistema de agentes local

Working directory: `C:/Users/jimen/youtube-gpt/local-agent`

---

## Arquitectura general

El agente corre en PM2 (`ytubviral-agent`), proceso Node.js único con todos los crons registrados en `index.js`.
Base de datos: PostgreSQL en Neon (acceso via `db.js`).
Browsers: Puppeteer con stealth plugin, gestión de cola en `browser-queue.js`.
Emails: Resend via `resend.js`. Gmail API via `gmail.js`.

---

## Prioridad 1 — Salud de la web

### Sentinel (`sentinel.js`)
**Qué hace:** Verifica cada 5 minutos que los endpoints clave de ytubviral.com responden correctamente.
**Acciones automáticas:** Email de alerta si un endpoint cae o responde >5s. Auto-heal si detecta patrón conocido.
**Output:** `memory/sentinel.json` con tendencias de respuesta.
**Si falla:** El agente está caído o hay problema de red — revisar `pm2 list` primero.

### Feature Monitor (`feature-monitor.js`)
**Qué hace:** Tests funcionales end-to-end 2 veces al día — login, registro, generación, Stripe, API.
**Acciones automáticas:** Email de alerta si un feature falla (ej: 401 en endpoints autenticados).
**Output:** `reports/feature-monitor-{fecha}.json`
**Nota:** Los 401 en endpoints autenticados son normales — el monitor no tiene sesión activa.

### Smoke Browser (`smoke-browser.js`)
**Qué hace:** Abre la web en un navegador real (Puppeteer) y comprueba que carga y responde
como un visitante, no solo que el endpoint devuelve 200.
**Frecuencia:** 07:20 y 19:20, justo después del Feature Monitor.

### Stripe Reconcile (`stripe-reconcile.js`)
**Qué hace:** Contrasta las suscripciones de la BD con las de Stripe y reporta divergencias.
**Frecuencia:** Domingos 02:35.

### Guardian (`guardian.js`)
**Qué hace:** Auditoría de seguridad del código — dependencias, endpoints expuestos, secretos en logs.
**Acciones automáticas:** Email con hallazgos, ningún cambio de código automático.
**Output:** `reports/guardian-{fecha}.json`
**Frecuencia:** Diario 02:15.

### DMARC Monitor (`dmarc-monitor.js`)
**Qué hace:** Lee reportes de autenticación de email (SPF/DKIM/DMARC) de Gmail.
**Acciones automáticas:** Alerta solo si detecta spoofing real (no reportes rutinarios).
**Output:** Log en consola + email si hay incidente.

### Auto-Resolver (`auto-resolver.js`)
**Qué hace:** Lee el reporte del Manager y aplica fixes programáticos sin Claude: restart PM2, limpiar locks, cerrar issues.
**Output:** `reports/pending-for-claude-{fecha}.json` con los issues que necesitan código.
**Frecuencia:** Diario 09:17.

### Watchdog (`watchdog.js`)
**Qué hace:** Audita cumplimiento legal — páginas /legal, /privacy, /terms. Busca contenido requerido por LSSI.
**Acciones automáticas:** Abre issue en memoria si falta contenido. Alerta si persiste 7+ días.
**Output:** `memory/watchdog.json`
**Frecuencia:** Lunes 02:45.

---

## Prioridad 2 — Marketing

> **Estado de redes sociales (desde 2026-07-08):** las 4 personas (Alex, Ferran, Ana,
> Mayra) están DESCONECTADAS en todas las plataformas. Reddit y Twitter/X están abandonados
> de forma permanente (cuentas baneadas y quemada, respectivamente). Lo único vivo es la
> cuenta de marca: Bluesky, que Javier opera **a mano** con el plan que le manda el Brand
> Bluesky Coach, más FB/Instagram de marca vía API (gestionados desde Vercel, no desde aquí).

### Brand Bluesky Coach (`brand-bluesky-coach.js`) — ÚNICO agente social activo
**Qué hace:** Cada mañana genera el plan de Bluesky de la cuenta de marca y se lo manda por
email a Javier: posts propios + respuestas a creadores que piden ayuda. No publica nada por
su cuenta — Javier copia/pega a mano.
**Frecuencia:** 08:30 diario.
**Dedup:** `brand-bsky-coach-seen.json`.
**Historia:** antes era `brand-x-coach.js` y cubría X; se renombró al abandonar Twitter el 31/08.

### Persona Runner (`persona-runner.js`) — DESACTIVADO
**Qué hacía:** sesiones sociales por persona — leer feed, generar comentario con Claude, publicar.
**Estado:** todos sus crons están comentados en `index.js`. Twitter/Facebook/Reddit desde
2026-06-25; Bluesky (dispatcher horario, informe diario e hilo de warm-up) desde 2026-07-08.
Motivo: decisión de Javier — no encajaban con el espíritu de autenticidad de la marca.
**El módulo sigue cargándose** desde `index.js` porque expone helpers (`loadPersonas`), pero
no ejecuta nada de forma automática.
**Menciones:** las tasas viven en `social-overrides.json` y el Social Optimizer las sigue
tocando; no consultar cifras aquí, que se quedan viejas.
**Si se retoma:** `node login-persona.js <id> <platform>` para restaurar sesión.

### Persona Monitor (`persona-monitor.js`) — DESACTIVADO
**Qué hacía:** comprobar cada hora si las personas habían actuado; si detectaba silencio,
auto-retry y email de alerta.
**Estado:** cron comentado el 2026-07-08 (sin personas activas no hay nada que monitorizar).
**Umbrales (en código):** twitter >14h, bluesky >26h, facebook >48h, resto 24h.
**Nota:** el auto-retry ya no hace nada — su único canal implementado era Twitter, y
`twitter.js` se eliminó en la limpieza del 2026-09-11.

### Followup (`followup.js`) — DESACTIVADO
**Qué hacía:** detectar respuestas a comentarios de las personas y generar replies.
**Estado:** el módulo se importa en `index.js` pero ya no tiene cron. No confundir con
`outreach-followup.js`, que sí está activo (ver Outreach Follow-up).

### Gmail (`gmail.js`)
**Qué hace:** Procesa el inbox — clasifica emails (cliente, plataforma, spam), extrae datos relevantes.
**Importante:** `processInbox()` toma acciones. `getRecentEmails(n)` es solo lectura — usar en el protocolo DESPIERTA.
**Output:** `reports/gmail-{fecha}.json`

### Outreach Discovery (`outreach-discover.js`)
**Qué hace:** Busca YouTubers en nichos objetivo via YouTube Data API. Los añade al tracker con estado `pending-email`.
**Output:** `outreach-tracker.json`

### Outreach Send (`outreach-send.js`)
**Qué hace:** Envía emails personalizados a contactos `pending-email`. Usa análisis del canal para personalizar.
**Links con UTM:** `utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach`
**Nota:** El pipeline tiene pocos contactos actualmente — revisar si la Discovery está encontrando canales válidos.

### Outreach Follow-up (`outreach-followup.js`)
**Qué hace:** Re-contacta a quienes no respondieron en X días.

### Outreach Attribution (`outreach-attribution.js`)
**Qué hace:** Cruza los contactos de outreach con los registros nuevos para saber qué altas
vienen de la campaña.
**Frecuencia:** 02:50 diario.

### Outreach Monitor (`outreach-monitor.js`)
**Qué hace:** Detecta respuestas a los emails de outreach.
**Frecuencia:** 5x/día (09, 12, 15, 18, 21).

> **Reddit eliminado:** `outreach-post.js` (posts en subreddits) y `outreach-reddit-targeted.js`
> (comentarios en posts de ayuda) ya no existen — Reddit quedó abandonado de forma permanente
> por cuentas baneadas/shadowbanned. No reimplementar sin hablarlo con Javier.

### Blog Generator (`blog-generator.js`)
**Qué hace:** Genera artículos SEO en español e inglés usando Claude. Publica automáticamente en el blog.
**Frecuencia:** Lunes y jueves 04:00.
**Output:** `reports/blog-generator-state.json`

### Blog Syndicator (`blog-syndicator.js`)
**Qué hace:** Re-publica artículos del blog en Blogger y Tumblr, con canonical al original.
**Frecuencia:** 05:00 diario.
**Credenciales:** Blogger reutiliza el OAuth de Google (`BLOGGER_*`); Tumblr usa OAuth 1.0a
(`TUMBLR_*`). Para regenerar los tokens de Tumblr: `node tumblr-setup.js`.

### Quora Commenter (`quora-commenter.js`)
**Qué hace:** Responde preguntas sobre YouTube en Quora con respuestas útiles.
**Frecuencia:** 13:00 y 19:00.

---

## Prioridad 3 — Auto-mejora y análisis

### Manager (`manager.js`)
**Qué hace:** Agrega reportes de todos los agentes, construye un informe ejecutivo diario, detecta patrones cross-agent.
**Acciones automáticas:** Alerta si un agente tiene issues persistentes. Downgradea modelos si el presupuesto API es bajo.
**Output:** `reports/manager-{fecha}.json`
**Importante:** Solo alerta si el status es un error real — "sin cambios" y "último reporte" NO son errores.

### Social Optimizer (`social-optimizer.js`)
**Qué hace:** Analiza el rendimiento social — tasa de menciones, relevancia de posts, engagement. Ajusta `social-overrides.json`.
**Acciones automáticas:** Sube/baja tasas de mención, modifica instrucciones de prompt.

### SEO Optimizer (`seo-optimizer.js`)
**Qué hace:** Lee Google Search Console — clicks, impresiones, páginas indexadas, sitemap.
**Acciones automáticas:** Alerta si hay regresión de indexación. Propone submit de URLs.

### Funnel Optimizer (`funnel-optimizer.js`)
**Qué hace:** Analiza el embudo completo — registros, activación, retención, suscripciones, churn, feedback.
**Acciones automáticas:** Email de alerta, ajuste de mención rates, emails de reactivación a usuarios inactivos.

### Infra Optimizer (`infra-optimizer.js`)
**Qué hace:** Mide respuesta, conexiones BD, uso de disco, errores de log, salud de PM2.
**Acciones automáticas:** Limpia reportes viejos, rota logs, puede reiniciar servicios PM2.

### Retention Watch (`retention-watch.js`)
**Qué hace:** Mide el muro de retención (antigüedad de los usuarios) y la correlación entre
altas nuevas y usuarios activos, semana a semana.
**Frecuencia:** Lunes 02:38.

### Briefing Watch (`briefing-watch.js`)
**Qué hace:** Comprueba si los usuarios que reciben el briefing de ideas diarias vuelven a la
web. Es la medida de si el briefing sirve para retener o no.
**Nota:** el veredicto negativo se manda una sola vez (guard en `briefing-watch-state.json`);
la rama de buenas noticias sí avisa siempre.

### Scout (`scout.js`)
**Qué hace:** Analiza competidores (VidIQ, TubeBuddy, ViewStats, OutlierKit) — cambios en pricing, features, home.
**Frecuencia:** Lunes 02:30.

### Meta-Optimizer (`meta-optimizer.js`)
**Qué hace:** Analiza si los propios agentes funcionan bien — detecta patrones de fallo repetitivo, propone mejoras al sistema.
**Frecuencia:** Domingos 03:30.

### Watchdog (`watchdog.js`)
**Qué hace:** Compliance legal. Ver Prioridad 1.

---

## Mantenimiento automático

| Tarea | Cuándo | Módulo |
|-------|--------|--------|
| Cerrar browsers Puppeteer | 02:00 diario | index.js |
| Rotar logs >500KB | Al arrancar | index.js cleanup |
| Purgar reportes >7 días | Al arrancar | index.js cleanup |
| Gmail hygiene | 01:30 diario | gmail-cleanup.js |
| Recordatorio backup | Domingos 10:00 | index.js |

---

## Sistema de memoria de agentes

Cada agente tiene su propio archivo en `memory/{agente}.json`:
- `knownIssues`: issues abiertos/resueltos con historial
- `trends`: evolución de métricas por día
- `changelog`: log de cambios

**Escalación:** Un issue abierto 7+ días → el Manager envía alerta crítica.
**Cierre manual:** `node -e "const mem=require('./agent-memory');mem.closeIssueByKeyword('keyword')"`

---

## Sistema de auto-fix

Módulo central: `auto-fix.js`
- Cada agente registra fixes via `registerFixes(agentId, [...])`
- Cada fix tiene: condición, cooldown, acción
- Se ejecutan en `applyFixes(agentId, issues, metrics)`
- Log en `reports/auto-fixes.json`
- Patrones aprendidos en `reports/learned-patterns.json`

---

## Doctor (`doctor.js`)

Módulo de auto-diagnóstico llamado cuando un agente detecta un error grave.
Intenta auto-heal (kill Chrome, limpiar locks, retry). Si falla, escala a email.
Los patrones aprendidos se guardan en `reports/learned-patterns.json`.
