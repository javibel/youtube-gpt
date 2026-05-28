@AGENTS.md

# Protocolo de sesión (DESPIERTA)

Cuando el usuario dice "Despierta" (o variantes), ejecutar el protocolo de inicio:
1. Leer TODA la memoria (MEMORY.md + todos los archivos referenciados)
2. Verificar estado actual: `pm2 list`, logs recientes de hoy, git status
3. Leer `C:/Users/jimen/youtube-gpt/local-agent/reports/pending-for-claude-{HOY}.json` si existe.
   Si tiene issues → actuar inmediatamente SIN esperar instrucciones. Resolver, commit+push.
4. Leer el reporte del Manager: `C:/Users/jimen/youtube-gpt/local-agent/reports/manager-{HOY}.json`
5. Leer emails relevantes de las últimas 12h:
   `cd C:/Users/jimen/youtube-gpt/local-agent && node -e "require('dotenv').config();const g=require('./gmail');g.getRecentEmails(20).then(r=>console.log(JSON.stringify(r,null,2))).catch(console.error)"`
6. Resumir al usuario: estado del sistema, problemas detectados, qué se ha resuelto ya
7. Preguntar en qué trabajar

---

# Reglas permanentes

## Regla de oro
NUNCA actuar sobre un problema sin verificar PRIMERO que sigue existiendo AHORA.
Logs antiguos ≠ estado actual. Si algo funciona, NO TOCAR.

## Rol y tono
- El usuario es el CEO del proyecto. Comunicar en términos de negocio, no técnicos.
- Respuestas cortas y directas. Sin resúmenes al final de lo que acabo de hacer.
- Sin emojis salvo que el usuario los pida explícitamente.

## Autonomía
- Puedo arreglar de forma autónoma cualquier proceso roto o que no funciona correctamente.
- Consultar SIEMPRE antes de modificar procesos que están funcionando bien.
- Consultar SIEMPRE antes de tomar decisiones de precios, ofertas o comunicación con clientes.
- No pedir permiso entre features de una misma tarea — implementar y seguir.

## Cierre de issues
Cuando el usuario dice que un issue está resuelto, cerrarlo INMEDIATAMENTE en todos los agentes:
```
cd C:/Users/jimen/youtube-gpt/local-agent && node -e "
const mem = require('./agent-memory');
const closed = mem.closeIssueByKeyword('PALABRA_CLAVE_DEL_ISSUE');
console.log('Cerrados:', closed.length, JSON.stringify(closed));
"
```
Confirmar cuántos issues se cerraron y en qué agentes. Así el Manager no vuelve a alertar.

## Memoria continua
Actualizar memoria con CADA cambio, problema, solución o error — en el momento, no al final.

## Commits
Commit + push al final de cada sesión de trabajo o tras cada bloque significativo de cambios.

---

# Sistema de agentes

Working directory del agente local: `C:/Users/jimen/youtube-gpt/local-agent`

## Prioridades del sistema (en orden)
1. **Salud de la web** — Sentinel, Feature Monitor, Guardian, DMARC, Auto-Resolver
2. **Marketing** — Personas, Outreach, Blog, Quora, Gmail
3. **Feedback y auto-mejora** — Manager, Optimizers, Scout, Meta-Optimizer

## Cómo reiniciar el agente
```
cd C:/Users/jimen/youtube-gpt/local-agent && pm2 restart ytubviral-agent
```

## Cómo restaurar una sesión de persona
```
cd C:/Users/jimen/youtube-gpt/local-agent && node login-persona.js <persona-id> <platform>
```
Personas: persona-alex, persona-ferran, persona-ana, persona-mayra, brand-reddit
Plataformas: twitter, reddit, facebook
