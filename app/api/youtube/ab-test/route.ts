import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { createAbTest } from '@/lib/ab-test';

// ── Helpers ────────────────────────────────────────────────────────────────
// fetchVideoSnippet/updateVideoTitle usados por PATCH (cancel/apply_winner)
// viven en lib/ab-test.ts para POST; PATCH los necesita también, así que se
// mantiene una copia mínima local hasta que PATCH se extraiga (fuera de
// alcance de esta spec — solo tocamos POST).

async function fetchVideoSnippet(token: string, videoId: string) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  return data.items?.[0] ?? null;
}

async function updateVideoTitle(
  token: string,
  videoId: string,
  newTitle: string,
  categoryId: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/videos?part=snippet',
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: videoId,
        snippet: { title: newTitle, categoryId },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, error: text };
  }
  return { ok: true, status: res.status };
}

// ── GET — list tests ───────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tests = await prisma.abTest.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({ tests });
}

// ── POST — create new test ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const result = await createAbTest(session.user.id, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, limit: result.limit }, { status: result.status });
  }
  return NextResponse.json({ test: result.test }, { status: 201 });
}

// ── PATCH — cancel test / apply winner ─────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { testId, action } = await req.json();
  if (!testId || !action) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const test = await prisma.abTest.findFirst({
    where: { id: testId, userId: session.user.id },
  });
  if (!test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  }

  const token = await getAccessToken(session.user.id);

  if (action === 'cancel') {
    // Restore original title
    if (token && (test.status === 'variant_a' || test.status === 'variant_b')) {
      const video = await fetchVideoSnippet(token, test.videoId);
      if (video) {
        await updateVideoTitle(token, test.videoId, test.originalTitle, video.snippet.categoryId);
      }
    }

    await prisma.abTest.update({
      where: { id: testId },
      data: { status: 'cancelled', completedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  }

  if (action === 'apply_winner' && test.status === 'completed' && test.winner && token) {
    const winningTitle = test.winner === 'A' ? test.variantA : test.variantB;
    const video = await fetchVideoSnippet(token, test.videoId);
    if (video) {
      await updateVideoTitle(token, test.videoId, winningTitle, video.snippet.categoryId);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
