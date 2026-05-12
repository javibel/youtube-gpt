# Troubleshooting: Vercel / Deploy / Env Vars

Consultar este archivo ANTES de depurar problemas de deploy, variables de entorno o comportamiento en produccion.

---

## Rate limit en memoria NO funciona en serverless
Variables en memoria (Map, Set, contadores globales) se pierden entre invocaciones de Vercel Functions. Cada cold start es un proceso nuevo.
**Solucion:** Upsert atomico en BD (PostgreSQL/Prisma). Nunca usar variables globales para estado persistente en serverless.

## `\n` en env vars de Vercel
Vercel puede anadir caracteres extra (newlines, espacios) a variables de entorno, especialmente al copiar/pegar en el dashboard.
**Solucion:** `instrumentation.ts` hace trim de todas las env vars al arrancar. Verificar con:
```javascript
console.log(JSON.stringify(process.env.MI_VARIABLE));
// Si ves \n o espacios al inicio/final, el trim no se aplico
```

## STRIPE_WEBHOOK_SECRET cambia al editar endpoint
Cada vez que se edita el webhook en Stripe Dashboard se genera un nuevo signing secret.
**Solucion:** Actualizar la env var `STRIPE_WEBHOOK_SECRET` en Vercel inmediatamente despues de editar cualquier campo del webhook. Redeploy necesario.
