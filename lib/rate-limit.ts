/**
 * Rate limiter en memoria por IP.
 *
 * Nota: en Vercel (serverless), cada instancia tiene su propio Map.
 * No es perfecto entre instancias pero sí protege contra bursts desde
 * una misma IP en la misma instancia. Para protección cross-instancia
 * se necesitaría Upstash Redis.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // timestamp ms
}

const store = new Map<string, RateLimitEntry>();

// Limpia entradas expiradas cada ~5 minutos para evitar memory leaks
let lastCleanup = Date.now();
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

/**
 * Comprueba y registra un intento de rate limit.
 * @param key     Identificador único (p.ej. `signup:1.2.3.4`)
 * @param limit   Número máximo de intentos en la ventana
 * @param windowMs Duración de la ventana en ms
 * @returns `{ allowed: boolean; remaining: number; resetAt: number }`
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  maybeCleanup();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}
