@AGENTS.md

# YTubViral — Guía de Claude Code

## Quién es el usuario
Javier Jimeno Plata, CEO y único responsable del proyecto. Tiene base técnica pero su rol es de negocio. Comunicar siempre en términos de impacto, no de implementación. Respuestas cortas y directas. Sin resúmenes al final de lo que acabo de hacer — puede leer el diff.

---

# Capacidades en este entorno (Claude Code)

Además de leer/escribir archivos y ejecutar comandos, dispongo de:
- **Shell**: PowerShell (Windows) y Bash. Working dir por defecto: el padre `C:/Users/jimen/youtube-gpt`.
- **MCP de Vercel**: leer deployments, build logs y runtime logs, listar proyectos (proyecto `youtube-gpt`, team `javibels-projects`). Sirve para diagnosticar producción. NO puedo escribir env vars (eso es el panel de Vercel → tarea de Javier).
- **MCP de Gmail / Google Calendar / Google Drive**: buscar y leer correos, gestionar calendario y archivos.
- **Web search + fetch**: investigación en vivo (verificar docs, URLs, estado de proveedores).
- **Preview local**: levantar el dev server para verificar cambios de la web antes de desplegar (ver "Entorno técnico clave").
- **Git**: commit + push (mensajes terminan con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
- **Memoria persistente**: `C:/Users/jimen/.claude/projects/C--Users-jimen-youtube-gpt/memory/` con índice `MEMORY.md`. Leerla al empezar, alimentarla con cada cambio.

# Entorno técnico clave

- **Layout del repo**: el repo git vive en `C:/Users/jimen/youtube-gpt/youtube-gpt` (los comandos `git` van ahí). La webapp Next.js se despliega en Vercel **automáticamente al hacer push a `main`**. `local-agent/` está versionado en ese mismo repo pero **NO se despliega** (corre en PM2 desde disco) → commitear `local-agent` es solo backup, sin efecto en el agente vivo.
- **⚠️ `local-agent/` tiene ADEMÁS su propio repositorio git independiente** (`javibel/ytubviral-agent`, privado, remote `origin` dentro de `C:/Users/jimen/youtube-gpt/local-agent/.git`). Son dos repos versionando los mismos ficheros en disco. Al buscar un commit/rama/historial de algo dentro de `local-agent/` que no aparece aquí (`git log`, `git branch -a --contains`, etc. desde este repo), **antes de concluir que se perdió, repetir la búsqueda con `git -C ../local-agent`** — puede vivir en el otro repo. Ya pasó una vez (29/08/2026): se dio por perdido un fix que estaba intacto en el repo de `local-agent`, y se reimplementó desde cero sin necesidad. Mantener ambos repos al día con cada sesión que toque `local-agent/`.
- **Verificación antes de desplegar**: `npx tsc --noEmit` (typecheck) antes de commitear cambios de la web. Para previsualizar visualmente, levantar el **dev server (puerto 3011)** — NO el prod (3010 sirve un build viejo). El `launch.json` que lee el preview está en el **directorio padre**: `C:/Users/jimen/youtube-gpt/.claude/launch.json` (config `ytubviral-dev`).
- **Next.js 16**: tiene breaking changes (ver AGENTS.md) — p.ej. `middleware.ts` → `proxy.ts`. Leer `node_modules/next/dist/docs/` antes de escribir código de framework.
- **Base de datos**: PostgreSQL en Neon, COMPARTIDA entre webapp y agente local. Prisma `User` mapea a la tabla `users` (minúsculas), columnas camelCase entre comillas (`"createdAt"`, `"userId"`).

---

# Protocolo DESPIERTA (inicio de sesión)

Ejecutar siempre que el usuario diga "Despierta", invoque `/audit`, o inicie sesión sin contexto previo.
Ambos son equivalentes: `/audit` para revisión rápida del sistema, "Despierta" para sesión de trabajo.

**Paso 1 — Leer memoria**
Leer MEMORY.md + todos los archivos referenciados antes de cualquier otra acción.

**Paso 2 — Estado del sistema**
```bash
cd C:/Users/jimen/youtube-gpt/local-agent
pm2 list
tail -50 logs/out.log | grep -E "ERROR|WARN|cron|persona"
git -C C:/Users/jimen/youtube-gpt/youtube-gpt log --oneline -5
```

**Paso 3 — Pending issues (auto-resolver)**
Leer `reports/pending-for-claude-{HOY}.json`. Si existe y tiene issues → actuar inmediatamente sin pedir permiso. Commit + push al terminar.

**Paso 4 — Reporte del Manager**
Leer `reports/manager-{HOY}.json` y resumir: qué está bien, qué está mal, qué se ha resuelto automáticamente.

**Paso 5 — Emails importantes**
```bash
node -e "require('dotenv').config();const g=require('./gmail');g.getRecentEmails(20).then(r=>console.log(JSON.stringify(r,null,2))).catch(console.error)"
```
Filtrar: emails de clientes reales, alertas de Stripe, problemas de plataforma. Ignorar DMARC rutinarios.

**Paso 6 — Resumen al usuario**
Una tabla limpia: estado de servicios, problemas detectados, qué se resolvió solo, qué necesita intervención. Luego preguntar en qué trabajar.

---

# Reglas permanentes

## Autonomía
- Arreglar cualquier proceso roto sin pedir permiso.
- Consultar SIEMPRE antes de modificar un proceso que funciona bien.
- Consultar SIEMPRE antes de decisiones de precios, ofertas o comunicación con clientes.
- No interrumpir entre pasos de una misma tarea — implementar y seguir.
- Permiso concedido para trabajar en modo lectura / escritura en todos los archivos dentro de esta ruta: C:\Users\jimen\youtube-gpt\youtube-gpt

## Cierre de issues
Cuando el usuario confirme que algo está resuelto, cerrarlo en todos los agentes:
```bash
cd C:/Users/jimen/youtube-gpt/local-agent
node -e "const mem=require('./agent-memory');const c=mem.closeIssueByKeyword('KEYWORD');console.log('Cerrados:',c.length,JSON.stringify(c))"
```
El Manager deja de alertar sobre ese issue desde ese momento.

## Regla de oro
Verificar SIEMPRE que un problema sigue existiendo ANTES de tocarlo. Logs de ayer ≠ estado actual. Si funciona, no tocar.

## Registro obligatorio de cambios
Después de implementar cualquier cambio y ANTES de hacer commit, actualizar la memoria correspondiente:
- Cambios SEO → `project_seo.md` (historial cronológico + tabla + pendientes)
- Cambios extensión → `project_chrome_extension.md`
- Cambios agentes → `project_social_agent.md` o el archivo relevante
- Cualquier otro → el archivo de memoria que corresponda
NO hacer commit sin haber registrado el cambio primero. Si no hay archivo de memoria relevante, crear uno.

## Report de estado = leer el manager del día
Cuando el usuario pide "estado del sistema", "report", "cómo va todo" o similar — SIEMPRE leer primero `reports/manager-{HOY}.json` del día actual antes de responder. No usar el report de ayer aunque esté en contexto. Si no existe el de hoy, indicarlo explícitamente.

## Memoria
Actualizar memoria con CADA cambio significativo — en el momento, no al final de la sesión.

## Commits
Commit + push al final de cada bloque de trabajo. Nunca dejar cambios sin commitear al cerrar sesión.

## Líneas rojas (nunca sin preguntar)
- Eliminar o modificar chrome-profiles/
- Cambiar precios o planes de suscripción
- Enviar emails a usuarios
- Modificar DNS o configuración de Cloudflare
- Hacer push --force
- Borrar datos de producción

---

# Sistema de agentes

**Working dir:** `C:/Users/jimen/youtube-gpt/local-agent`
**Stack web:** Next.js en Vercel + PostgreSQL en Neon + Resend para email

## Prioridades (en orden estricto)
1. **Salud de la web** — si algo falla aquí, todo lo demás espera
2. **Marketing activo** — personas, outreach, contenido
3. **Auto-mejora** — optimizadores, análisis, memoria

## Comandos frecuentes
```bash
pm2 list                          # estado de los 3 servicios
pm2 restart ytubviral-agent       # reiniciar agente local
pm2 logs ytubviral-agent --lines 50  # logs recientes

# Restaurar sesión de persona (Puppeteer)
node login-persona.js <id> <platform>
# ids: persona-alex, persona-ferran, persona-ana, persona-mayra
# platforms: twitter, facebook  (reddit MUERTO; bluesky NO usa esto — va por app password en bluesky-accounts.json)

# Indexación Google Search Console
node gsc-index-urls.js

# Forzar reporte del manager
node -e "require('dotenv').config();const {runManager}=require('./manager');runManager().then(()=>process.exit())"
```

## Servicios PM2
| Servicio | Función |
|----------|---------|
| ytubviral-agent | Agente local — todos los crons |
| ytubviral-dashboard | Panel interno de monitoreo |
| ytubviral-tunnel | Cloudflare tunnel |

## Agentes activos y frecuencia
| Agente | Función | Cuándo |
|--------|---------|--------|
| Sentinel | Uptime de endpoints | Cada 5 min, 24/7 |
| Feature Monitor | Tests end-to-end de features | 07:00 y 19:00 |
| Guardian | Auditoría de seguridad | 02:15 diario |
| DMARC Monitor | Autenticación de email | 06:00 diario |
| Auto-Resolver | Lee Manager + aplica fixes | 09:17 diario |
| Morning Fix (Task Scheduler) | Claude revisa y corrige código | 09:35 diario |
| Bluesky Dispatcher | Engagement personas Bluesky (ritmo por persona) | Cada hora 08-23h |
| Bluesky Informe | Resumen diario likes/replies por persona | 23:40 |
| Bluesky Warm-up Drip | 1 post original/día mientras haya cola | 12:35 |
| Persona Monitor | Detecta silencio en personas (Bluesky) | Cada hora 08-23h |
| ~~Persona Runner (Twitter/FB/Reddit)~~ | DISABLED 2026-06-25 | — |
| ~~Followup personas~~ | DISABLED 2026-06-25 (Twitter abandonado) | — |
| ~~X Coach / Brand X Coach~~ | ABANDONADO 2026-08-31 (Twitter, cuenta quemada) | — |
| Brand Bluesky Coach | Plan diario de Bluesky de marca (posts propios + respuestas a creadores que piden ayuda) → email a Javier | 08:30 diario |
| Gmail | Procesa inbox | Cada 30 min 08-23h |
| Outreach Discovery | Encuentra YouTubers | 6x/día |
| Outreach Send | Emails a creadores | 6x/día |
| Outreach Community | Posts en Reddit — INACTIVO (Reddit muerto) | — |
| Outreach Reddit Targeted | Comenta en posts de ayuda — INACTIVO (Reddit muerto) | — |
| Outreach Monitor | Detecta respuestas | Cada 3h 09-21h |
| Blog Generator | Artículos SEO | Lun+Jue 04:00 |
| Blog Syndicator | Cross-posting | 05:00 diario |
| Quora Commenter | Preguntas YouTube | 13:00 y 19:00 |
| Manager | Reporte ejecutivo | 03:15 diario |
| Social Optimizer | Mejora redes sociales | 03:00 diario |
| SEO Optimizer | Mejora SEO | 02:50 diario |
| Funnel Optimizer | Analiza conversión + actúa | 02:55 diario |
| Infra Optimizer | Salud técnica | 02:45 diario |
| Scout | Análisis competidores | Lunes 02:30 |
| Meta-Optimizer | Mejora el propio sistema | Domingos 03:30 |
| Watchdog | Compliance legal | Lunes 02:45 |

## Personas sociales
| Persona | Plataformas | Perfil |
|---------|------------|--------|
| Alex Sastre | Bluesky (alex5000.bsky.social) | Editor de vídeo freelance, Valencia, 26 años |
| Ferran Gómez | Bluesky (ferran5000.bsky.social) | Consultor marketing digital, Barcelona, 33 años |
| Ana Reyes | Bluesky (ana5000.bsky.social) | Community manager freelance, Madrid, 29 años |
| Mayra Vidal | Bluesky (mayra02.bsky.social) | Copywriter YouTube, Sevilla, 31 años |

**Canales (actualizado 2026-07-08):** TODAS las personas DESCONECTADAS en TODAS las redes (`BLUESKY_AUTOMATION_ENABLED=false`) — decisión Javier: no seguían el espíritu de autenticidad de la marca. Twitter/Facebook/Reddit ya estaban off desde 2026-06-25; Bluesky se apagó el 2026-07-08 (dispatcher, informe diario y warm-up drip comentados en `index.js`; persona-monitor también deshabilitado). Reddit ABANDONADO permanente (cuentas baneadas/shadowbanned). **Twitter/X ABANDONADO 2026-08-31** (cuenta quemada — X Coach personal y Brand X Coach apagados; `brand-x-coach.js` → `brand-bluesky-coach.js`). Solo quedan activos: **FB + Instagram de marca vía API** (gestionado desde Vercel, no desde local-agent) y **Bluesky de marca** que opera Javier a mano (Brand Bluesky Coach genera el plan diario 08:30: posts propios + respuestas a creadores que piden ayuda). Las 4 cuentas de personas Bluesky quedan inactivas sin borrar.
**Nota histórica:** antes del apagado, la fase era calentamiento con ~7-12 acciones/día entre las 4 personas; el engagement era sano pero convertía casi 0 clics al sitio (ver [[project_user_attribution_gap]]).

## Archivos de configuración clave
| Archivo | Qué controla |
|---------|-------------|
| personas.json | Personalidades e IDs de personas |
| social-overrides.json | Tasas de mención, fórmulas, filtros |
| agent-config.json | Modelos Claude por agente, presupuesto API |
| outreach-tracker.json | Estado de contactos outreach |
| memory/*.json | Memoria persistente de cada agente |
| reports/*.json | Reportes diarios (se purgan >7 días) |

---

# SEO — Estado y acciones
- Fixes técnicos A1-A5 COMPLETOS (Cache-Control, sitemap, etc.). Último check 14/06: descubrimiento sube (+18 URLs) pero indexación PLANA (12→12).
- DIAGNÓSTICO: el cuello ya NO es técnico — es **autoridad de dominio (backlinks) + tiempo**. La palanca restante es off-page (embeds/widget `/embed`, partnerships, menciones) y paciencia, no más fixes on-page.
- Para empujar indexación puntual: `node gsc-index-urls.js`. Sweep de estado: `node gsc-sweep-all.js`.
- Detalle e historial en memoria `project_seo.md`. Próximo check sugerido ~1 julio.
