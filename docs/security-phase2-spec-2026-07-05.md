# Spec — Seguridad Fase 2 (A5 CSP · A6 2FA admin · A8 Turnstile · A9 emails)

**Fecha**: 2026-07-05
**Origen**: auditoría integral 2026-07-04 (`docs/web-audit-spec-2026-07-04.md`), puntos aplazados a fase 2, más un hallazgo nuevo de la revisión post-commit del 05/07 (A9).
**Estado**: SPEC — nada implementado.

## Resumen ejecutivo

| ID | Qué | Riesgo que cubre | Esfuerzo | Necesita a Javier |
|----|-----|------------------|----------|-------------------|
| A8 | Cloudflare Turnstile en signup | Bots registrándose (ya documentados) | ~2h | Sí: crear widget en CF + 2 env vars |
| A6 | TOTP para el admin | Compromiso de la contraseña admin = control total | ~3h | Sí: escanear QR + 1 env var |
| A9 | Normalizar emails (lowercase) | Bug latente de auth + duplicados por casing | ~1h | No |
| A5 | Endurecer CSP | Defensa en profundidad ante un XSS futuro | ~2h + 1-2 sem. observación | No (solo aprobar) |

**Orden recomendado**: A8 → A9 → A6 → A5. Turnstile primero porque el problema (bots) ya existe; CSP el último porque su fase de observación corre sola en paralelo.

---

## A8 — Cloudflare Turnstile en signup

### Contexto
`/api/signup` no tiene ninguna barrera anti-bot (la auditoría documentó registros automatizados). Sí tiene rate-limit atómico y bloqueo de emails desechables, pero un bot paciente pasa ambos. Turnstile es gratis, sin fricción visible (modo *managed*, normalmente invisible) y **funciona con el dominio en DNS-only** — es un widget JS + una API de verificación, no necesita el proxy naranja de Cloudflare (restricción LaLiga intacta).

### Tareas de Javier (previas)
1. Dashboard Cloudflare → Turnstile → *Add widget*: dominio `ytubviral.com`, modo **Managed**.
2. Copiar **Site Key** y **Secret Key** a Vercel:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (pública, va al cliente)
   - `TURNSTILE_SECRET_KEY` (secreta)
3. Redeploy.

### Cliente — `app/signup/SignupForm.tsx`
- Cargar el script `https://challenges.cloudflare.com/turnstile/v0/api.js` solo en esa página (render explícito, no implícito), con `next/script` o inyección en efecto.
- Contenedor del widget entre el último campo y el botón de submit. Tema `dark` (coherente con la UI). Idioma según `lang`.
- Al completarse el challenge, Turnstile deja un token; incluirlo en el body del POST a `/api/signup` como `turnstileToken`.
- Si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no está definida (dev local), no renderizar widget ni exigir token — cero fricción en desarrollo.
- El token caduca a los ~5 min: en error de verificación, resetear el widget (`turnstile.reset()`) y pedir reintento, no dejar el form muerto.

### Servidor — `app/api/signup/route.ts`
Insertar la verificación **después** del rate-limit existente y **antes** de crear el usuario:

```
POST https://challenges.cloudflare.com/turnstile/v0/siteverify
  body: secret, response (token), remoteip (x-forwarded-for)
```

Política de fallos (decisión de diseño, ya tomada aquí):
- `TURNSTILE_SECRET_KEY` no definida → **saltar verificación** con `console.warn` (dev local y ventana de despliegue sin romper signup).
- Token ausente o `success: false` → **403** con error bilingüe ("Verificación anti-bot fallida. Recarga e inténtalo de nuevo." / EN equivalente).
- Cloudflare inaccesible (fetch lanza o 5xx) → **fail-open** (dejar pasar, `console.error`). Razonamiento: perder un registro real por una caída de CF cuesta más que dejar pasar un bot puntual; los bots persistentes caen en la operación normal.

### Alcance deliberadamente NO incluido
- Login, forgot-password y waitlist ya tienen rate-limit atómico y no muestran señales de abuso. Añadir Turnstile ahí mete fricción sin evidencia de problema. Revisar solo si los logs muestran abuso.
- Google OAuth signup no lo necesita (Google ya es la barrera).

### CSP (coordinar con A5)
Añadir a la CSP global: `script-src … https://challenges.cloudflare.com` y `frame-src … https://challenges.cloudflare.com`.

### Verificación
1. Dev sin keys: signup funciona igual que hoy.
2. Preview/prod con keys: registrarse a mano (challenge invisible o interactivo) → cuenta creada.
3. `curl` directo a `/api/signup` sin token → 403.
4. Métrica de éxito: los registros con email desechable/patrón bot caen a ~0 en el panel de Turnstile (tiene analytics propios).

### Rollback
Borrar las 2 env vars y redeploy → el código salta la verificación solo. Sin cambios de schema.

---

## A6 — TOTP (app de autenticación) para el admin

### Contexto
El admin es 1 email (`ADMIN_EMAIL`) con contraseña; `requireAdmin()` protege las 13 rutas API y el proxy protege `/admin`. Si esa contraseña cae (phishing, reuso, stuffing), el atacante tiene: datos de todos los usuarios, grant-pro, delete-user, envío de emails. Un segundo factor TOTP (Google Authenticator, 1Password, etc.) elimina ese punto único de fallo. **Email-OTP no sirve aquí**: si el atacante tiene el email del admin, tiene también el segundo factor.

### Diseño clave: secreto en env var, NO en base de datos
Con un único admin, guardar el secreto TOTP en `ADMIN_TOTP_SECRET` (Vercel env) es más simple y más seguro que en BD:
- Sin cambio de schema, sin cifrado en reposo que gestionar, sin UI de enrolamiento.
- Un atacante con acceso de solo-lectura a la BD (el escenario que el 2FA cubre) no obtiene el secreto.
- Rotación = regenerar y reemplazar la var.

### Dependencia
`otplib` (~estándar de facto, sin dependencias nativas). Para el QR de enrolamiento: `qrcode` solo como devDependency del script.

### Enrolamiento — `scripts/admin-totp-setup.js` (uso único, local)
1. Genera secreto (`authenticator.generateSecret()`).
2. Imprime el `otpauth://` URI + QR ASCII en terminal.
3. Javier lo escanea con su app de autenticación y sube `ADMIN_TOTP_SECRET` a Vercel.
4. El script imprime también un código de prueba esperado para confirmar que el reloj cuadra.

### Login — `auth.ts`, provider Credentials
1. Añadir campo opcional `totp` a `credentials`.
2. En `authorize()`, tras validar la contraseña:
   - Si `email !== ADMIN_EMAIL` (comparación normalizada, ver A9) → flujo actual sin cambios. **Cero impacto en usuarios normales.**
   - Si es admin y `ADMIN_TOTP_SECRET` está definida → exigir `authenticator.verify({ token, secret })` (ventana 1 = ±30s de tolerancia de reloj). Código ausente o inválido → `return null` (login falla, mismo mensaje genérico que contraseña errónea — no revelar que existe 2FA).
   - Si la var NO está definida → login admin como hoy + `console.warn`. (Fail-open deliberado: quien puede editar env vars en Vercel ya es "root"; esto permite recuperarse de un secreto perdido borrando la var, sin lockout permanente.)
3. Rate-limit de intentos TOTP con el `rateLimitDb` existente (`totp:${ip}`, 10/15min) para impedir fuerza bruta de los 6 dígitos.

### UI — `app/login/LoginForm.tsx`
- Campo "Código de autenticación" **oculto por defecto**; mostrarlo solo cuando el email introducido coincide con el admin es filtrar información. Alternativa elegida: flujo en dos pasos — si el login de credenciales falla y el email es el admin, el form muestra el campo TOTP y reintenta. Implementación mínima: mostrar el campo tras el primer fallo con un texto neutro ("Si tu cuenta tiene 2FA, introduce el código"). Sin endpoint nuevo, sin filtración útil (el atacante no distingue "contraseña mal" de "falta TOTP").
- Login con Google para el admin: `authorize()` no aplica (es otro provider). Decisión: **el admin no debe tener login por Google** — verificar que la cuenta admin no tiene `Account` de Google vinculada; si la tiene, desvincular antes de activar esto (script one-off o a mano en BD). Documentar en el PR.

### Google OAuth y bypass
El callback `signIn` de Google crea/vincula por email. Si alguien controla una cuenta Google con el email del admin (o Google permite ese email), entraría **sin TOTP**. Mitigación obligatoria en la misma PR: en el callback `signIn`, si `account.provider === 'google'` y el email normalizado es `ADMIN_EMAIL` → **rechazar** (`return false`). El admin entra solo por credenciales+TOTP.

### Deliberadamente NO incluido (fase 3 si algún día hay más admins)
- Step-up re-auth por acción destructiva, códigos de recuperación en BD, WebAuthn/passkeys, UI de enrolamiento. Con 1 admin y secreto en env, la recuperación es "borrar la var y re-enrolar", que ya es segura.

### Verificación
1. Sin `ADMIN_TOTP_SECRET`: login admin funciona como hoy (warn en logs).
2. Con la var: login admin sin código → falla; con código de la app → entra; código repetido/viejo → falla.
3. Login de usuario normal: sin ningún cambio de comportamiento.
4. Intento de login Google con el email admin → rechazado.

### Rollback
Borrar `ADMIN_TOTP_SECRET` y redeploy.

---

## A9 — Normalización de emails (hallazgo 05/07, previo a adoptar `requireUser`)

### Contexto
`lib/auth-guards.ts:requireUser()` busca el email **en minúsculas**, pero ni el signup (`app/api/signup/route.ts:184`) ni el login (`auth.ts:24-26`) normalizan. Hoy es inofensivo (nadie usa `requireUser` aún) pero es una bomba de relojería: el día que se adopte, cualquier usuario registrado con mayúsculas recibe 401. Además el estado actual ya permite dos cuentas `Foo@x.com` / `foo@x.com` distintas y hace el login sensible a mayúsculas (soporte fantasma: "mi contraseña no funciona").

### Cambios
1. **Signup** (`app/api/signup/route.ts`): `email = email.toLowerCase().trim()` nada más parsearlo, antes del `findUnique` de duplicados y del `create`. Aplicar también al `emailVerificationToken`.
2. **Login** (`auth.ts` authorize): normalizar `credentials.email` antes del `findUnique`.
3. **Google callback** (`auth.ts` signIn): normalizar `user.email` antes de buscar/crear.
4. **Comparación admin** (`jwt` callback, línea 120): ya debe usar la comparación normalizada — hoy es `user.email === process.env.ADMIN_EMAIL` estricta; cambiar a lowercase+trim en ambos lados (o reutilizar la constante de `auth-guards`).
5. **Migración one-off** — `scripts/normalize-emails.js`:
   - `SELECT` de usuarios cuyo email ≠ su lowercase.
   - **Detección de colisiones primero**: si `lower(a) == lower(b)` para dos usuarios distintos, NO tocar — listarlos y parar para decisión manual (fusionar a mano). No auto-fusionar nunca.
   - Sin colisiones → `UPDATE` a lowercase. Modo `--dry-run` por defecto, `--apply` para ejecutar.
   - Tocar también `emailVerificationToken.email` y cualquier tabla con email como dato (revisar schema en implementación: `waitlist`, `passwordResetToken` si existen).

### Verificación
`--dry-run` en prod para ver el alcance real (probablemente 0-2 usuarios); tras aplicar, login con casing distinto al registrado debe funcionar.

---

## A5 — Endurecimiento de CSP

### Estado real (corregido respecto a la auditoría)
La CSP global de `next.config.ts:27` ya es razonablemente completa (allowlists específicas para Stripe, HF, imgly, Anthropic; `object-src 'none'`; `base-uri 'self'`). Los problemas reales:

1. `script-src` lleva `'unsafe-eval'` y `'unsafe-inline'` y `blob:`.
2. `img-src` permite `http:` (contenido mixto degradado).
3. Falta `form-action 'self'` (un XSS podría exfiltrar formularios a otro origen).
4. La CSP de `/embed` (`next.config.ts:73`) también lleva `unsafe-eval` sin necesitarlo.

### Restricción de arquitectura — por qué NO CSP con nonces
La CSP "estricta" canónica (nonces + `strict-dynamic`) exige generar un nonce por request → **fuerza rendering dinámico en todas las páginas** → destruye la estrategia force-static + cache CDN construida por SEO/performance (decisión previa del proyecto, medida por Sentinel). Coste desproporcionado para un sitio sin inputs de usuario reflejados en HTML (el audit confirmó que los 33 `dangerouslySetInnerHTML` son todos JSON-LD con `JSON.stringify` de datos propios). **Decisión: `'unsafe-inline'` en `script-src` se acepta y documenta como riesgo residual**; la defensa real contra XSS aquí es no interpolar input de usuario en HTML, que ya se cumple y se re-audita en cada review.

### Paso 1 — Policy candidata (cambios sobre la actual)
- `script-src`: quitar `'unsafe-eval'` (mantener `'wasm-unsafe-eval'`, que es lo que necesita onnxruntime/imgly). Quitar `blob:` (los workers ya están cubiertos por `worker-src 'self' blob:`). Añadir `https://challenges.cloudflare.com` (A8).
- `img-src`: quitar `http:`.
- Añadir: `form-action 'self' https://checkout.stripe.com`, `frame-src … https://challenges.cloudflare.com`, `manifest-src 'self'`.
- `style-src`/`font-src`: **mantener** `fonts.googleapis.com`/`fonts.gstatic.com` — el editor de miniaturas los carga en runtime (`ThumbnailEditor.tsx:678`, Bebas Neue/Anton/Oswald para el canvas). No son residuo.
- `/embed`: quitar `'unsafe-eval'` (el widget no lo usa).
- **Solo en producción**: en dev, React Refresh necesita `unsafe-eval`; condicionar la policy a `NODE_ENV` en `next.config.ts`.

### Paso 2 — Despliegue en Report-Only (1-2 semanas)
No estrenar la policy rompiendo cosas: publicar la candidata como `Content-Security-Policy-Report-Only` **junto a** la actual, con `report-uri /api/csp-report`.
- Nuevo endpoint `app/api/csp-report/route.ts`: acepta el JSON del navegador, `console.warn` compacto (los logs de Vercel bastan; nada de BD), rate-limit 10/min/IP con `rateLimitRequest` para que no sirva de vector de spam de logs.
- Superficies que ejercitar durante la ventana: editor de miniaturas con quitar-fondo (fallback browser incluido — es el candidato nº1 a necesitar `unsafe-eval`), checkout Stripe completo, demo de la landing, vídeo YouTube embebido, `/embed` en un iframe externo, generación con streaming.
- Si tras 1-2 semanas no hay violaciones legítimas → promover la candidata a `Content-Security-Policy` y retirar la Report-Only + endpoint.

### Verificación final
- Recorrido completo de las superficies listadas sin errores CSP en consola.
- `securityheaders.com` como chequeo externo (esperable A/A+).

### Rollback
Revertir el commit de promoción — la policy vieja queda en el historial. Sin estado, sin schema.

---

## Coordinación y orden de ejecución

1. **A8 Turnstile** — bloqueado por Javier (widget CF + env vars). El código puede mergearse antes: sin keys se comporta como hoy.
2. **A9 emails** — sin dependencias. Hacerlo antes que A6 porque A6 reutiliza la comparación normalizada del admin.
3. **A6 TOTP** — bloqueado por Javier al final (escanear QR + env var). Igual que A8: mergeable antes, inactivo sin la var.
4. **A5 CSP** — el commit Report-Only puede ir con cualquiera de los anteriores; la promoción, sola, tras la ventana de observación. Recordar añadir los dominios de Turnstile ANTES de activar A8 en prod (si no, el widget viola la policy candidata y ensucia los reports).

**Env vars nuevas (todas tarea de Javier en Vercel)**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `ADMIN_TOTP_SECRET`.

**Sin cambios de schema Prisma** en toda la fase (A9 solo actualiza datos). Nada de esto toca el local-agent.
