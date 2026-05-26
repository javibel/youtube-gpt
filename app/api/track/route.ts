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

function isTrackable(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  if (path.startsWith('/blog/')) return true;
  if (path.startsWith('/features/')) return true;
  if (path.startsWith('/gear')) return true;
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
