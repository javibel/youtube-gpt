import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimitRequest } from '@/lib/rate-limit-db';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public pages that we track (no auth required)
const PUBLIC_PATHS = [
  '/', '/blog', '/gear', '/login', '/signup', '/pricing',
  '/features/seo-score', '/features/keyword-research', '/features/competitor-analysis',
  '/features/ab-testing', '/features/trend-explorer', '/features/ai-generator',
  '/features/revenue-estimator', '/features/learning-hub',
];

// Paths we never track (sensitive / noisy)
const EXCLUDED_PATHS = ['/api/', '/stripe/', '/verify-email', '/reset-password'];

function isTrackable(path: string): boolean {
  if (EXCLUDED_PATHS.some(p => path.startsWith(p))) return false;
  if (PUBLIC_PATHS.includes(path)) return true;
  if (path.startsWith('/blog/')) return true;
  if (path.startsWith('/features/')) return true;
  if (path.startsWith('/gear')) return true;
  // Track authenticated pages too (dashboard, generate, etc.)
  if (path.startsWith('/dashboard') || path.startsWith('/generate') ||
      path.startsWith('/seo-score') || path.startsWith('/trends') ||
      path.startsWith('/research') || path.startsWith('/coach') ||
      path.startsWith('/analytics') || path.startsWith('/profile') ||
      path.startsWith('/ab-test') || path.startsWith('/competitors') ||
      path.startsWith('/calendar') || path.startsWith('/retention') ||
      path.startsWith('/predictor') || path.startsWith('/best-time') ||
      path.startsWith('/optimize') || path.startsWith('/thumbnail-preview') ||
      path.startsWith('/revenue') || path.startsWith('/subscribers') ||
      path.startsWith('/audit') || path.startsWith('/team')) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { path, referrer } = await req.json();

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!isTrackable(path)) {
      return NextResponse.json({ ok: true });
    }

    // 2026-07-04 (audit A4): unauthenticated write with no limit — could be used to bloat
    // page_views and pollute the (already low-volume) attribution data. 60/min per IP is far
    // more than real navigation ever produces.
    const allowed = await rateLimitRequest(req, 'track', 60, 1);
    if (!allowed) {
      return NextResponse.json({ ok: true }); // don't leak rate-limit state to the client
    }

    const userAgent = req.headers.get('user-agent') || undefined;
    const country = req.headers.get('x-vercel-ip-country') || undefined;

    // 13/07: asociar la vista al usuario logueado (si lo hay) para poder
    // reconstruir journeys de retención. Nunca bloquea el tracking anónimo.
    const session = await auth().catch(() => null);
    const userId = session?.user?.id || undefined;

    // 29/08/2026: esto era fire-and-forget ("no bloquear la respuesta") y dejo de
    // funcionar. En serverless la instancia se congela en cuanto se devuelve la
    // respuesta, asi que una promesa sin await puede no llegar a ejecutarse nunca.
    // Sintoma: /api/track devolvia 200, el limitador (que SI hace await) escribia su
    // fila, y la visita no se guardaba. ~20h sin registrar una sola visita mientras
    // habia trafico real. Un INSERT tarda milisegundos: no hay nada que ahorrar aqui.
    try {
      await prisma.pageView.create({
        data: {
          path,
          referrer: referrer || undefined,
          userAgent,
          country,
          userId,
        },
      });
    } catch {
      // Una analitica nunca debe romper la navegacion del usuario.
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
