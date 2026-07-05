import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';

/**
 * Shared auth guards (2026-07-04, web audit A2/B1).
 *
 * Before this, every admin route repeated its own inline
 * `if (session?.user?.email !== ADMIN_EMAIL) return 403` check — 13 copies, no shared
 * normalization, no single place to harden the comparison. requireUser()/requireAdmin()
 * are meant to replace that pattern app-wide, not just in admin routes.
 *
 * Usage:
 *   const gate = await requireAdmin();
 *   if (!gate.ok) return gate.response;
 *
 *   const gate = await requireUser();
 *   if (!gate.ok) return gate.response;
 *   const { user } = gate; // resolved User row, not just the session email
 */

type Guard<T> = { ok: true } & T | { ok: false; response: NextResponse };

export async function requireAdmin(): Promise<Guard<{ email: string }>> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase().trim();
  if (!ADMIN_EMAIL || !email || email !== ADMIN_EMAIL) {
    return { ok: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }
  return { ok: true, email };
}

export async function requireUser(): Promise<Guard<{ user: { id: string; email: string } }>> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email) {
    return { ok: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  return { ok: true, user };
}
