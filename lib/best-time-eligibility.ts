import { prisma } from '@/lib/prisma';
import { hasPaidAccess, getLimits, type PlanType } from '@/lib/plans';
import { thumbnailQuota } from '@/lib/image/thumbnail-quota';
import type { Prisma } from '@prisma/client';

export async function readBestTimeEligibility(owner: Readonly<{ id: string; email: string }>, check: () => void) {
  check();
  const own = Object.freeze({ id: owner.id, email: owner.email });
  // Accounting window only; never a new analysis timestamp or recovered authority.
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const snapshot = await prisma.$transaction(async tx => {
    const read = async <T>(query: () => PromiseLike<T>) => { check(); const value = await query(); check(); return value; };
    const rows = await read(() => tx.$queryRawUnsafe<Array<{ id: string; email: string }>>(
      'SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.id));
    if (!Array.isArray(rows) || rows.length > 1) throw Error('Best time owner unavailable');
    if (rows.length === 0) return { status: 404, body: { error: 'owner_not_found' }, access: null };
    if (rows[0].id !== own.id || rows[0].email !== own.email)
      return { status: 401, body: { error: 'unauthorized' }, access: null };
    const locked = await read(() => tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM subscriptions WHERE "userId"=$1 FOR UPDATE', own.id));
    if (!Array.isArray(locked) || locked.length > 1 || locked.some(s => typeof s.id !== 'string' || !s.id))
      throw Error('Best time subscription unavailable');
    const sub = await read(() => tx.subscription.findUnique({ where: { userId: own.id },
      select: { id: true, userId: true, status: true, plan: true, stripeCustomerId: true, currentPeriodEnd: true } }));
    if (sub === null) {
      if (locked.length) throw Error('Best time subscription unavailable');
      return { status: 403, body: { error: 'pro_required' }, access: null };
    }
    if (locked.length !== 1 || locked[0].id !== sub.id || sub.userId !== own.id || !sub.id
      || typeof sub.status !== 'string' || !sub.status || !['free', 'pro', 'business'].includes(sub.plan)
      || (sub.stripeCustomerId !== null && (typeof sub.stripeCustomerId !== 'string' || !sub.stripeCustomerId)))
      throw Error('Best time subscription unavailable');
    const access = Object.freeze({ status: sub.status, stripeCustomerId: sub.stripeCustomerId,
      currentPeriodEnd: sub.currentPeriodEnd === null ? null : new Date(Date.prototype.toISOString.call(sub.currentPeriodEnd)) });
    const plan = sub.plan as PlanType;
    if (plan === 'free' || !hasPaidAccess(access)) return { status: 403, body: { error: 'pro_required' }, access: null };
    // Hold the original owner lock across the shared accounting snapshot.
    // Guard every dependency of the unchanged helper so a retired wait dispatches no later query.
    const guarded = {
      generation: { count: (...args: Parameters<typeof tx.generation.count>) => read(() => tx.generation.count(...args)) },
      legacyThumbnailAttempt: { count: (...args: Parameters<typeof tx.legacyThumbnailAttempt.count>) => read(() => tx.legacyThumbnailAttempt.count(...args)) },
      textGenerationAttempt: { count: (...args: Parameters<typeof tx.textGenerationAttempt.count>) => read(() => tx.textGenerationAttempt.count(...args)) },
      $queryRaw: (...args: Parameters<typeof tx.$queryRaw>) => read(() => tx.$queryRaw(...args)),
    } as unknown as Prisma.TransactionClient;
    const quota = await thumbnailQuota(guarded, own.id, month);
    check();
    if (!hasPaidAccess(access)) return { status: 403, body: { error: 'pro_required' }, access: null };
    const limit = getLimits(plan).generationsPerMonth;
    if (!Number.isSafeInteger(limit) || limit <= 0) throw Error('Best time quota unavailable');
    if (quota.total >= limit) return { status: 429, body: { error: 'limit_reached' }, access: null };
    // Eligibility and spare capacity are facts, never a reservation, runner or write permission.
    return { status: 503, body: { error: 'best_time_admission_unavailable' }, access };
  }, { isolationLevel: 'RepeatableRead', maxWait: 25_000, timeout: 25_000 });
  check();
  if (snapshot.access && !hasPaidAccess(snapshot.access)) return { status: 403, body: { error: 'pro_required' } };
  return { status: snapshot.status, body: snapshot.body };
}
