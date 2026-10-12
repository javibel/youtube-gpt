import { randomUUID } from 'node:crypto';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPaidAccess, getLimits, type PlanType } from '@/lib/plans';
import { thumbnailQuota } from '@/lib/image/thumbnail-quota';
import { bestTimeCache } from '@/lib/best-time-cache';
import { readDeclaredBestTime, type BestTimeSources } from './best-time-source-reader';
import { Prisma } from '@prisma/client';
export type BestTimeOriginalSources = BestTimeSources & Readonly<{ referenceAt: string }>;

// Fresh original only, detached from HTTP admission. Trusted server code must
// supply sources; request JSON, keys, rows and dates never recover an original.
// This deterministic path has no AI tip and preserves legacy's zero Generation
// debit. Its durable row excludes another Best Time original, not an AI credit.
export function runDeterministicBestTimeOriginal(request: Request, sources: BestTimeOriginalSources) {
  let pending = true, retired = false, timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = performance.now() + 65_000;
  const uncertain = () => Object.freeze({ status: 503, body: { error: 'best_time_analysis_unconfirmed' } });
  type Outcome = { status: number; body: Record<string, unknown> };
  let finish!: (value: Outcome) => void;
  const stopped = new Promise<Outcome>(resolve => { finish = resolve; });
  const retire = () => { retired = true; finish(uncertain()); if (timer !== undefined) clearTimeout(timer); };
  const check = () => { if (retired || request.signal.aborted || performance.now() >= deadline) { retired = true; throw Error('Best time original ended'); } };
  const step = async <T>(run: () => PromiseLike<T>) => { check(); const result = await run(); check(); return result; };
  request.signal.addEventListener('abort', retire, { once: true });
  let capturedSources: BestTimeSources | undefined, declaredReference: string | undefined;
  try {
    check();
    const search = Object.getOwnPropertyDescriptor(sources, 'search')?.value;
    const details = Object.getOwnPropertyDescriptor(sources, 'details')?.value;
    const reference = Object.getOwnPropertyDescriptor(sources, 'referenceAt')?.value;
    if (typeof search !== 'function' || typeof details !== 'function' || typeof reference !== 'string'
      || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(reference)
      || new Date(reference).toISOString() !== (reference.includes('.') ? reference : reference.replace('Z', '.000Z')))
      throw Error('Best time sources unavailable');
    capturedSources = Object.freeze({ search, details });
    declaredReference = reference; // Source facts, never the new admission date.
  } catch { retired = true; }
  const original = Promise.resolve().then(async (): Promise<Outcome> => {
    try {
      check();
      const session = await step(() => auth());
      if (typeof session?.user?.id !== 'string' || !session.user.id || session.user.id.length > 128
        || typeof session.user.email !== 'string' || !session.user.email || session.user.email.length > 320)
        return { status: 401, body: { error: 'unauthorized' } };
      const owner = Object.freeze({ id: session.user.id, email: session.user.email });
      const id = randomUUID();
      const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
      const locked = async (tx: Prisma.TransactionClient) => {
        const users = await step(() => tx.$queryRawUnsafe<Array<{ id: string; email: string }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', owner.id));
        if (users.length !== 1 || users[0].id !== owner.id || users[0].email !== owner.email) throw Error('Best time owner unavailable');
      };
      const paid = async (tx: Prisma.TransactionClient) => {
        const rows = await step(() => tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM subscriptions WHERE "userId"=$1 FOR UPDATE', owner.id));
        const sub = await step(() => tx.subscription.findUnique({ where: { userId: owner.id },
          select: { id: true, userId: true, plan: true, status: true, stripeCustomerId: true, currentPeriodEnd: true } }));
        if (!sub || rows.length !== 1 || rows[0].id !== sub.id || sub.userId !== owner.id
          || !['free', 'pro', 'business'].includes(sub.plan) || typeof sub.status !== 'string'
          || (sub.stripeCustomerId !== null && (typeof sub.stripeCustomerId !== 'string' || !sub.stripeCustomerId))) throw Error('Best time plan unavailable');
        const access = Object.freeze({ status: sub.status, stripeCustomerId: sub.stripeCustomerId,
          currentPeriodEnd: sub.currentPeriodEnd === null ? null : new Date(Date.prototype.toISOString.call(sub.currentPeriodEnd)) });
        const snapshot = Object.freeze({ id: sub.id, plan: sub.plan as PlanType, access });
        if (snapshot.plan === 'free' || !hasPaidAccess(access)) throw Error('Best time paid access unavailable');
        const guarded = {
          generation: { count: (...args: Parameters<typeof tx.generation.count>) => step(() => tx.generation.count(...args)) },
          legacyThumbnailAttempt: { count: (...args: Parameters<typeof tx.legacyThumbnailAttempt.count>) => step(() => tx.legacyThumbnailAttempt.count(...args)) },
          textGenerationAttempt: { count: (...args: Parameters<typeof tx.textGenerationAttempt.count>) => step(() => tx.textGenerationAttempt.count(...args)) },
          $queryRaw: (...args: Parameters<typeof tx.$queryRaw>) => step(() => tx.$queryRaw(...args)),
        } as unknown as Prisma.TransactionClient;
        const quota = await thumbnailQuota(guarded, owner.id, month);
        check();
        if (!hasPaidAccess(access) || !Number.isSafeInteger(getLimits(snapshot.plan).generationsPerMonth)
          || quota.total >= getLimits(snapshot.plan).generationsPerMonth) throw Error('Best time capacity unavailable');
        return snapshot;
      };
      const samePlan = (a: Awaited<ReturnType<typeof paid>>, b: Awaited<ReturnType<typeof paid>>) => a.id === b.id
        && a.plan === b.plan && a.access.status === b.access.status && a.access.stripeCustomerId === b.access.stripeCustomerId
        && a.access.currentPeriodEnd?.getTime() === b.access.currentPeriodEnd?.getTime();
      const admission = await step(() => prisma.$transaction(async tx => {
        await locked(tx); const plan = await paid(tx);
        const channel = await step(() => tx.youtubeToken.findUnique({ where: { userId: owner.id }, select: { userId: true, channelId: true } }));
        if (!channel || channel.userId !== owner.id || typeof channel.channelId !== 'string' || !/^[-A-Za-z0-9_]{1,128}$/.test(channel.channelId)) throw Error('Best time channel unavailable');
        const channelId = channel.channelId;
        const prior = await step(() => tx.bestTimeAnalysisAttempt.findUnique({ where: { userId: owner.id } }));
        if (prior) throw Error('Best time original retained');
        if (!declaredReference) throw Error('Best time reference unavailable');
        const row = await step(() => tx.bestTimeAnalysisAttempt.create({ data: { id, userId: owner.id, email: owner.email, channelId, referenceAt: new Date(declaredReference), state: 'pending' } }));
        if (row.id !== id || row.userId !== owner.id || row.email !== owner.email || row.channelId !== channelId || row.state !== 'pending') throw Error('Best time native admission unavailable');
        const createdAt = Date.prototype.toISOString.call(row.createdAt);
        if (Date.prototype.toISOString.call(row.referenceAt) !== new Date(declaredReference).toISOString()
          || new Date(declaredReference).getTime() > new Date(createdAt).getTime()) throw Error('Best time declared reference unavailable');
        check();
        return Object.freeze({ plan, channelId, createdAt, referenceAt: declaredReference });
      }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 }));
      // Only the fresh native transaction ACK above enables this live closure.
      // No later row/read/JSON can enter this branch or repeat a source callback.
      if (!capturedSources || !hasPaidAccess(admission.plan.access)) throw Error('Best time original unavailable');
      const read = readDeclaredBestTime({ owner, channelId: admission.channelId, referenceAt: admission.referenceAt }, capturedSources, check, request.signal);
      const produced = await step(() => read.original);
      if (produced.status === 'unconfirmed') return uncertain();
      const release = async (state: 'pending' | 'complete') => {
        const acknowledged = await step(() => prisma.$transaction(async tx => {
          await locked(tx);
          const removed = await step(() => tx.bestTimeAnalysisAttempt.deleteMany({ where: { id, userId: owner.id, email: owner.email,
            channelId: admission.channelId, createdAt: new Date(admission.createdAt), referenceAt: new Date(admission.referenceAt), state } }));
          if (removed.count !== 1) throw Error('Best time original completion unavailable');
          return true;
        }, { maxWait: 5000, timeout: 15000 }));
        if (acknowledged !== true) throw Error('Best time original completion unavailable');
      };
      if (produced.status === 'no_videos' || produced.analysis.status !== 'ready') {
        // A known, fully drained no-analysis original may close its own row.
        await release('pending');
        return { status: 400, body: produced.status === 'no_videos' ? { error: 'no_videos' }
          : { error: 'not_enough_videos', videoCount: produced.analysis.videoCount } };
      }
      const data = bestTimeCache({ userId: owner.id, heatmap: produced.analysis.heatmap, topSlots: produced.analysis.topSlots,
        videoCount: produced.analysis.videoCount, aiTip: null, analyzedAt: new Date(admission.referenceAt) }, owner.id);
      const saved = await step(() => prisma.$transaction(async tx => {
        await locked(tx); const latestPlan = await paid(tx);
        if (!samePlan(admission.plan, latestPlan)) throw Error('Best time plan changed');
        const channel = await step(() => tx.youtubeToken.findUnique({ where: { userId: owner.id }, select: { userId: true, channelId: true } }));
        if (!channel || channel.userId !== owner.id || channel.channelId !== admission.channelId) throw Error('Best time channel changed');
        const row = await step(() => tx.bestTimeAnalysisAttempt.findUnique({ where: { userId: owner.id } }));
        if (!row || row.id !== id || row.userId !== owner.id || row.email !== owner.email || row.channelId !== admission.channelId
          || row.state !== 'pending' || Date.prototype.toISOString.call(row.createdAt) !== admission.createdAt
          || Date.prototype.toISOString.call(row.referenceAt) !== new Date(admission.referenceAt).toISOString()) throw Error('Best time original changed');
        const values = { heatmap: data.heatmap as unknown as Prisma.InputJsonValue, topSlots: data.topSlots as unknown as Prisma.InputJsonValue,
          videoCount: data.videoCount, aiTip: Prisma.JsonNull, analyzedAt: new Date(admission.referenceAt) };
        const stored = await step(() => tx.bestTimeAnalysis.upsert({ where: { userId: owner.id }, create: { id: randomUUID(), userId: owner.id, ...values }, update: values }));
        const captured = bestTimeCache(stored, owner.id);
        if (JSON.stringify(captured) !== JSON.stringify(data)) throw Error('Best time native write unavailable');
        const completed = await step(() => tx.bestTimeAnalysisAttempt.updateMany({ where: { id, userId: owner.id, state: 'pending' }, data: { state: 'complete' } }));
        if (completed.count !== 1) throw Error('Best time native completion unavailable');
        return captured;
      }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 }));
      // This exact original received the writer ACK. Release only here; there is
      // no read-back, lookup/reset/recovery path after an uncertain native ACK.
      await release('complete'); check();
      return { status: 200, body: { owner, data: saved } };
    } catch { return uncertain(); }
  }).then(outcome => { pending = false; if (timer !== undefined) clearTimeout(timer); request.signal.removeEventListener('abort', retire);
    try { check(); return outcome; } catch { return uncertain(); } });
  timer = setTimeout(retire, Math.max(0, deadline - performance.now()));
  const waiter = Promise.race([original, stopped]).then(outcome => { try { check(); return outcome; } catch { return uncertain(); } });
  return Object.freeze({ original, waiter, get pending() { return pending; } });
}

