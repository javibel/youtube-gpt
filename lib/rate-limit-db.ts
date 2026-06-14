import { prisma } from '@/lib/prisma';

/**
 * Atomic per-key rate limit backed by the `rate_limits` table. Cross-instance (unlike the
 * in-memory limiter in rate-limit.ts), so it actually holds on Vercel serverless. Fails OPEN on
 * infra error — never block legit users because the store hiccupped.
 *
 * windowMinutes is always a hardcoded integer from our own code (never user input), so it's safe
 * to interpolate into the INTERVAL literal; the key is parameterized.
 */
export async function rateLimitDb(key: string, limit: number, windowMinutes: number): Promise<boolean> {
  const w = Math.max(1, Math.floor(windowMinutes));
  try {
    const rows = await prisma.$queryRawUnsafe<{ hits: number }[]>(
      `INSERT INTO rate_limits (key, hits, window_start)
       VALUES ($1, 1, NOW())
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE WHEN rate_limits.window_start < NOW() - INTERVAL '${w} minutes' THEN 1 ELSE rate_limits.hits + 1 END,
         window_start = CASE WHEN rate_limits.window_start < NOW() - INTERVAL '${w} minutes' THEN NOW() ELSE rate_limits.window_start END
       RETURNING hits`,
      key,
    );
    return Number(rows[0]?.hits ?? 0) <= limit;
  } catch {
    return true; // fail open
  }
}

/** Convenience: rate-limit by the requester's IP. Returns true if allowed. */
export async function rateLimitRequest(request: Request, prefix: string, limit: number, windowMinutes: number): Promise<boolean> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  return rateLimitDb(`${prefix}:${ip}`, limit, windowMinutes);
}
