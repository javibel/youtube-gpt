# ACTA DE PERMISOS DE LOS AGENTES YTUBVIRAL (YCML)

**Fecha de emisión:** 2026-05-09
**Otorgante:** Javier Jimeno Plata (CEO, YTubViral)
**Estado:** ACEPTADA

---

## DISPOSICIONES GENERALES

1. Los permisos aquí recogidos autorizan a los agentes a operar de forma autónoma dentro de los límites establecidos, sin necesidad de solicitar confirmación adicional.
2. Esta acta es válida desde el momento de su aceptación hasta que el otorgante la revoque expresamente, en su totalidad o parcialmente.
3. Cualquier acción que exceda los permisos aquí recogidos requiere autorización explícita previa.
4. El otorgante puede modificar, ampliar o restringir estos permisos en cualquier momento.

---

## 1. SENTINEL — Monitor de Disponibilidad (PRIORIDAD 1)

**Misión:** Garantizar que ytubviral.com está online y responde correctamente.

| Permiso | Detalle | Límite |
|---------|---------|--------|
| HTTP requests salientes | GET a ytubviral.com (landing + /api/health) | Cada 5 minutos, 24/7 |
| Envío de emails | Alertas de caída, recuperación y lentitud a javijimenoplata@gmail.com | Caída: inmediato + cada 30min. Lentitud: máx 1/hora |
| Despertar Guardian | Ejecutar Guardian fuera de horario si detecta HTTP 403/503 o 3+ fallos consecutivos | Máx 1 activación por incidente |
| Escritura en disco | memory/sentinel.json, logs de consola | Solo en directorio local-agent/ |
| Llamadas a API IA | Ninguna | 0 |

**Prohibiciones:** No puede modificar configuración DNS, Vercel ni Cloudflare. Solo observa y alerta.

---

## 2. GUARDIAN — Seguridad y Calidad de Código

**Misión:** Auditar diariamente la seguridad del código y las dependencias.

| Permiso | Detalle | Límite |
|---------|---------|--------|
| Lectura del sistema de archivos | Leer archivos del proyecto youtube-gpt/ (código fuente, configs) | Solo lectura, nunca escritura |
| Ejecución de comandos | `npm audit`, `npx tsc --noEmit` en el directorio del proyecto | Solo comandos de auditoría, nunca install/update |
| HTTP requests salientes | GET a ytubviral.com para verificar headers de seguridad y HTTPS | Máx 5 requests por ejecución |
| Llamadas a API IA | Claude Haiku para sintetizar hallazgos | Máx 1 llamada/día, 2000 tokens output |
| Escritura en disco | reports/guardian-YYYY-MM-DD.json, memory/guardian.json | Solo en directorio local-agent/ |
| Envío de emails | No directo (a través de Manager) | 0 |

**Prohibiciones:** No puede instalar/desinstalar paquetes, modificar código fuente, hacer deploy ni ejecutar scripts arbitrarios.

---

## 3. SCOUT — Análisis de Competencia

**Misión:** Monitorizar cambios en competidores (precios, features).

| Permiso | Detalle | Límite |
|---------|---------|--------|
| HTTP requests salientes | GET a páginas públicas de VidIQ, TubeBuddy, ViewStats, OutlierKit | Máx 10 requests por ejecución, solo lunes |
| Llamadas a API IA | Claude Sonnet para analizar cambios detectados | Máx 1 llamada/semana, 2000 tokens output |
| Escritura en disco | reports/scout-YYYY-MM-DD.json, reports/scout-snapshots.json, memory/scout.json | Solo en directorio local-agent/ |
| Envío de emails | No directo (a través de Manager) | 0 |

**Prohibiciones:** No puede interactuar con las webs de competidores (login, formularios, API). Solo lectura de páginas públicas.

---

## 4. WATCHDOG — Compliance Legal

**Misión:** Verificar que las páginas legales cumplen con GDPR y LSSI-CE.

| Permiso | Detalle | Límite |
|---------|---------|--------|
| HTTP requests salientes | GET a ytubviral.com/terms, /privacy, /legal + headers de seguridad | Máx 10 requests por ejecución, solo lunes |
| Llamadas a API IA | Claude Sonnet para verificar compliance | Máx 1 llamada/semana, 2000 tokens output |
| Escritura en disco | reports/watchdog-YYYY-MM-DD.json, memory/watchdog.json | Solo en directorio local-agent/ |
| Envío de emails | No directo (a través de Manager) | 0 |

**Prohibiciones:** No puede modificar las páginas legales. Solo audita y reporta.

---

## 5. MANAGER — Coordinador y Reporte Ejecutivo

**Misión:** Consolidar reportes de todos los agentes y enviar resumen diario.

| Permiso | Detalle | Límite |
|---------|---------|--------|
| Lectura en disco | Reportes JSON de todos los agentes, archivos memory/*.json | Solo lectura dentro de local-agent/ |
| Llamadas a API IA | Claude Haiku para sintetizar resumen ejecutivo | Máx 1 llamada/día, 600 tokens output |
| Envío de emails | Reporte ejecutivo diario + recordatorio backup semanal a javijimenoplata@gmail.com | Máx 2 emails/día |
| Eliminación de archivos | Limpiar reportes y logs con más de 30 días | Solo archivos en reports/ y logs/ |
| Escritura en disco | reports/manager-YYYY-MM-DD.json, memory/manager.json | Solo en directorio local-agent/ |

**Prohibiciones:** No puede ejecutar otros agentes, modificar código ni tomar acciones correctivas. Solo informa.

---

## 6. TWITTER/X — Engagement (Cuenta Marca)

**Misión:** Interactuar orgánicamente con la comunidad de creadores de contenido en X.

| Permiso | Detalle | Límite |
|---------|---------|--------|
| Navegador Puppeteer | Sesión con cookies de la cuenta marca (@ytubviral) | 2 sesiones/día (13-15h y 20-22h Madrid) |
| Acciones en X | Likes en tweets relevantes del nicho | Máx 5/día (ajustado por humanize.js) |
| Acciones en X | Replies generados por IA a tweets relevantes | Máx 1/día (ajustado por humanize.js) |
| Llamadas a API IA | Claude Haiku para generar replies contextuales | 1 llamada por reply (máx 1/día) |
| Base de datos | Lectura/escritura en tabla twitter_actions | Solo registros de la cuenta marca |
| Envío de emails | Alerta si la sesión expira | Máx 1 email por sesión expirada |

**Prohibiciones:** No puede seguir/dejar de seguir cuentas, enviar DMs, cambiar perfil, publicar tweets propios (eso lo hace YCMR vía API).

---

## 7. GMAIL — Gestión de Bandeja de Entrada

**Misión:** Clasificar y responder emails recibidos en ytbeviral@gmail.com.

| Permiso | Detalle | Límite |
|---------|---------|--------|
| Lectura de emails | Leer emails no leídos de ytbeviral@gmail.com vía API | Cada 30 min (8-23h Madrid) |
| Clasificación | Clasificar como: important, actionable, ignore | Automático |
| Reenvío | Reenviar emails important a javijimenoplata@gmail.com | Sin límite (solo security alerts) |
| Respuesta automática | Responder a emails actionable con IA | Máx según volumen real |
| Llamadas a API IA | Claude Haiku para generar respuestas | 1 llamada por email actionable |
| Marcado | Marcar emails procesados como leídos | Solo emails que ha procesado |
| Base de datos | Registrar emails procesados | Tabla de tracking |

**Prohibiciones:** No puede eliminar emails, modificar configuración de la cuenta Gmail, suscribirse/desuscribirse de servicios, ni responder en nombre de javijimenoplata@gmail.com.

---

## 8. FOLLOW-UP — Seguimiento de Respuestas

**Misión:** Detectar y responder a quienes han contestado a nuestros comentarios.

| Permiso | Detalle | Límite |
|---------|---------|--------|
| Navegador Puppeteer | Sesión Twitter (marca) y Reddit (personas) | 1 sesión/día (15-17h Madrid) |
| Acciones | Responder a replies en Twitter y Reddit | Máx 2 follow-ups/día por plataforma |
| Llamadas a API IA | Claude Haiku para generar follow-up contextual | 1 llamada por follow-up (máx 4/día total) |
| Base de datos | Lectura de comentarios últimos 7 días, escritura de follow-ups | Solo tablas de acciones |

**Prohibiciones:** Las mismas que Twitter marca y Reddit personas respectivamente.

---

## 9. PERSONAS — Alex Sastre y Ferran Gómez

**Misión:** Interactuar orgánicamente en redes como personas independientes que ocasionalmente mencionan YTubViral.

### 9a. Personas en Twitter/X

| Permiso | Detalle | Límite |
|---------|---------|--------|
| Navegador Puppeteer | Sesiones con cookies propias, perfil separado | 2 rondas/día (9-11h y 22-23h Madrid) |
| Acciones | Likes, replies | Likes: máx 5/día por persona. Replies: máx 1/día por persona |
| Mención de YTubViral | Incluir mención casual en replies | ~20% Alex, ~15% Ferran (controlado por mentionRate) |
| Llamadas a API IA | Claude Haiku para generar comentarios en personalidad | 1 por reply |
| Base de datos | Lectura/escritura en twitter_actions con account_id | Solo registros propios |

### 9b. Personas en Reddit

| Permiso | Detalle | Límite |
|---------|---------|--------|
| Navegador Puppeteer | Sesiones en old.reddit.com, perfil separado | 2 rondas/día (con Twitter personas) |
| Acciones | Upvotes, comments en subreddits del nicho | Upvotes: máx 5/día. Comments: máx 2/día por persona |
| Subreddits autorizados | NewTubers, youtubers, SmallYTChannel, PartneredYoutube, YouTubeGaming, letsplay, videopodcast, contentcreation, socialmedia, SEO, VideoEditing, Filmmakers, CreatorServices, podcasting | Solo estos 14 subreddits |
| Mención de YTubViral | Incluir mención casual en comments | Misma tasa que Twitter |
| Base de datos | Lectura/escritura en reddit_actions con account_id | Solo registros propios |

**Prohibiciones personas (aplica a ambas plataformas):** No pueden crear posts propios, enviar DMs, moderar comunidades, votar negativamente, participar en subreddits no autorizados, ni mentionRate superior al 25%.

---

## 10. API GUARD — Protección Centralizada

**Misión:** Limitar el consumo de API de Anthropic por todos los agentes.

| Control | Valor |
|---------|-------|
| Budget diario total | 100.000 tokens (input + output) |
| Rate limit | Máx 10 llamadas/minuto |
| Timeout por llamada | 30 segundos |
| Output máximo por llamada | 2.000 tokens |
| Input máximo por llamada | 15.000 caracteres |
| Circuit breaker | 5 errores consecutivos → pausa 5 minutos |

---

## PERMISOS TRANSVERSALES

| Recurso | Todos los agentes pueden | Ningún agente puede |
|---------|--------------------------|---------------------|
| Sistema de archivos | Escribir en local-agent/reports/, local-agent/memory/, local-agent/logs/ | Escribir fuera de local-agent/, modificar código fuente |
| Base de datos | Leer/escribir en sus tablas asignadas (Neon PostgreSQL) | DROP/ALTER tablas, acceder a tablas de usuarios |
| Red | Hacer requests GET a dominios autorizados | POST/PUT/DELETE a servicios externos no autorizados |
| Procesos | Ejecutar dentro de su propio contexto node-cron | Instalar software, crear procesos hijos arbitrarios, acceder a otros PCs de la red |
| Credenciales | Usar las variables de .env que necesitan | Leer/exponer/logear credenciales en texto plano |

---

## CLAUSULA DE ESCALADO

Si un agente encuentra una situación que excede sus permisos o que no está contemplada en esta acta:

1. **Sentinel** escala inmediatamente por email (caída = PRIO 1)
2. **Otros agentes** registran el issue en su memoria y lo incluyen en el reporte del Manager
3. **Manager** consolida y envía el reporte diario al otorgante
4. Ningún agente tomará acción fuera de sus permisos; esperará instrucciones

---

## ACEPTACION

Yo, Javier Jimeno Plata, acepto los permisos aquí descritos y autorizo a los agentes YCML a operar de forma autónoma dentro de estos límites.

**Fecha de aceptación:** 2026-05-09
**Firma:** Javier Jimeno Plata (aceptado verbalmente)

---

*Documento generado el 2026-05-09. Versión 1.0.*
*Cualquier modificación requiere nueva versión firmada.*
