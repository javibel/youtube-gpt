import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/send-email';
import { SEQUENCES } from '@/lib/lifecycle-emails';

export const maxDuration = 60;

// Cron diario de emails lifecycle (G4). DRY_RUN por defecto: loguea sin enviar.
// Activar envío real: LIFECYCLE_EMAILS_LIVE=true en env (decisión de Javier).
const LIVE = process.env.LIFECYCLE_EMAILS_LIVE === 'true';

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

type Lang = 'es' | 'en';
type Candidate = { userId: string; email: string; name: string; lang: Lang; sequence: string; step: string; tpl: { subject: { es: string; en: string }; build: (n: string, l: Lang, u: string, e?: Record<string, string | number>) => string }; extra?: Record<string, string | number> };

const DAY = 86400_000;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const since = (days: number) => new Date(now - days * DAY);

  // Universo elegible: email verificado, sin opt-out de marketing.
  const users = await prisma.user.findMany({
    where: { emailVerified: { not: null }, marketingOptOut: false },
    select: {
      id: true, email: true, name: true, lang: true, createdAt: true, updatedAt: true,
      subscription: { select: { status: true } },
      _count: { select: { generations: true } },
    },
  });

  // Emails ya enviados (idempotencia) + tope 1/día/usuario.
  const logs = await prisma.emailLog.findMany({ select: { userId: true, sequence: true, step: true, sentAt: true } });
  const sentSteps = new Set(logs.map((l) => `${l.userId}:${l.sequence}:${l.step}`));
  const sentToday = new Set(logs.filter((l) => l.sentAt.getTime() > now - DAY).map((l) => l.userId));

  // Última generación por usuario (inactividad).
  const lastGen = new Map<string, number>();
  for (const u of users) {
    const g = await prisma.generation.findFirst({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    if (g) lastGen.set(u.id, g.createdAt.getTime());
  }

  const candidates: Candidate[] = [];

  for (const u of users) {
    if (sentToday.has(u.id)) continue; // máx 1 email/día
    const lang = (u.lang === 'en' ? 'en' : 'es') as Lang;
    const name = u.name?.split(' ')[0] || (lang === 'en' ? 'there' : 'crack');
    const ageDays = (now - u.createdAt.getTime()) / DAY;
    const isPaid = u.subscription?.status === 'active';
    const genCount = u._count.generations;
    const lastGenAt = lastGen.get(u.id) ?? 0;
    const inactiveDays = lastGenAt ? (now - lastGenAt) / DAY : ageDays;

    const has = (seq: string, step: string) => sentSteps.has(`${u.id}:${seq}:${step}`);
    const push = (sequence: string, step: string, tpl: Candidate['tpl'], extra?: Record<string, string | number>) =>
      candidates.push({ userId: u.id, email: u.email, name, lang, sequence, step, tpl, extra });

    // ── A · Onboarding (skip-on-action) — solo cuentas recientes (≤21 días).
    //    Evita mandar "bienvenida" a cuentas antiguas en el arranque en frío;
    //    esas caen a reactivación. ───────────────────────────────────────────
    if (!isPaid && ageDays <= 21) {
      if (ageDays >= 0 && !has('onboarding', 'a1')) push('onboarding', 'a1', SEQUENCES.onboarding.a1);
      else if (ageDays >= 1 && genCount === 0 && !has('onboarding', 'a2')) push('onboarding', 'a2', SEQUENCES.onboarding.a2);
      else if (ageDays >= 3 && !has('onboarding', 'a3')) push('onboarding', 'a3', SEQUENCES.onboarding.a3);
      else if (ageDays >= 7 && !has('onboarding', 'a4')) push('onboarding', 'a4', SEQUENCES.onboarding.a4);
      else if (ageDays >= 14 && !has('onboarding', 'a5')) push('onboarding', 'a5', SEQUENCES.onboarding.a5);
    }

    // ── B · Reactivación — onboarding ya cubierto, inactividad real ───────────
    if (!isPaid && genCount > 0) {
      if (inactiveDays >= 30 && !has('react', 'b2')) push('react', 'b2', SEQUENCES.reactivation.b2);
      else if (inactiveDays >= 14 && !has('react', 'b1')) push('react', 'b1', SEQUENCES.reactivation.b1);
    }

    // ── C · Conversión — C1/C3 son por evento (se registran en EmailLog desde
    //    el endpoint de límite y los paywalls). C2 sí es por cron: power user.
    if (!isPaid && genCount >= 16 && ageDays >= 60 && !has('conv', 'c2')) {
      push('conv', 'c2', SEQUENCES.conversion.c2, { used: '8+' });
    }
  }

  // Solo el candidato de MAYOR prioridad por usuario (orden: conversion > react > onboarding ya implícito por push order inverso — re-priorizar):
  const byUser = new Map<string, Candidate>();
  const prio = (seq: string) => (seq === 'conv' ? 3 : seq === 'react' ? 2 : 1);
  for (const c of candidates) {
    const cur = byUser.get(c.userId);
    if (!cur || prio(c.sequence) > prio(cur.sequence)) byUser.set(c.userId, c);
  }
  const final = [...byUser.values()];

  let sent = 0;
  const preview: string[] = [];
  for (const c of final) {
    preview.push(`${c.sequence}/${c.step} → ${c.email} (${c.lang})`);
    if (LIVE) {
      try {
        await sendTransactionalEmail({ to: c.email, subject: c.tpl.subject[c.lang], html: c.tpl.build(c.name, c.lang, c.userId, c.extra) });
        await prisma.emailLog.create({ data: { userId: c.userId, sequence: c.sequence, step: c.step } });
        sent++;
      } catch (e) {
        console.error('[lifecycle] send failed', c.email, (e as Error).message);
      }
    }
  }

  return NextResponse.json({
    mode: LIVE ? 'LIVE' : 'DRY_RUN',
    eligibleUsers: users.length,
    candidates: final.length,
    sent: LIVE ? sent : 0,
    preview,
  });
}
