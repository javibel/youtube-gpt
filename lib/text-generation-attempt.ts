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

// A retained business reservation permits only a read of the trusted runtime's
// settled result. It never permits execution, release or takeover of a runner.
export async function keyedTextGeneration(userId: string, id: string, signal: AbortSignal,
  preflight: () => Promise<Response | null>, execute: () => Promise<Response | TextGenerationResult>,
  retrieve: () => Promise<Response | TextGenerationResult>) {
  return runKeyedTextGeneration(userId, id, signal, preflight, execute, retrieve, false);
}

export async function keyedStoryboardGeneration(userId: string, id: string, signal: AbortSignal,
  preflight: () => Promise<Response | null>, execute: () => Promise<Response | TextGenerationResult>,
  retrieve: () => Promise<Response | TextGenerationResult>) {
  return runKeyedTextGeneration(userId, id, signal, preflight, execute, retrieve, true);
}

async function runKeyedTextGeneration(userId: string, id: string, signal: AbortSignal,
  preflight: () => Promise<Response | null>, execute: () => Promise<Response | TextGenerationResult>,
  retrieve: () => Promise<Response | TextGenerationResult>, storyboard: boolean) {
  const uncertain = (status = 503) => Response.json({ error: 'Generation unconfirmed', code: 'text_result_unconfirmed',
    retryMayConsume: false }, { status, headers: { 'Cache-Control': 'no-store' } });
  let result: TextGenerationResult | null = null;
  let admittedAt: Date | null = null;
  const valid = (row: { id: string; userId: string; state: string; createdAt: Date }) => row.id === id
    && row.userId === userId && ['pending', 'complete'].includes(row.state) && Number.isFinite(row.createdAt?.getTime());
  const canonicalInputs = (inputs: unknown) => JSON.stringify(inputs, (_key, value) => value && typeof value === 'object'
    && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  const matches = (saved: { userId: string; template: string; inputs: unknown; output: string; tokensUsed: number; createdAt: Date }) =>
    result && admittedAt && saved.userId === userId && saved.template === result.history.template
    && saved.output === result.history.output && saved.tokensUsed === result.history.tokensUsed
    && canonicalInputs(saved.inputs) === canonicalInputs(result.history.inputs)
    && saved.createdAt.getTime() === admittedAt.getTime();
  const response = () => Response.json({ content: result!.content, truncated: result!.truncated },
    { headers: { 'Cache-Control': 'no-store' } });
  try {
    if (!(storyboard ? /^storyboard_[a-f0-9]{64}$/ : /^generate_[a-f0-9]{64}$/).test(id)
      || !userId || signal.aborted) return uncertain();
    const inspect = () => prisma.$transaction(async tx => {
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      if (owner.length !== 1 || owner[0].id !== userId || signal.aborted) throw Error('Admission unavailable');
      const row = await tx.textGenerationAttempt.findUnique({ where: { id } });
      if (row && !valid(row)) throw Error('Admission unavailable');
      if (row?.state === 'complete' && !await tx.generation.findUnique({ where: { id } })) throw Error('History unavailable');
      return row;
    }, { maxWait: 10_000, timeout: 15_000 });
    let row = await inspect();
    let fresh = false;
    if (!row) {
      // Preflight itself reads quota under an owner lock. Keep it outside this
      // transaction, then recheck the shared capacity at durable admission.
      const denied = await preflight();
      const admission = await prisma.$transaction(async tx => {
        const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
        if (owner.length !== 1 || owner[0].id !== userId || signal.aborted) throw Error('Admission unavailable');
        const existing = await tx.textGenerationAttempt.findUnique({ where: { id } });
        if (existing) {
          if (!valid(existing)) throw Error('Admission unavailable');
          return { row: existing, fresh: false };
        }
        if (denied) return denied;
        const plan = await getUserPlan(userId);
        const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
        if ((await thumbnailQuota(tx, userId, month)).total >= getLimits(plan).generationsPerMonth) {
          return Response.json({ error: 'Límite del plan alcanzado', limitReached: true }, { status: 429 });
        }
        if (storyboard && !isPaid(plan)) {
          const recorded = await tx.generation.count({ where: { userId, template: 'video_preview', createdAt: { gte: month } } });
          const pending = await tx.textGenerationAttempt.count({ where: { userId, createdAt: { gte: month },
            state: { not: 'complete' }, id: { startsWith: 'storyboard_' } } });
          if (![recorded, pending, recorded + pending].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('Video Tips quota unavailable');
          if (recorded + pending >= 1) return Response.json({ error: 'Ya usaste tu Video Tips gratis este mes',
            limitReached: true, videoTipsCapped: true }, { status: 429 });
        }
        return { row: await tx.textGenerationAttempt.create({ data: { id, userId, state: 'pending' } }), fresh: true };
      }, { maxWait: 10_000, timeout: 15_000 });
      if (admission instanceof Response) return admission;
      row = admission.row; fresh = admission.fresh;
    }
    if (!row || !valid(row) || (fresh && row.state !== 'pending') || signal.aborted) return uncertain();
    admittedAt = row.createdAt;
    const produced = await (fresh ? execute() : retrieve());
    if (produced instanceof Response) return produced;
    result = produced;
    if (typeof result.content !== 'string' || !result.content.trim() || typeof result.truncated !== 'boolean'
      || (storyboard && (result.history.template !== 'video_preview' || result.truncated))
      || typeof result.history.output !== 'string' || !result.history.output.trim()
      || !Number.isSafeInteger(result.history.tokensUsed) || result.history.tokensUsed < 0 || signal.aborted) return uncertain();
    await prisma.$transaction(async tx => {
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      const current = await tx.textGenerationAttempt.findUnique({ where: { id } });
      if (owner.length !== 1 || owner[0].id !== userId || !current || !valid(current)
        || current.createdAt.getTime() !== admittedAt!.getTime() || signal.aborted) throw Error('Completion unavailable');
      if (current.state === 'complete') {
        const saved = await tx.generation.findUnique({ where: { id } });
        if (!saved || !matches(saved)) throw Error('Completion unavailable');
        return;
      }
      await tx.generation.create({ data: { ...result!.history, id, userId, createdAt: current.createdAt } });
      const changed = await tx.textGenerationAttempt.updateMany({ where: { id, userId, state: 'pending' }, data: { state: 'complete' } });
      if (changed.count !== 1) throw Error('Completion unavailable');
    }, { maxWait: 10_000, timeout: 15_000 });
    return response();
  } catch (error) {
    // A known result (fresh or authenticated read-only retrieval) can confirm an
    // already committed completion, but cannot restart an unresolved effect.
    if (result && admittedAt && !signal.aborted) {
      try {
        const [row, saved] = await Promise.all([prisma.textGenerationAttempt.findUnique({ where: { id } }),
          prisma.generation.findUnique({ where: { id } })]);
        if (row && valid(row) && row.state === 'complete' && saved && matches(saved)) return response();
      } catch { /* Leave the result unconfirmed. */ }
    }
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    return uncertain(code === 'quota' || code === 'rate_limit' ? 429 : 503);
  }
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
          state: { not: 'complete' }, id: { startsWith: 'storyboard_' } } });
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
