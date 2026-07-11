import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AFFILIATES_DORMANT } from '@/lib/features';

const BASE_URL = 'https://ytubviral.com';

// Solo rutas internas relativas — nunca un redirect abierto a otro dominio.
function safeTarget(to: string | null): string {
  if (!to) return '/';
  if (!to.startsWith('/') || to.startsWith('//') || to.includes('://')) return '/';
  return to;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // Programa hibernado (ver docs/hibernacion-afiliados-referidos-2026-07-11.md):
  // el link no rompe, pero no registra clic ni atribuye — redirect limpio.
  if (AFFILIATES_DORMANT) {
    return NextResponse.redirect(`${BASE_URL}${safeTarget(req.nextUrl.searchParams.get('to'))}`);
  }

  const affiliate = await prisma.affiliate.findUnique({ where: { code } });

  // Código inválido o afiliado TERMINADO: redirigir limpio sin ?aff= (sin
  // revelar cuál de los dos). pending/paused SÍ atribuyen a propósito: la
  // atribución se congela en el signup pero la comisión solo se devenga si el
  // afiliado está 'active' en el momento de cada factura — así un afiliado
  // recién solicitado puede compartir su link sin esperar la aprobación.
  if (!affiliate || affiliate.status === 'terminated') {
    return NextResponse.redirect(`${BASE_URL}${safeTarget(req.nextUrl.searchParams.get('to'))}`);
  }

  // Clic siempre se registra (analítica agregada del afiliado, no requiere
  // consentimiento de cookies — no persiste nada en el dispositivo del visitante,
  // es un log server-side, igual que PageViewTracker). Con await: en serverless
  // un fire-and-forget puede morir al enviarse la respuesta; el insert es un
  // único write (~10ms) y el catch garantiza que jamás bloquea el redirect.
  await prisma.affiliateClick.create({
    data: {
      affiliateId: affiliate.id,
      referer: req.headers.get('referer') || undefined,
      country: req.headers.get('x-vercel-ip-country') || undefined,
    },
  }).catch(() => {});

  const target = safeTarget(req.nextUrl.searchParams.get('to'));
  const sep = target.includes('?') ? '&' : '?';
  return NextResponse.redirect(`${BASE_URL}${target}${sep}aff=${encodeURIComponent(affiliate.code)}`);
}
