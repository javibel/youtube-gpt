import { observeAbWindows } from '@/lib/ab-observation';
import { captureAbTitleMetadata,readAbVideoOriginal,publishAbTitleOriginal,reportedAbViews } from '@/lib/ab-title-metadata';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, getLimits, isPaid, type PlanType } from '@/lib/plans';
import { randomUUID } from 'node:crypto';

// Extraída de app/api/youtube/ab-test/route.ts (POST) para que la ruta web
// (sesión NextAuth) y la ruta de extensión (token propio) compartan la
// misma lógica — dos copias que escriben títulos en YouTube divergirían mal.

export type CreateAbTestResult =
  | { ok: true; status: 201; test: Awaited<ReturnType<typeof prisma.abTest.create>> }
  | { ok: false; status: number; error: string; limit?: number };

type CreationAdmission =
  | { denied: 'active_test_exists' | 'max_active_tests' | 'uncertain' }
  | { row: Awaited<ReturnType<typeof prisma.abTestCreationAttempt.create>> };

// Optional native extension checks supplement the common producer. The key
// is negative exclusion only; neither it nor an attempt row grants execution.
export type AbCreationNativeGuard = {
  attemptId: string;
  check: (tx: Prisma.TransactionClient, plan: PlanType, youtubeToken?: string) => Promise<void>;
  admitted: () => void;
  // Only a live native HTTP closure supplies its already checked sources.
  // This does not replace the fresh durable reservation/dispatch ACK below.
  prepare?: () => Promise<{ plan: PlanType; token: string; video: Record<string, unknown> }>;
};

export async function createAbTest(
  userId: string,
  input: { videoId?: string; variantA?: string; variantB?: string; hoursPerVariant?: number },
  beforeStep?: () => void,
  nativeGuard?: AbCreationNativeGuard,
): Promise<CreateAbTestResult> {
  const uncertain = (): CreateAbTestResult => ({ ok: false, status: 503, error: 'ab_creation_unconfirmed' });
  try {
    if (!input || typeof input !== 'object') return { ok: false, status: 400, error: 'Missing fields' };
    const { videoId, variantA, variantB, hoursPerVariant = 48 } = input;
    beforeStep?.();
    const prepared = nativeGuard?.prepare ? await nativeGuard.prepare() : undefined;
    beforeStep?.();
    const plan = prepared ? prepared.plan : await getUserPlan(userId);
    beforeStep?.();
    if (!isPaid(plan)) {
      return { ok: false, status: 403, error: 'pro_required' };
    }

    if (nativeGuard) await prisma.$transaction(tx => nativeGuard.check(tx, plan), { maxWait: 10_000, timeout: 15_000 });
    beforeStep?.();

    const token = prepared ? prepared.token : await getAccessToken(userId, beforeStep);
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

    const video = prepared ? prepared.video : await readAbVideoOriginal(token, videoId);
    beforeStep?.();
    if (!video) {
      return { ok: false, status: 404, error: 'video_not_found' };
    }

    const payload=captureAbTitleMetadata(video,videoId,variantA),snippet=video.snippet as Record<string,unknown>;
    const originalTitle=snippet.title as string;
    const thumbs=snippet.thumbnails as {medium?:{url?:unknown}}|undefined,candidate=thumbs?.medium?.url;
    const thumbnail=typeof candidate==='string'&&candidate.length<=2048&&candidate.startsWith('https://i.ytimg.com/vi/'+videoId+'/')?candidate:null;
    const initialViews=reportedAbViews(video);if(initialViews===null)return uncertain();
    const hours = Math.max(12, Math.min(168, hoursPerVariant));
    if (!Number.isInteger(hours)) return { ok: false, status: 400, error: 'Missing fields' };

    // Earlier reads are only preflight. This fresh, acknowledged transaction
    // reserves capacity under the owner lock before any title write can start.
    // Only this live invocation may use its acknowledgement; a row/id/clock
    // never authorizes execution, takeover, retry or release after uncertainty.
    const id = nativeGuard?.attemptId ?? randomUUID();
    beforeStep?.();
    const admission = await prisma.$transaction(async (tx): Promise<CreationAdmission> => {
      beforeStep?.();
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      beforeStep?.();
      if (owner.length !== 1 || owner[0].id !== userId) throw Error('Admission unavailable');
      if (nativeGuard) {
        await nativeGuard.check(tx, plan, token);
        beforeStep?.();
        const duplicate = await tx.abTestCreationAttempt.findUnique({ where: { id } });
        beforeStep?.();
        if (duplicate) return { denied: 'uncertain' as const };
      }
      const existing = await tx.abTest.findFirst({ where: { userId, videoId, status: { in: ['variant_a', 'variant_b'] } } });
      beforeStep?.();
      if (existing) return { denied: 'active_test_exists' as const };
      const pending = await tx.abTestCreationAttempt.findFirst({ where: { userId, videoId, state: { not: 'complete' } } });
      beforeStep?.();
      if (pending) return { denied: 'uncertain' as const };
      const mutation = await tx.abTestMutationAttempt.findFirst({ where: { userId, videoId, state: { not: 'complete' } } });
      beforeStep?.();
      if (mutation) return { denied: 'uncertain' as const };
      const optimization = await tx.optimizeUpdateAttempt.findFirst({ where: { userId, videoId, state: { not: 'complete' } } });
      beforeStep?.();
      if (optimization) return { denied: 'uncertain' as const };
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
    nativeGuard?.admitted();

    beforeStep?.();
    if (nativeGuard) {
      // Recheck the same credential/plan/channel immediately before dispatch.
      // This acknowledged transaction cannot recover another title producer.
      await prisma.$transaction(async tx => {
        const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
        beforeStep?.();
        if (owner.length !== 1 || owner[0].id !== userId) throw Error('Dispatch unavailable');
        await nativeGuard.check(tx, plan, token);
        beforeStep?.();
      }, { maxWait: 10_000, timeout: 15_000 });
      beforeStep?.();
    }
    // Once the original title write starts, its SQL record and result remain
    // part of that producer, even if the HTTP waiter retires in the meantime.
    const result = await publishAbTitleOriginal(token, payload);
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
      // A native extension original checks its response against the Node clock.
      // PostgreSQL's clock can be a few milliseconds ahead even on this host.
      // Capture a date only for this new row, in the original title producer;
      // never redate an existing test or derive execution rights from a date.
      const startedAt = nativeGuard ? new Date(Date.now()) : undefined;
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
          ...(startedAt ? { startedAt } : {}),
        },
      });
      if (startedAt && (!(created.startedAt instanceof Date) || created.startedAt.getTime() !== startedAt.getTime())) {
        throw Error('Completion date ACK unavailable');
      }
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

export type AbMutationNativeGuard={attemptId:string;check:(tx:Prisma.TransactionClient)=>Promise<void>;admitted:()=>void};

type MutationTest = NonNullable<Awaited<ReturnType<typeof prisma.abTest.findFirst>>>;
type MutationAdmission =
  | { ok: false }
  | { ok: true; complete: () => Promise<MutationTest> };

type Transition =
  | { action: 'switch_variant'; at: Date; views: number }
  | { action: 'complete_test'; at: Date; views: number; winner: 'A' | 'B' | 'tie' };

export function beginAbTestTransition(userId: string, expected: MutationTest, transition: Transition, beforeStep?: () => void): Promise<MutationAdmission> {
  return admitMutation(userId, expected, transition.action, beforeStep, transition);
}

// Only a fresh, acknowledged reservation returns a live completion closure.
// It cannot be serialized, retrieved by id, reconstituted or handed over.
export function beginAbTestMutation(
  userId: string,
  expected: MutationTest,
  action: 'cancel' | 'apply_winner',
  beforeStep?: () => void,
  nativeGuard?: AbMutationNativeGuard,
): Promise<MutationAdmission> {
  return admitMutation(userId, expected, action, beforeStep, undefined, nativeGuard);
}

async function admitMutation(
  userId: string,
  expected: MutationTest,
  action: 'cancel' | 'apply_winner' | 'switch_variant' | 'complete_test',
  beforeStep?: () => void,
  transition?: Transition,
  nativeGuard?: AbMutationNativeGuard,
): Promise<MutationAdmission> {
  try {
    const test = { ...expected, startedAt: expected.startedAt && new Date(expected.startedAt.getTime()),
      switchedAt: expected.switchedAt && new Date(expected.switchedAt.getTime()), completedAt: expected.completedAt && new Date(expected.completedAt.getTime()) };
    if (test.userId !== userId || !test.videoId || test.status === 'cancelled') return { ok: false };
    if (action === 'apply_winner' && (test.status !== 'completed' || !(nativeGuard ? ['A','B','tie'] : ['A','B']).includes(test.winner ?? ''))) return { ok: false };
    // Capture transition inputs before any await; they are business data, never
    // an identifier that can resume a pending original invocation.
    const change = transition && { ...transition, at: new Date(transition.at.getTime()) };
    if (action === 'switch_variant' || action === 'complete_test') {
      if (!change || change.action !== action || !Number.isFinite(change.at.getTime()) || !Number.isSafeInteger(change.views)
        || change.views < 0 || change.views > 2_147_483_647 || !Number.isSafeInteger(test.initialViews) || test.initialViews < 0
        || !Number.isSafeInteger(test.hoursPerVariant) || test.hoursPerVariant <= 0) return { ok: false };
      const start = action === 'switch_variant' ? test.startedAt : test.switchedAt;
      if (!start || !Number.isFinite(start.getTime()) || change.at.getTime() < start.getTime() + test.hoursPerVariant * 3600_000) return { ok: false };
      if (action === 'switch_variant' ? test.status !== 'variant_a' || change.views < test.initialViews
        : test.status !== 'variant_b' || !Number.isSafeInteger(test.switchViews) || test.switchViews! < test.initialViews || change.views < test.switchViews!) return { ok: false };
      if (change.action === 'complete_test') {
        const observation = observeAbWindows({ ...test, endViews: change.views, completedAt: change.at });
        if (!observation || change.winner !== observation.leadingWindow) return { ok: false };
      }
    }
    const fields = ['id', 'userId', 'videoId', 'status', 'winner', 'originalTitle', 'variantA', 'variantB', 'hoursPerVariant', 'initialViews', 'switchViews', 'endViews'] as const;
    const dates = ['startedAt', 'switchedAt', 'completedAt'] as const;
    const unchanged = (row: MutationTest | null) => row !== null && fields.every(field => row[field] === test[field])
      && dates.every(field => row[field]?.getTime() === test[field]?.getTime());
    const id = nativeGuard?.attemptId ?? randomUUID();
    beforeStep?.();
    const reserved = await prisma.$transaction(async tx => {
      beforeStep?.();
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      beforeStep?.();
      if (owner.length !== 1 || owner[0].id !== userId) throw Error('Mutation unavailable');
      if(nativeGuard){await nativeGuard.check(tx);beforeStep?.();}
      const current = await tx.abTest.findFirst({ where: { id: test.id, userId } });
      beforeStep?.();
      if (!unchanged(current)) return null;
      const other = await tx.abTest.findFirst({ where: { userId, videoId: test.videoId, id: { not: test.id }, status: { in: ['variant_a', 'variant_b'] } } });
      beforeStep?.();
      if (other) return null;
      const creation = await tx.abTestCreationAttempt.findFirst({ where: { userId, videoId: test.videoId, state: { not: 'complete' } } });
      beforeStep?.();
      if (creation) return null;
      const pending = await tx.abTestMutationAttempt.findFirst({ where: { userId, videoId: test.videoId, state: { not: 'complete' } } });
      beforeStep?.();
      if (pending) return null;
      const optimization = await tx.optimizeUpdateAttempt.findFirst({ where: { userId, videoId: test.videoId, state: { not: 'complete' } } });
      beforeStep?.();
      if (optimization) return null;
      if (action === 'apply_winner') {
        const applied = await tx.abTestMutationAttempt.findFirst({ where: { userId, testId: test.id, action: { in: ['apply_winner', 'complete_test'] }, state: 'complete' } });
        beforeStep?.();
        if (applied) return null;
      }
      const row = await tx.abTestMutationAttempt.create({ data: { id, userId, videoId: test.videoId, testId: test.id, action, state: 'pending' } });
      beforeStep?.();
      return row;
    }, { maxWait: 10_000, timeout: 15_000 });
    if (!reserved || reserved.id !== id || reserved.userId !== userId || reserved.videoId !== test.videoId
      || reserved.testId !== test.id || reserved.action !== action || reserved.state !== 'pending') return { ok: false };
    nativeGuard?.admitted();
    beforeStep?.();
    if(nativeGuard){await prisma.$transaction(async tx=>{
      const owner=await tx.$queryRawUnsafe<Array<{id:string}>>('SELECT id FROM users WHERE id=$1 FOR UPDATE',userId);
      beforeStep?.();if(owner.length!==1||owner[0].id!==userId)throw Error('Dispatch unavailable');
      await nativeGuard.check(tx);beforeStep?.();
    },{maxWait:10000,timeout:15000});beforeStep?.();}
    return { ok: true, complete: () => {
      return prisma.$transaction(async tx => {
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      if (owner.length !== 1 || owner[0].id !== userId) throw Error('Completion unavailable');
      const pending = await tx.abTestMutationAttempt.findUnique({ where: { id } });
      if (!pending || pending.userId !== userId || pending.videoId !== test.videoId || pending.testId !== test.id
        || pending.action !== action || pending.state !== 'pending') throw Error('Completion unavailable');
      const current = await tx.abTest.findFirst({ where: { id: test.id, userId } });
      if (!unchanged(current)) throw Error('Completion unavailable');
      const result = action === 'cancel' ? await tx.abTest.update({ where: { id: test.id }, data: { status: 'cancelled', completedAt: nativeGuard ? new Date(Date.now()) : new Date() } })
        : change?.action === 'switch_variant' ? await tx.abTest.update({ where: { id: test.id }, data: { status: 'variant_b', switchedAt: change.at, switchViews: change.views } })
        : change?.action === 'complete_test' ? await tx.abTest.update({ where: { id: test.id }, data: { status: 'completed', completedAt: change.at, endViews: change.views, winner: change.winner } }) : test;
      const completed = await tx.abTestMutationAttempt.updateMany({ where: { id, userId, testId: test.id, action, state: 'pending' }, data: { state: 'complete' } });
      if (completed.count !== 1) throw Error('Completion unavailable');
      return result;
    }, { maxWait: 10_000, timeout: 15_000 }); } };
  } catch { return { ok: false }; }
}
