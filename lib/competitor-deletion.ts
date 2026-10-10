import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';

type Result = { ok: true; userId: string; id: string; deleted: true }
  | { ok: false; status: 404 | 503; error: string };
const uncertain = (): Result => ({ ok: false, status: 503, error: 'competitor_delete_unconfirmed' });

// Fresh admission only. This original invocation retains its completion;
// stored rows, ids, dates and GET results never return a recovered producer.
export async function deleteTrackedCompetitor(userId: string, competitorId: string, beforeStep: () => void): Promise<Result> {
  const id = randomUUID();
  try {
    beforeStep();
    const reserved = await prisma.$transaction(async tx => {
      beforeStep();
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      beforeStep();
      if (owner.length !== 1 || owner[0].id !== userId) throw Error('Admission unavailable');
      const old = await tx.competitorDeletionAttempt.findUnique({ where: { userId_competitorId: { userId, competitorId } } });
      beforeStep();
      if (old) return { denied: true as const };
      const row = await tx.trackedCompetitor.findFirst({ where: { id: competitorId, userId } });
      beforeStep();
      if (!row) return { missing: true as const };
      const selected = { id: row.id, userId: row.userId, channelId: row.channelId, addedAt: new Date(row.addedAt.getTime()) };
      const attempt = await tx.competitorDeletionAttempt.create({ data: { id, userId, competitorId, state: 'pending' } });
      beforeStep();
      return { attempt, selected };
    }, { maxWait: 10_000, timeout: 15_000 });
    if ('denied' in reserved) return uncertain();
    if ('missing' in reserved) return { ok: false, status: 404, error: 'not_found' };
    if (reserved.attempt.id !== id || reserved.attempt.userId !== userId || reserved.attempt.competitorId !== competitorId || reserved.attempt.state !== 'pending') return uncertain();
    const selected = reserved.selected;
    beforeStep();
    await prisma.$transaction(async tx => {
      beforeStep();
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      beforeStep();
      if (owner.length !== 1 || owner[0].id !== userId) throw Error('Deletion unavailable');
      const attempt = await tx.competitorDeletionAttempt.findUnique({ where: { id } });
      beforeStep();
      if (!attempt || attempt.userId !== userId || attempt.competitorId !== competitorId || attempt.state !== 'pending') throw Error('Deletion unavailable');
      const row = await tx.trackedCompetitor.findFirst({ where: { id: competitorId, userId } });
      beforeStep();
      if (!row || row.channelId !== selected.channelId || row.addedAt.getTime() !== selected.addedAt.getTime()) throw Error('Selection changed');
      // No caller guard after the write starts: the original deletion and its
      // completion marker commit atomically, even when HTTP has retired.
      const removed = await tx.trackedCompetitor.deleteMany({ where: { id: competitorId, userId, channelId: selected.channelId, addedAt: selected.addedAt } });
      if (removed.count !== 1) throw Error('Deletion unconfirmed');
      const complete = await tx.competitorDeletionAttempt.updateMany({ where: { id, userId, competitorId, state: 'pending' }, data: { state: 'complete' } });
      if (complete.count !== 1) throw Error('Deletion unconfirmed');
    }, { maxWait: 10_000, timeout: 15_000 });
    return { ok: true, userId, id: competitorId, deleted: true };
  } catch { return uncertain(); }
}
