import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guards';
import { prepareFeedbackOriginal, dispatchFeedbackOriginal } from '@/lib/feedback-email-original';

export const maxDuration = 60;
const reply = (data: object, status: number) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  const gate = await requireAdmin(); if (!gate.ok) return gate.response;
  const check = () => { if (request.signal.aborted) throw Error('Request retired'); };
  try {
    check(); const value: unknown = await request.json(); check();
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1
      || typeof (value as { email?: unknown }).email !== 'string') return reply({ error: 'Email inválido' }, 400);
    const email = (value as { email: string }).email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(email))
      return reply({ error: 'Email inválido' }, 400);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } }); check();
    if (!user) return reply({ error: 'Usuario no encontrado' }, 404);
    const original = prepareFeedbackOriginal(user.id, email, check);
    const outcome = original ? await dispatchFeedbackOriginal(original) : 'not-issued';
    check();
    if (outcome === 'provider-accepted') return reply({ ok: true, status: 'provider-accepted' }, 200);
    if (outcome === 'not-required') return reply({ error: 'Solicitud no elegible o pendiente de conciliación' }, 409);
    return reply({ error: 'Solicitud sin confirmación' }, 503);
  } catch { return reply({ error: 'Solicitud sin confirmación' }, 503); }
}
