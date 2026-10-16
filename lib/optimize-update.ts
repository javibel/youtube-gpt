import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

type Entry = { field: string; oldValue: string; newValue: string; scoreBefore: number; scoreAfter: number; viewsBefore: number | null };
type Admission = { ok: false; error: 'unconfirmed' | 'youtube_not_connected' }
  | { ok: true; complete: (entries: Entry[]) => Promise<void> };
const identity = (s: string) => typeof s === 'string' && /^[\w-]{1,128}$/.test(s);

// No identifier lookup can return this closure. Admission acknowledgement must
// arrive on this same live invocation, within its original HTTP budget.
export async function beginOptimizeUpdate(userId: string, videoId: string, key: string, beforeStep: () => void, nativeCheck?: (tx: Prisma.TransactionClient) => Promise<void>): Promise<Admission> {
  try {
    if (!identity(userId) || !identity(videoId) || !identity(key)) return { ok: false, error: 'unconfirmed' };
    const id = randomUUID();
    beforeStep();
    const reserved = await prisma.$transaction(async tx => {
      beforeStep();
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      beforeStep(); if (owner.length !== 1 || owner[0].id !== userId) throw Error('Admission unavailable');
      if(nativeCheck) await nativeCheck(tx); beforeStep();
      const previous = await tx.optimizeUpdateAttempt.findFirst({ where: { userId, OR: [{ key }, { videoId, state: { not: 'complete' } }] } });
      beforeStep(); if (previous) return null;
      const active = await tx.abTest.findFirst({ where: { userId, videoId, status: { in: ['variant_a', 'variant_b'] } } });
      beforeStep(); if (active) return null;
      const creation = await tx.abTestCreationAttempt.findFirst({ where: { userId, videoId, state: { not: 'complete' } } });
      beforeStep(); if (creation) return null;
      const mutation = await tx.abTestMutationAttempt.findFirst({ where: { userId, videoId, state: { not: 'complete' } } });
      beforeStep(); if (mutation) return null;
      // Read-only preflight avoids reserving a knowingly disconnected operation;
      // OAuth itself can start only after this fresh admission is acknowledged.
      const token = await tx.youtubeToken.findUnique({ where: { userId }, select: { accessToken: true, refreshToken: true } });
      beforeStep(); if (!token || (!token.accessToken && !token.refreshToken)) return { disconnected: true as const };
      const row = await tx.optimizeUpdateAttempt.create({ data: { id, userId, videoId, key, state: 'pending' } });
      beforeStep(); return row;
    }, { maxWait: 10_000, timeout: 15_000 });
    if (reserved && 'disconnected' in reserved) return { ok: false, error: 'youtube_not_connected' };
    if (!reserved || reserved.id !== id || reserved.userId !== userId || reserved.videoId !== videoId || reserved.key !== key || reserved.state !== 'pending') return { ok: false, error: 'unconfirmed' };
    beforeStep();
    let originalCompletion: Promise<void> | undefined;
    return { ok: true, complete: entries => {
      // At most one original completion even if its caller invokes this closure
      // twice. A failed/lost acknowledgement never permits a second transaction.
      if (originalCompletion) return originalCompletion;
      const captured = entries.map(e => ({ ...e }));
      originalCompletion = Promise.resolve().then(async () => {
        const fields = new Set<string>();
        if (captured.length > 3) throw Error('Completion unavailable');
        for (const e of captured) {
          if (!['title', 'description', 'tags'].includes(e.field) || fields.has(e.field)
            || typeof e.oldValue !== 'string' || typeof e.newValue !== 'string' || e.oldValue.length > 50_000 || e.newValue.length > 50_000
            || [e.scoreBefore, e.scoreAfter].some(v => !Number.isSafeInteger(v) || v < 0 || v > 100)
            || (e.viewsBefore !== null && (!Number.isSafeInteger(e.viewsBefore) || e.viewsBefore < 0 || e.viewsBefore > 2_147_483_647))) throw Error('Completion unavailable');
          fields.add(e.field);
        }
        await prisma.$transaction(async tx => {
          const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
          if (owner.length !== 1 || owner[0].id !== userId) throw Error('Completion unavailable');
          const pending = await tx.optimizeUpdateAttempt.findUnique({ where: { id } });
          if (!pending || pending.userId !== userId || pending.videoId !== videoId || pending.key !== key || pending.state !== 'pending') throw Error('Completion unavailable');
          if (captured.length) {
            const saved = await tx.optimizeHistory.createMany({ data: captured.map(e => ({ ...e, userId, videoId })) });
            if (saved.count !== captured.length) throw Error('Completion unavailable');
          }
          const done = await tx.optimizeUpdateAttempt.updateMany({ where: { id, userId, videoId, key, state: 'pending' }, data: { state: 'complete' } });
          if (done.count !== 1) throw Error('Completion unavailable');
        }, { maxWait: 10_000, timeout: 15_000 });
      });
      return originalCompletion;
    } };
  } catch { return { ok: false, error: 'unconfirmed' }; }
}
