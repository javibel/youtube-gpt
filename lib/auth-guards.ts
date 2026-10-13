import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth, readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';

type Guard<T> = { ok: true } & T | { ok: false; response: NextResponse };
const deniedAdmin = (): Guard<{ email: string }> => ({
  ok: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }),
});

// No caller-supplied actor, role, selector, proof or recovery argument.
// Only the native decoder of this request's actual encrypted cookie can supply
// the principal. Configured origin selects its cookie options; no host/bearer
// fallback, session GET, JWT backfill, refresh or cookie writer is invoked.
export async function requireAdmin(): Promise<Guard<{ email: string }>> {
  try {
    const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    if (!configured || !ADMIN_EMAIL || ADMIN_EMAIL.length > 254
      || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(ADMIN_EMAIL)) return deniedAdmin();
    const origin = new URL(configured);
    if (origin.username || origin.password || origin.search || origin.hash
      || origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))) return deniedAdmin();
    const incoming = await headers();
    const cookie = incoming.get('cookie');
    if (!cookie) return deniedAdmin();
    const decoded = await readNativeSessionCookie(new Request(new URL('/api/auth/session', origin.origin), { headers: { cookie } }));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return deniedAdmin();
    const principal = decoded as Record<string, unknown>;
    const { id, email, authSessionRef, exp, iat } = principal;
    const unexpired = () => typeof exp === 'number' && Number.isSafeInteger(exp) && exp > Date.now()/1000
      && typeof iat === 'number' && Number.isSafeInteger(iat) && iat <= Date.now()/1000 && iat < exp;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || principal.sub !== id
      || typeof email !== 'string' || email !== email.trim().toLowerCase() || email !== ADMIN_EMAIL
      || typeof authSessionRef !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(authSessionRef)
      || principal.isAdmin !== true || principal.requiresVerification !== false || principal.requiresTotp !== false || !unexpired()) return deniedAdmin();
    // This dependent read can only revoke eligibility of the decoded principal.
    // A stored email/date/role/ID never grants or reconstructs authentication.
    const account = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } });
    if (!account || account.id !== id || account.email !== email || !(account.emailVerified instanceof Date)
      || !Number.isFinite(account.emailVerified.getTime()) || account.emailVerified.getTime() > Date.now() || !unexpired()) return deniedAdmin();
    return { ok: true, email };
  } catch { return deniedAdmin(); }
}

// Ordinary user authorization is a separate pending boundary; this change
// neither grants it admin privileges nor rewrites its existing callers.
export async function requireUser(): Promise<Guard<{ user: { id: string; email: string } }>> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email) return { ok: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return { ok: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  return { ok: true, user };
}
