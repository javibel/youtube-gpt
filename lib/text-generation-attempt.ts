import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { thumbnailQuota } from '@/lib/image/thumbnail-quota';
import type { Prisma } from '@prisma/client';

export type TextGenerationResult = { content: string; truncated: boolean; history: {
  template: string; inputs: Prisma.InputJsonValue; output: string; tokensUsed: number; ipAddress: string | null;
} };

// Every keyless HTTP call is a distinct operation. Only a fresh, acknowledged
// admission permits this live closure to run. No lookup/reset/TTL can reclaim it.
export async function unkeyedTextGeneration(userId: string, signal: AbortSignal,
  execute: () => Promise<Response | TextGenerationResult>) {
  return runTextGeneration(userId, 'text_generation_' + randomUUID(), signal, execute, false);
}

// The prefix classifies freshly admitted Storyboard quota; it never grants
// recovery authority. Every call creates a new random operation.
export async function unkeyedStoryboardGeneration(userId: string, signal: AbortSignal,
  execute: () => Promise<Response | TextGenerationResult>) {
  return runTextGeneration(userId, 'storyboard_generation_' + randomUUID(), signal, execute, true);
}

async function runTextGeneration(userId: string, id: string, signal: AbortSignal,
  execute: () => Promise<Response | TextGenerationResult>, storyboard: boolean) {
  const uncertain = (status = 503) => Response.json({ error: 'Generation unconfirmed', code: 'text_result_unconfirmed',
    retryMayConsume: true }, { status, headers: { 'Cache-Control': 'no-store' } });
  let result: TextGenerationResult | null = null;
  let admittedAt: Date | null = null;
  try {
    if (signal.aborted) return uncertain();
    const admission = await prisma.$transaction(async tx => {
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      if (owner.length !== 1 || owner[0].id !== userId || signal.aborted) throw Error('Admission unavailable');
      const plan = await getUserPlan(userId);
      const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
      const quota = await thumbnailQuota(tx, userId, month);
      if (quota.total >= getLimits(plan).generationsPerMonth) return null;
      if (storyboard && !isPaid(plan)) {
        const recorded = await tx.generation.count({ where: { userId, template: 'video_preview', createdAt: { gte: month } } });
        const pending = await tx.textGenerationAttempt.count({ where: { userId, createdAt: { gte: month },
          state: { not: 'complete' }, id: { startsWith: 'storyboard_generation_' } } });
        if (![recorded, pending, recorded + pending].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('Video Tips quota unavailable');
        if (recorded + pending >= 1) return Response.json({ error: 'Ya usaste tu Video Tips gratis este mes',
          limitReached: true, videoTipsCapped: true }, { status: 429 });
      }
      return tx.textGenerationAttempt.create({ data: { id, userId, state: 'pending' } });
    }, { maxWait: 10_000, timeout: 15_000 });
    if (admission instanceof Response) return admission;
    if (!admission) return Response.json({ error: 'Límite del plan alcanzado', limitReached: true }, { status: 429 });
    if (admission.id !== id || admission.userId !== userId || admission.state !== 'pending'
      || !Number.isFinite(admission.createdAt?.getTime())) return uncertain();
    admittedAt = admission.createdAt;
    if (signal.aborted) return uncertain();
    const produced = await execute();
    if (produced instanceof Response) return produced; // Retain uncertainty; never infer release authority.
    result = produced;
    if (typeof result.content !== 'string' || !result.content.trim() || typeof result.truncated !== 'boolean'
      || (storyboard && (result.history.template !== 'video_preview' || result.truncated))
      || typeof result.history.output !== 'string' || !result.history.output.trim()
      || !Number.isSafeInteger(result.history.tokensUsed) || result.history.tokensUsed < 0) return uncertain();
    if (signal.aborted) return uncertain();
    const history = result.history;
    await prisma.$transaction(async tx => {
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      const row = await tx.textGenerationAttempt.findUnique({ where: { id } });
      if (owner.length !== 1 || owner[0].id !== userId || !row || row.userId !== userId || row.state !== 'pending'
        || row.createdAt.getTime() !== admittedAt!.getTime()) throw Error('Completion unavailable');
      await tx.generation.create({ data: { ...history, id, userId, createdAt: row.createdAt } });
      const changed = await tx.textGenerationAttempt.updateMany({ where: { id, userId, state: 'pending' }, data: { state: 'complete' } });
      if (changed.count !== 1) throw Error('Completion unavailable');
    }, { maxWait: 10_000, timeout: 15_000 });
    return Response.json({ content: result.content, truncated: result.truncated }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Only this original invocation can confirm its own already committed
    // business result. A pending row never restarts a model or grants authority.
    if (result && admittedAt) {
      try {
        const [row, saved] = await Promise.all([
          prisma.textGenerationAttempt.findUnique({ where: { id } }), prisma.generation.findUnique({ where: { id } }),
        ]);
        if (row?.userId === userId && row.state === 'complete' && saved?.userId === userId
          && saved.template === result.history.template && saved.output === result.history.output
          && saved.tokensUsed === result.history.tokensUsed && saved.ipAddress === result.history.ipAddress
          && saved.createdAt.getTime() === admittedAt.getTime()) {
          return Response.json({ content: result.content, truncated: result.truncated }, { headers: { 'Cache-Control': 'no-store' } });
        }
      } catch { /* Leave the result unconfirmed. */ }
    }
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    return uncertain(code === 'quota' || code === 'rate_limit' ? 429 : 503);
  }
}
