import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { randomUUID } from 'node:crypto';

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

type CreationAdmission =
  | { denied: 'active_test_exists' | 'max_active_tests' | 'uncertain' }
  | { row: Awaited<ReturnType<typeof prisma.abTestCreationAttempt.create>> };

export async function createAbTest(
  userId: string,
  input: { videoId?: string; variantA?: string; variantB?: string; hoursPerVariant?: number },
  beforeStep?: () => void,
): Promise<CreateAbTestResult> {
  const uncertain = (): CreateAbTestResult => ({ ok: false, status: 503, error: 'ab_creation_unconfirmed' });
  try {
    if (!input || typeof input !== 'object') return { ok: false, status: 400, error: 'Missing fields' };
    const { videoId, variantA, variantB, hoursPerVariant = 48 } = input;
    beforeStep?.();
    const plan = await getUserPlan(userId);
    beforeStep?.();
    if (!isPaid(plan)) {
      return { ok: false, status: 403, error: 'pro_required' };
    }

    const token = await getAccessToken(userId, beforeStep);
    beforeStep?.();
    if (!token) {
      return { ok: false, status: 400, error: 'youtube_not_connected' };
    }

    if (typeof videoId !== 'string' || !videoId.trim() || typeof variantA !== 'string' || !variantA.trim()
      || typeof variantB !== 'string' || !variantB.trim() || typeof hoursPerVariant !== 'number' || !Number.isFinite(hoursPerVariant)) {
      return { ok: false, status: 400, error: 'Missing fields' };
    }

    const active = await prisma.abTest.findFirst({
      where: { userId, videoId, status: { in: ['variant_a', 'variant_b'] } },
    });
    beforeStep?.();
    if (active) {
      return { ok: false, status: 400, error: 'active_test_exists' };
    }

    const maxTests = getLimits(plan).abTestsSimultaneous;
    const activeCount = await prisma.abTest.count({
      where: { userId, status: { in: ['variant_a', 'variant_b'] } },
    });
    beforeStep?.();
    if (activeCount >= maxTests) {
      return { ok: false, status: 400, error: 'max_active_tests', limit: maxTests };
    }

    const video = await fetchVideoSnippet(token, videoId);
    beforeStep?.();
    if (!video) {
      return { ok: false, status: 404, error: 'video_not_found' };
    }

    const originalTitle = video.snippet.title;
    const categoryId = video.snippet.categoryId;
    const thumbnail = video.snippet.thumbnails?.medium?.url ?? null;
    const initialViews = parseInt(video.statistics?.viewCount ?? '0', 10);
    if (typeof originalTitle !== 'string' || typeof categoryId !== 'string' || !categoryId.trim()
      || !Number.isSafeInteger(initialViews) || initialViews < 0) return uncertain();
    const hours = Math.max(12, Math.min(168, hoursPerVariant));
    if (!Number.isInteger(hours)) return { ok: false, status: 400, error: 'Missing fields' };

    // Earlier reads are only preflight. This fresh, acknowledged transaction
    // reserves capacity under the owner lock before any title write can start.
    // Only this live invocation may use its acknowledgement; a row/id/clock
    // never authorizes execution, takeover, retry or release after uncertainty.
    const id = randomUUID();
    beforeStep?.();
    const admission = await prisma.$transaction(async (tx): Promise<CreationAdmission> => {
      beforeStep?.();
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      beforeStep?.();
      if (owner.length !== 1 || owner[0].id !== userId) throw Error('Admission unavailable');
      const existing = await tx.abTest.findFirst({ where: { userId, videoId, status: { in: ['variant_a', 'variant_b'] } } });
      beforeStep?.();
      if (existing) return { denied: 'active_test_exists' as const };
      const pending = await tx.abTestCreationAttempt.findFirst({ where: { userId, videoId, state: { not: 'complete' } } });
      beforeStep?.();
      if (pending) return { denied: 'uncertain' as const };
      const activeCount = await tx.abTest.count({ where: { userId, status: { in: ['variant_a', 'variant_b'] } } });
      beforeStep?.();
      const pendingCount = await tx.abTestCreationAttempt.count({ where: { userId, state: { not: 'complete' } } });
      beforeStep?.();
      if (![activeCount, pendingCount, activeCount + pendingCount].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('Capacity unavailable');
      if (activeCount + pendingCount >= maxTests) return { denied: 'max_active_tests' as const };
      const row = await tx.abTestCreationAttempt.create({ data: { id, userId, videoId, state: 'pending' } });
      beforeStep?.();
      return { row };
    }, { maxWait: 10_000, timeout: 15_000 });
    if ('denied' in admission) {
      if (admission.denied === 'uncertain') return uncertain();
      return { ok: false, status: 400, error: admission.denied, ...(admission.denied === 'max_active_tests' ? { limit: maxTests } : {}) };
    }
    if (admission.row.id !== id || admission.row.userId !== userId || admission.row.videoId !== videoId || admission.row.state !== 'pending') return uncertain();

    beforeStep?.();
    // Once the original title write starts, its SQL record and result remain
    // part of that producer, even if the HTTP waiter retires in the meantime.
    const result = await updateVideoTitle(token, videoId, variantA, categoryId);
    if (!result.ok) {
      if (result.status === 403) {
        return { ok: false, status: 403, error: 'youtube_reconnect_required' };
      }
      return { ok: false, status: 500, error: 'ab_creation_unconfirmed' };
    }

    // Title and database are not atomic. Its original producer keeps this
    // completion even after HTTP retires. Failure leaves the reservation held;
    // there is no exported recover/release API and no database-based reclaim.
    const test = await prisma.$transaction(async tx => {
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      if (owner.length !== 1 || owner[0].id !== userId) throw Error('Completion unavailable');
      const pending = await tx.abTestCreationAttempt.findUnique({ where: { id } });
      if (!pending || pending.userId !== userId || pending.videoId !== videoId || pending.state !== 'pending') throw Error('Completion unavailable');
      const created = await tx.abTest.create({
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
      const completed = await tx.abTestCreationAttempt.updateMany({ where: { id, userId, videoId, state: 'pending' }, data: { state: 'complete', testId: created.id } });
      if (completed.count !== 1) throw Error('Completion unavailable');
      return created;
    }, { maxWait: 10_000, timeout: 15_000 });

    return { ok: true, status: 201, test };
  } catch { return uncertain(); }
}

export async function countActiveAbTests(userId: string): Promise<number> {
  return prisma.abTest.count({
    where: { userId, status: { in: ['variant_a', 'variant_b'] } },
  });
}
