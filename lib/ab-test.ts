import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';

// Extraída de app/api/youtube/ab-test/route.ts (POST) para que la ruta web
// (sesión NextAuth) y la ruta de extensión (token propio) compartan la
// misma lógica — dos copias que escriben títulos en YouTube divergirían mal.

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

export type CreateAbTestResult =
  | { ok: true; status: 201; test: Awaited<ReturnType<typeof prisma.abTest.create>> }
  | { ok: false; status: number; error: string; limit?: number };

export async function createAbTest(
  userId: string,
  input: { videoId?: string; variantA?: string; variantB?: string; hoursPerVariant?: number },
): Promise<CreateAbTestResult> {
  const plan = await getUserPlan(userId);
  if (!isPaid(plan)) {
    return { ok: false, status: 403, error: 'pro_required' };
  }

  const token = await getAccessToken(userId);
  if (!token) {
    return { ok: false, status: 400, error: 'youtube_not_connected' };
  }

  const { videoId, variantA, variantB, hoursPerVariant = 48 } = input;
  if (!videoId || !variantA || !variantB) {
    return { ok: false, status: 400, error: 'Missing fields' };
  }

  const active = await prisma.abTest.findFirst({
    where: { userId, videoId, status: { in: ['variant_a', 'variant_b'] } },
  });
  if (active) {
    return { ok: false, status: 400, error: 'active_test_exists' };
  }

  const maxTests = getLimits(plan).abTestsSimultaneous;
  const activeCount = await prisma.abTest.count({
    where: { userId, status: { in: ['variant_a', 'variant_b'] } },
  });
  if (activeCount >= maxTests) {
    return { ok: false, status: 400, error: 'max_active_tests', limit: maxTests };
  }

  const video = await fetchVideoSnippet(token, videoId);
  if (!video) {
    return { ok: false, status: 404, error: 'video_not_found' };
  }

  const originalTitle = video.snippet.title;
  const categoryId = video.snippet.categoryId;
  const thumbnail = video.snippet.thumbnails?.medium?.url ?? null;
  const initialViews = parseInt(video.statistics?.viewCount ?? '0', 10);

  const result = await updateVideoTitle(token, videoId, variantA, categoryId);
  if (!result.ok) {
    if (result.status === 403) {
      return { ok: false, status: 403, error: 'youtube_reconnect_required' };
    }
    return { ok: false, status: 500, error: `YouTube API error: ${result.error}` };
  }

  const hours = Math.max(12, Math.min(168, hoursPerVariant));
  const test = await prisma.abTest.create({
    data: {
      userId,
      videoId,
      thumbnail,
      originalTitle,
      variantA,
      variantB,
      hoursPerVariant: hours,
      initialViews,
    },
  });

  return { ok: true, status: 201, test };
}

export async function countActiveAbTests(userId: string): Promise<number> {
  return prisma.abTest.count({
    where: { userId, status: { in: ['variant_a', 'variant_b'] } },
  });
}
