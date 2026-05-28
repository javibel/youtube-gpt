@AGENTS.md

# Protocolo de sesión

Cuando el usuario dice "Despierta" (o variantes), ejecutar el protocolo de inicio:
1. Leer TODA la memoria (MEMORY.md + todos los archivos referenciados)
2. Verificar estado actual: PM2, logs recientes, git status
3. Leer `C:/Users/jimen/youtube-gpt/local-agent/reports/pending-for-claude-{HOY}.json` si existe.
   Si tiene issues → actuar inmediatamente SIN esperar instrucciones (el auto-resolver ya hizo los fixes programáticos, estos son los que necesitan código). Resolver, hacer commit+push.
4. Resumir estado al usuario (incluyendo qué issues del pending-for-claude se resolvieron)
5. Preguntar en qué trabajar

## Regla de oro

NUNCA actuar sobre un problema sin verificar PRIMERO que sigue existiendo AHORA. Logs antiguos ≠ estado actual. Si algo funciona, NO TOCAR.

## Memoria continua

Actualizar memoria con CADA cambio, problema, solución o error — en el momento, no al final.
