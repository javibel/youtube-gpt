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

### Persona Runner (`persona-runner.js`)
**Qué hace:** Ejecuta sesiones sociales para cada persona en Twitter y Reddit — lee posts del feed, genera comentarios con Claude, los publica.
**Personas activas:** Alex, Ferran, Ana, Mayra (Twitter + Reddit). Brand (Reddit solo, responde no inicia).
**Estado:** Cuentas nuevas (semanas), en fase de calentamiento. Objetivo actual: ganar credibilidad antes que conversión.
**Menciones YTubViral:** Controladas por `social-overrides.json`. Tasas actuales: Alex 0.40, Ferran 0.50.
**UTM tracking:** Los links a ytubviral.com se etiquetan automáticamente con `utm_source={platform}&utm_campaign={persona_id}`.
**Si una sesión falla:** `node login-persona.js <id> <platform>` para restaurar.
**Output:** `twitter_actions` y `reddit_actions` en BD.

**Comportamientos actuales:**
- Comenta en posts relevantes de YouTube (SEO, growth, edición)
- Follow-up cuando alguien responde a un comentario
- Menciona ytubviral.com cuando el contexto lo justifica

**Comportamientos pendientes de implementar:**
- Publicar posts propios / hilos originales
- Interacción cruzada entre personas (una persona comenta el post de otra)
- Responder DMs (Reddit tiene CAPTCHA en cuentas nuevas — revisar cuando tengan karma)
- Contenido audiovisual (imágenes, clips) — requiere generación de assets

### Persona Monitor (`persona-monitor.js`)
**Qué hace:** Comprueba cada hora si las personas han actuado recientemente. Si detecta silencio, hace auto-retry. Si falla, email de alerta.
**Umbrales:** Twitter >14h de silencio = alerta. Reddit >26h. Facebook >48h.
**Auto-retry:** Máximo 2 intentos/persona/día.
**Output:** `reports/persona-health-{fecha}.json`

### Followup (`followup.js`)
**Qué hace:** Detecta respuestas a comentarios de las personas y genera replies naturales.
**Frecuencia:** 2x/día (mañana y tarde).

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

### Outreach Community (`outreach-post.js`)
**Qué hace:** Publica posts en subreddits relevantes desde las cuentas de persona.

### Outreach Reddit Targeted (`outreach-reddit-targeted.js`)
**Qué hace:** Busca posts de ayuda/feedback en subreddits de YouTube y deja comentarios útiles.
**Subreddits:** r/NewTubers, r/youtubers, r/youtube, r/VideoEditing, r/SEO.

### Outreach Monitor (`outreach-monitor.js`)
**Qué hace:** Detecta respuestas a los posts/comentarios de outreach.

### Blog Generator (`blog-generator.js`)
**Qué hace:** Genera artículos SEO en español e inglés usando Claude. Publica automáticamente en el blog.
**Frecuencia:** Lunes y jueves 04:00.
**Output:** `reports/blog-generator-state.json`

### Blog Syndicator (`blog-syndicator.js`)
**Qué hace:** Re-publica artículos del blog en plataformas externas (Blogger, Tumblr).
**Estado:** Activo pero sin sindicaciones confirmadas — en período de prueba.

### Quora Commenter (`quora-commenter.js`)
**Qué hace:** Responde preguntas sobre YouTube en Quora con respuestas útiles.
**Estado:** Activo — en período de prueba.

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
