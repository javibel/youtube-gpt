import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';

// ── Helpers ────────────────────────────────────────────────────────────────

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

  // Plan check
  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  // YouTube token
  const token = await getAccessToken(session.user.id);
  if (!token) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const { videoId, variantA, variantB, hoursPerVariant = 48 } = await req.json();

  if (!videoId || !variantA || !variantB) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Check no active test for this specific video
  const active = await prisma.abTest.findFirst({
    where: {
      userId: session.user.id,
      videoId,
      status: { in: ['variant_a', 'variant_b'] },
    },
  });
  if (active) {
    return NextResponse.json({ error: 'active_test_exists' }, { status: 400 });
  }

  // Limit concurrent active tests based on plan
  const maxTests = getLimits(plan).abTestsSimultaneous;
  const activeCount = await prisma.abTest.count({
    where: {
      userId: session.user.id,
      status: { in: ['variant_a', 'variant_b'] },
    },
  });
  if (activeCount >= maxTests) {
    return NextResponse.json({ error: 'max_active_tests' }, { status: 400 });
  }

  // Fetch current video data
  const video = await fetchVideoSnippet(token, videoId);
  if (!video) {
    return NextResponse.json({ error: 'video_not_found' }, { status: 404 });
  }

  const originalTitle = video.snippet.title;
  const categoryId = video.snippet.categoryId;
  const thumbnail = video.snippet.thumbnails?.medium?.url ?? null;
  const initialViews = parseInt(video.statistics?.viewCount ?? '0', 10);

  // Set variant A title on YouTube
  const result = await updateVideoTitle(token, videoId, variantA, categoryId);
  if (!result.ok) {
    if (result.status === 403) {
      return NextResponse.json({ error: 'youtube_reconnect_required' }, { status: 403 });
    }
    return NextResponse.json(
      { error: `YouTube API error: ${result.error}` },
      { status: 500 },
    );
  }

  // Create test record
  const hours = Math.max(12, Math.min(168, hoursPerVariant));
  const test = await prisma.abTest.create({
    data: {
      userId: session.user.id,
      videoId,
      thumbnail,
      originalTitle,
      variantA,
      variantB,
      hoursPerVariant: hours,
      initialViews,
    },
  });

  return NextResponse.json({ test }, { status: 201 });
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
