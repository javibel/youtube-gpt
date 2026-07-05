import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';
import { rateLimitDb } from '@/lib/rate-limit-db';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    // 2026-07-04 (audit A1): this endpoint proxies a per-call-billed third-party API
    // (remove.bg) with our own key. It previously had no auth, no plan check, and no
    // rate limit — anyone who found the URL could drain paid credits in a loop.
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const plan = await getUserPlan(user.id);
    if (!isPaid(plan)) {
      return NextResponse.json({ error: 'pro_required' }, { status: 403 });
    }
    const allowed = await rateLimitDb(`remove-bg:${user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Inténtalo en unos minutos.' }, { status: 429 });
    }

    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'REMOVE_BG_API_KEY not configured' }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Imagen demasiado grande (máx 10MB)' }, { status: 413 });
    }

    const outForm = new FormData();
    outForm.append('image_file', file, 'image.png');
    outForm.append('size', 'auto');

    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: outForm,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => String(res.status));
      console.error('[remove-bg] provider error:', res.status, errText.slice(0, 500));
      return NextResponse.json({ error: 'No se pudo procesar la imagen. Inténtalo de nuevo.' }, { status: 502 });
    }

    const png = await res.arrayBuffer();
    return new NextResponse(png, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[remove-bg]', err);
    return NextResponse.json({ error: 'Error interno. Inténtalo de nuevo.' }, { status: 500 });
  }
}
