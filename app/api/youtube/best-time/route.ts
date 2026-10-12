import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { bestTimeCache } from '@/lib/best-time-cache';
import { prisma } from '@/lib/prisma';
import { readBestTimeEligibility } from '@/lib/best-time-eligibility';

export const maxDuration = 60;

// ── GET: return cached analysis ────────────────────────────────────────────

export async function GET(request?: Request) {
  // Retire this HTTP wait without cancelling, replacing or retrying the original read.
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(Error('Best time cache unavailable')); }
  };
  const timer = setTimeout(retire, 25_000);
  request?.signal.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (request?.signal.aborted || performance.now() >= deadline) retire();
    if (retired) throw Error('Best time cache unavailable');
  };
  const reply = (body: unknown, status = 200) => {
    const response = NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    check();
    return response;
  };
  try {
    const original = Promise.resolve().then(async () => {
      check();
      const session = await auth();
      check();
      if (typeof session?.user?.id !== 'string' || !session.user.id
        || typeof session.user.email !== 'string' || !session.user.email)
        return reply({ error: 'unauthorized' }, 401);
      const owner = Object.freeze({ id: session.user.id, email: session.user.email });
      const snapshot = await prisma.$transaction(async tx => {
        check();
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        check();
        const selected = await tx.user.findUnique({
          where: { email: owner.email }, select: { id: true, email: true },
        });
        check();
        if (!selected) return Object.freeze({ status: 404, body: { error: 'owner_not_found' } });
        if (selected.id !== owner.id || selected.email !== owner.email)
          return Object.freeze({ status: 401, body: { error: 'unauthorized' } });
        const cached = await tx.bestTimeAnalysis.findUnique({
          where: { userId: owner.id },
          select: { userId: true, heatmap: true, topSlots: true, videoCount: true, aiTip: true, analyzedAt: true },
        });
        check();
        const data = cached === null ? null : bestTimeCache(cached, owner.id);
        check();
        return Object.freeze({ status: 200, body: Object.freeze({ owner, data }) });
      }, { isolationLevel: 'RepeatableRead', maxWait: 25_000, timeout: 25_000 });
      check();
      return reply(snapshot.body, snapshot.status);
    });
    const response = await Promise.race([original, stopped]);
    check();
    return response;
  } catch {
    return NextResponse.json({ error: 'best_time_read_unconfirmed' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  } finally {
    retire();
    clearTimeout(timer);
    request?.signal.removeEventListener('abort', retire);
  }
}

// POST — original bounded eligibility only; producer admission remains closed.
export async function POST(request?: Request) {
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(Error('Best time analysis unconfirmed')); }
  };
  const timer = setTimeout(retire, 25_000);
  request?.signal.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (request?.signal.aborted || performance.now() >= deadline) retire();
    if (retired) throw Error('Best time analysis unconfirmed');
  };
  const reply = (body: unknown, status: number) => {
    const response = NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    check();
    return response;
  };
  try {
    const original = Promise.resolve().then(async () => {
      check();
      const session = await auth();
      check();
      if (typeof session?.user?.id !== 'string' || !session.user.id
        || typeof session.user.email !== 'string' || !session.user.email)
        return reply({ error: 'unauthorized' }, 401);
      const owner = Object.freeze({ id: session.user.id, email: session.user.email });
      const result = await readBestTimeEligibility(owner, check);
      check();
      return reply(result.body, result.status);
    });
    const response = await Promise.race([original, stopped]);
    check();
    return response;
  } catch {
    return NextResponse.json({ error: 'best_time_analysis_unconfirmed' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  } finally {
    retire(); clearTimeout(timer);
    request?.signal.removeEventListener('abort', retire);
  }
}
