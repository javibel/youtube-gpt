@AGENTS.md

# YTubViral — Guía de Claude Code

## Quién es el usuario
Javier Jimeno Plata, CEO y único responsable del proyecto. Tiene base técnica pero su rol es de negocio. Comunicar siempre en términos de impacto, no de implementación. Respuestas cortas y directas. Sin resúmenes al final de lo que acabo de hacer — puede leer el diff.

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

# Restaurar sesión de persona
node login-persona.js <id> <platform>
# ids: persona-alex, persona-ferran, persona-ana, persona-mayra, brand-reddit
# platforms: twitter, reddit, facebook

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
| Persona Runner | Sesiones sociales | ~09:30 y ~22:00 |
| Persona Monitor | Detecta silencio en personas | Cada hora 08-23h |
| Followup | Responde a replies de personas | 10-11h y 17-18h |
| Gmail | Procesa inbox | Cada 30 min 08-23h |
| Outreach Discovery | Encuentra YouTubers | 6x/día |
| Outreach Send | Emails a creadores | 6x/día |
| Outreach Community | Posts en Reddit | 11:00 diario |
| Outreach Reddit Targeted | Comenta en posts de ayuda | 11:00 y 18:00 |
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
| Alex Sastre | Twitter, Reddit | Editor de vídeo freelance, Valencia, 26 años |
| Ferran Gómez | Twitter, Reddit | Consultor marketing digital, Barcelona, 33 años |
| Ana Reyes | Twitter, Reddit | Community manager freelance, Madrid, 29 años |
| Mayra Vidal | Twitter, Reddit | Copywriter YouTube, Sevilla, 31 años |
| Javier (brand) | Reddit | Fundador YTubViral — solo responde, no inicia |

**Estado actual:** cuentas nuevas (semanas), karma 0. Fase de calentamiento — objetivo: credibilidad antes que conversión.

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
- Fix de Cache-Control desplegado (mayo 2026) — páginas ahora cacheables por Google
- 73 URLs en sitemap, indexación pendiente de re-crawl (2-8 semanas)
- Para acelerar: `node gsc-index-urls.js`
- Prioridad de indexación: /, /features/*, /pricing, /blog, /blog/*
