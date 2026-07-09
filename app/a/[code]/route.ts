import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BASE_URL = 'https://ytubviral.com';

// Solo rutas internas relativas — nunca un redirect abierto a otro dominio.
function safeTarget(to: string | null): string {
  if (!to) return '/';
  if (!to.startsWith('/') || to.startsWith('//') || to.includes('://')) return '/';
  return to;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const affiliate = await prisma.affiliate.findUnique({ where: { code } });

  // Código inválido o afiliado no activo: no revelar cuál de los dos, redirigir
  // limpio a home sin ?aff= (no queremos atribuir a un afiliado pausado/terminado).
  if (!affiliate || affiliate.status === 'terminated') {
    return NextResponse.redirect(`${BASE_URL}${safeTarget(req.nextUrl.searchParams.get('to'))}`);
  }

  // Clic siempre se registra (analítica agregada del afiliado, no requiere
  // consentimiento de cookies — no persiste nada en el dispositivo del visitante,
  // es un log server-side, igual que PageViewTracker).
  prisma.affiliateClick.create({
    data: {
      affiliateId: affiliate.id,
      referer: req.headers.get('referer') || undefined,
      country: req.headers.get('x-vercel-ip-country') || undefined,
    },
  }).catch(() => {}); // fire-and-forget, nunca bloquear el redirect por esto

  const target = safeTarget(req.nextUrl.searchParams.get('to'));
  const sep = target.includes('?') ? '&' : '?';
  return NextResponse.redirect(`${BASE_URL}${target}${sep}aff=${encodeURIComponent(affiliate.code)}`);
}
