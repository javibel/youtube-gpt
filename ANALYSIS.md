# YTubViral — Analisis de codigo
**Fecha:** 2026-04-21 | **Modelo:** claude-sonnet-4-6 | **Rama:** main

---

## CRITICO

### C-01 — Generacion sin autenticacion: coste ilimitado (app/api/generate/route.ts)
Los checks de limite (cuenta, pro, rate-limit, IP) estan dentro del bloque
`if (session?.user?.email)`. Fuera de ese bloque el codigo llama a Claude
igualmente. Un usuario no autenticado puede llamar al endpoint en bucle
sin ningun limite, generando coste en Anthropic sin restriccion alguna.

Problema actual:
```ts
if (session?.user?.email) {
  // todos los checks estan aqui
}
// Claude call incondicional
const response = await fetch('https://api.anthropic.com/v1/messages', ...);
```

Fix: anadir al inicio del handler:
```ts
const session = await auth();
if (!session?.user?.id) return Response.json({ error: 'No autorizado' }, { status: 401 });
```

---

### C-02 — Pagina de login de desarrollo activa en produccion (app/api/login/page.tsx)
Existe un page.tsx dentro de app/api/login/ que se sirve en produccion en
la ruta /api/login. Contiene placeholders de credenciales de prueba
(test@test.com / 123456) y una UI diferente al login real de /login.
Es un remanente de desarrollo que no deberia existir en produccion.

Fix: eliminar el archivo app/api/login/page.tsx.

---

## SEGURIDAD

### S-01 — ADMIN_EMAIL con fallback hardcoded (5 archivos admin)

Problema:
```ts
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ytbeviral@gmail.com';
```
Si la variable de entorno falla (error de deploy, rollback de config), el email
hardcodeado se activa como admin. Da acceso a exportar toda la BD, borrar usuarios,
hacer grant-pro y crear cuentas. El fallback debe eliminarse.

Fix:
```ts
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
```

### S-02 — YouTube OAuth state sin firma CSRF (app/api/youtube/auth/route.ts)
El parametro state es simplemente session.user.id. El callback lo usa directamente
como userId sin verificar que la peticion proviene de la sesion que la inicio.
Un atacante que conozca el userId de otra cuenta podria hacerle conectar un canal
ajeno a su perfil.

Fix: generar un nonce firmado, almacenarlo en cookie httpOnly y validarlo en el
callback antes de usar el estado.

### S-03 — Rate limit de signup/forgot-password ineficaz en Vercel (lib/rate-limit.ts)
El rate-limit de signup y forgot-password usa un Map en memoria. Cada instancia
serverless de Vercel tiene su propio proceso: la misma IP puede superar el limite
cayendo en instancias distintas. En la practica permite spam de emails sin
restriccion real. El endpoint /api/generate ya usa la solucion correcta
(upsert atomico en BD). Aplicar el mismo patron a signup y forgot-password.

### S-04 — Export CSV incluye IPs de usuarios (app/api/admin/export/route.ts)
La exportacion de generaciones incluye el campo ip_address. Las IPs son PII
bajo GDPR. Fix: excluir el campo del CSV exportado o hashear con sal.

---

## BUGS

### B-01 — POST /api/video-previews no verifica plan Pro
Cualquier usuario autenticado (plan Free) puede llamar al endpoint directamente
y guardar previews en la BD. El bloqueo solo existe en el frontend. Los endpoints
/api/storyboard y /api/youtube/auth si tienen check Pro; este no.

Fix: anadir al inicio del POST:
```ts
const subscription = await prisma.subscription.findUnique({
  where: { userId }, select: { status: true }
});
if (subscription?.status !== 'active') {
  return NextResponse.json({ error: 'Pro required' }, { status: 403 });
}
```

### B-02 — forgot-password/route.ts — email await sin catch
Si Resend falla (timeout, cuota agotada), el endpoint devuelve 500 aunque el token
de reset ya fue creado correctamente en BD. El usuario ve un error cuando en
realidad deberia reintentar mas tarde.

Fix: igual que en signup/route.ts:
```ts
resend?.emails.send({ ... }).catch(err => console.error('forgot-password email:', err));
```

### B-03 — reset-password/route.ts — sin try/catch global
El handler principal no tiene try/catch. Cualquier error de Prisma resulta en
excepcion no controlada. Fix: envolver en try/catch con return 500.

### B-04 — Validacion de tamano ausente en POST /api/video-previews
El endpoint acepta videoData (base64) y hace Buffer.from(videoData, 'base64')
sin verificar el tamano antes. Un payload de 50 MB+ puede causar OOM.

Fix: anadir antes del decode:
```ts
if (videoData.length > 11 * 1024 * 1024) {
  return NextResponse.json({ error: 'File too large' }, { status: 413 });
}
```

### B-05 — Keyword sin limite de longitud (app/api/research/keywords/route.ts)
El campo keyword se usa directamente en una URL de YouTube API sin validar
longitud. Fix: if (keyword.trim().length > 200) return 400.

### B-06 — MRR incorrecto en admin stats (app/api/admin/stats/route.ts)
```ts
const mrr = proUsers * 9.99;
```
Asume que todos los Pro estan en plan mensual. Los usuarios del plan anual aportan
8.33 EUR/mes. Fix: consultar stripePriceId y usar el precio real.

### B-07 — Codigo duplicado: passwordChangedEmail
La funcion passwordChangedEmail esta copiada identicamente en:
- app/api/user/change-password/route.ts
- app/api/auth/reset-password/route.ts

Si se actualiza en uno, el otro queda desincronizado. Fix: extraer a lib/emails.ts.

---

## MEJORAS

### F-01 — Verificacion de email no implementada
El modelo User tiene emailVerified y existe VerificationToken, pero el flujo de
verificacion no existe. Cualquiera puede registrarse con el email de otra persona,
lo que tambien compromete el reset de contrasena.

### F-02 — Indices de BD ausentes en generations
Sin estos indices la tabla hara sequential scans cuando crezca:
```prisma
// anadir al modelo Generation en schema.prisma:
@@index([userId, createdAt])
@@index([ipAddress, createdAt])
```

### F-03 — Cuota de YouTube API sin gestion
Las rutas /api/research/keywords y /api/youtube/competitor consumen 100 unidades
de quota por busqueda. Con 10.000 unidades/dia ~50 busquedas agotan el limite.
No hay cache ni mensaje de error claro. Fix a corto plazo: cachear en BD 24h.

### F-04 — recentGenerations devuelve output completo en cada carga del dashboard
La query de stats devuelve el campo output (~1-2KB) para las ultimas 10
generaciones en cada carga de pagina. Omitir output y cargarlo solo al expandir.

### F-05 — Sin paginacion en historial de generaciones
El dashboard muestra las ultimas 10 generaciones hardcodeadas. Para usuarios
activos no hay forma de ver generaciones anteriores.

### F-06 — Validacion de contrasena solo por longitud minima
Solo se valida length >= 8. Contrasenas como 12345678 son aceptadas.
Anadir al menos un digito o simbolo requerido.

### F-07 — @anthropic-ai/sdk instalado pero no usado (package.json)
La SDK esta en dependencies pero todas las llamadas se hacen via fetch directo.
Fix: npm uninstall @anthropic-ai/sdk

---

## LO QUE ESTA BIEN

- Webhook de Stripe verificado con firma criptografica
- Upsert atomico en BD para rate-limit de generate (cross-instance, sin race condition)
- Bloqueo de emails desechables en signup
- Tokens de reset de 32 bytes hex con TTL de 1h, borrado tras uso
- Cascade deletes en todas las relaciones de User
- prompt:consent + access_type:offline garantizan refresh_token en OAuth YouTube
- videoBitsPerSecond: 200_000 evita superar el limite de 4MB de Next.js
- onEnded restart en video preview (correcto para WebM sin tabla CUES)
- prisma db push en build script garantiza schema sincronizado en cada deploy de Vercel
- Landing cacheada con revalidate = 3600
- forgot-password devuelve 200 aunque el email no exista (anti-enumeracion)
- Proteccion Pro en storyboard, YouTube auth y YouTube channel
- Token de YouTube no se borra en errores transitorios de red (solo en invalid_grant real)
- Badge Canal YT requiere isPro === true AND ytConnected === true

---

## Prioridades de accion

| ID   | Severidad | Esfuerzo | Accion                                           |
|------|-----------|----------|--------------------------------------------------|
| C-01 | Critica   | 5 min    | Auth check al inicio de generate/route.ts        |
| C-02 | Critica   | 1 min    | Eliminar app/api/login/page.tsx                  |
| S-01 | Alta      | 10 min   | Eliminar fallback hardcoded de ADMIN_EMAIL       |
| B-01 | Media     | 5 min    | Check Pro en POST /api/video-previews            |
| B-02 | Media     | 2 min    | .catch() en forgot-password email send           |
| B-04 | Media     | 5 min    | Validar tamano de videoData antes de Buffer.from |
| S-03 | Media     | 30 min   | Migrar rate-limit auth a BD (igual que generate) |
| F-02 | Media     | 10 min   | Anadir indices en schema.prisma                  |
| B-03 | Baja      | 5 min    | try/catch en reset-password handler              |
| B-05 | Baja      | 2 min    | Limitar keyword a 200 chars                      |
| B-07 | Baja      | 15 min   | Extraer passwordChangedEmail a lib/emails.ts     |
| F-07 | Baja      | 1 min    | npm uninstall @anthropic-ai/sdk                  |
