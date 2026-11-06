import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { createTrackedCompetitor } from '@/lib/competitor-creation';
import { deleteTrackedCompetitor } from '@/lib/competitor-deletion';

export const maxDuration = 60;

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();


// GET: list tracked competitors with latest snapshots
export async function GET(request: Request) {
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(new Error('List unavailable')); } };
  const timer = setTimeout(retire, 25_000);
  request?.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request?.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('List unavailable'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id) {
        return reply({ error: 'unauthorized' }, 401);
      }

      const userId = session.user.id;
      const competitors = await prisma.trackedCompetitor.findMany({
        where: { userId },
        orderBy: { addedAt: 'asc' },
        include: {
          snapshots: {
            orderBy: { recordedAt: 'asc' },
            where: { recordedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
          },
        },
      });

      check();
      if (!competitors.every(c => c.userId === userId)) throw Error('List unavailable');
      const result = competitors.map(c => {
        const snaps = c.snapshots.map(s => ({
          subscribers: s.subscribers,
          totalViews: Number(s.totalViews),
          videoCount: s.videoCount,
          recordedAt: s.recordedAt.toISOString(),
        }));

        // Growth calculations
        const latest = snaps.length > 0 ? snaps[snaps.length - 1] : null;
        const now = Date.now();
        function findClosest(daysAgo: number) {
          if (snaps.length === 0) return null;
          const target = now - daysAgo * 24 * 60 * 60 * 1000;
          let best = snaps[0];
          let bestDiff = Math.abs(new Date(best.recordedAt).getTime() - target);
          for (const p of snaps) {
            const diff = Math.abs(new Date(p.recordedAt).getTime() - target);
            if (diff < bestDiff) { best = p; bestDiff = diff; }
          }
          return best;
        }
        const week = findClosest(7);
        const month = findClosest(30);

        return {
          id: c.id,
          channelId: c.channelId,
          channelName: c.channelName,
          channelThumb: c.channelThumb,
          subscribers: c.subscribers,
          totalViews: Number(c.totalViews),
          videoCount: c.videoCount,
          addedAt: c.addedAt.toISOString(),
          snapshots: snaps,
          growth: latest && week && month ? {
            subs7d: latest.subscribers - week.subscribers,
            subs30d: latest.subscribers - month.subscribers,
            views7d: latest.totalViews - week.totalViews,
            views30d: latest.totalViews - month.totalViews,
          } : null,
        };
      });

      check(); return reply({ userId, competitors: result });
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'competitors_read_unavailable' }, 503); }
  finally { clearTimeout(timer); request?.signal.removeEventListener('abort', retire); }
}

// POST: add a competitor to track
export async function POST(request: Request) {
  const deadline = performance.now() + 55_000;
  let retired = false;
  let rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(new Error('Creation unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Creation unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id) return reply({ error: 'unauthorized' }, 401);
      const userId = session.user.id;
      let body;
      try { body = await request.json(); } catch { check(); return reply({ error: 'invalid_url' }, 400); }
      check();
      const url = body?.url;
      const result = await createTrackedCompetitor(userId, url, YT_API_KEY, check);
      check();
      return result.ok ? reply(result) : reply(result, result.status);
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'competitor_create_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
// DELETE: remove a tracked competitor
export async function DELETE(request: Request) {
  const deadline = performance.now() + 55_000;
  let retired = false;
  let rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(new Error('Deletion unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Deletion unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id) return reply({ error: 'unauthorized' }, 401);
      const userId = session.user.id;
      let body;
      try { body = await request.json(); } catch { check(); return reply({ error: 'missing id' }, 400); }
      check();
      const id = body?.id;
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 200) return reply({ error: 'missing id' }, 400);
      const result = await deleteTrackedCompetitor(userId, id, check);
      return result.ok ? reply(result) : reply({ error: result.error }, result.status);
    });
    const result = await Promise.race([original, stopped]); check(); return result;
  } catch { return reply({ error: 'competitor_delete_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
