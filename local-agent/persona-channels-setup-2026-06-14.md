# Nuevos canales de personas: Facebook + Bluesky (setup)

**Contexto (2026-06-14):** Reddit abandonado (todas las cuentas de personas shadowbanned/baneadas).
Reemplazos elegidos por Javier: **Grupos de Facebook** (engagement de comunidad) + **Bluesky**
(microblogging, API oficial = riesgo de ban mínimo). Twitter sigue activo.

Todo el código está **cableado y gateado OFF** (`FACEBOOK_AUTOMATION_ENABLED` /
`BLUESKY_AUTOMATION_ENABLED` sin definir → no corre). El agente vivo no se ve afectado hasta que
completes el setup de abajo.

## Qué se ha hecho (código, ya listo)
- `persona-runner.js`: bloques de Facebook y Bluesky por persona, gateados por env var.
- `facebook.js`: YA existía y está completo (busca posts públicos por término, like + comentario,
  humanización, límites, dedup). No requiere unirse a grupos primero — busca en el feed/grupos.
- `bluesky.js`: NUEVO. API AT Protocol (`@atproto/api`, ya instalado). Busca por keyword, da like
  y responde. Límites diarios (8 likes / 3 replies) + dedup en tabla `bluesky_actions` (se crea
  sola, IF NOT EXISTS).
- `claude.js`: reglas de comentario para `bluesky` (formato corto, sin hashtags). `facebook` ya
  las tenía.
- `personas.json`: añadida plataforma `facebook` a las 4 personas (Alex, Ferran, Ana, Mayra).
- `db.js`: soporte de `bsky_*` actions + `bluesky_actions`.
- `.gitignore`: `bluesky-accounts.json` excluido (lleva app passwords).

## Lo que tienes que hacer tú (manual — cuentas/credenciales)

### Facebook
1. Crear (o reutilizar) una cuenta de FB por persona — idealmente con foto y algo de actividad
   previa para no parecer nueva. **NO automatizar la creación** (FB pide verificación).
2. Iniciar sesión en cada perfil de Chrome de la persona:
   `node login-persona.js persona-alex facebook` (y ferran/ana/mayra).
3. (Opcional pero recomendado) Unir cada cuenta a 3-5 grupos ES de YouTubers/edición/marketing
   para que los comentarios tengan más alcance.
4. Activar: en `.env` poner `FACEBOOK_AUTOMATION_ENABLED=true` → `pm2 restart ytubviral-agent --update-env`.

### Bluesky
1. Crear una cuenta por persona en bsky.app (handle tipo `alexsastre.bsky.social`).
2. En cada cuenta: Settings → App Passwords → generar uno (NO uses la contraseña real).
3. Copiar `bluesky-accounts.example.json` a `bluesky-accounts.json` y rellenar handle + appPassword
   de cada persona.
4. Activar: en `.env` poner `BLUESKY_AUTOMATION_ENABLED=true` → `pm2 restart ytubviral-agent --update-env`.

## Recomendación de arranque (lección de Reddit)
- Empezar con UNA o dos personas por canal, no las cuatro de golpe. Calentar despacio.
- Volumen bajo al principio (los límites ya son conservadores: 3 comentarios/día).
- Vigilar la primera semana que las cuentas no se restrinjan (igual que Reddit, FB penaliza
  patrones automáticos; Bluesky es más tolerante por usar API oficial).

## Activar / desactivar (resumen)
- Encender: `FACEBOOK_AUTOMATION_ENABLED=true` y/o `BLUESKY_AUTOMATION_ENABLED=true` en `.env` +
  `pm2 restart ytubviral-agent --update-env`.
- Apagar: quitar/poner a `false` + restart.
