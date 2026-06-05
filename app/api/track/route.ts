import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

    const userAgent = req.headers.get('user-agent') || undefined;
    const country = req.headers.get('x-vercel-ip-country') || undefined;

    // Fire and forget — don't block the response
    prisma.pageView.create({
      data: {
        path,
        referrer: referrer || undefined,
        userAgent,
        country,
      },
    }).catch(() => {}); // silent fail

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
