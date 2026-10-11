import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan } from '@/lib/plans';
import { getNextActions } from '@/lib/next-action';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(Error('Actions unavailable')); }
  };
  const timer = setTimeout(retire, 25_000);
  req.signal?.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (req.signal?.aborted || performance.now() >= deadline) retire();
    if (retired) throw Error('Actions unavailable');
  };
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

  try {
    const original = Promise.resolve().then(async () => {
      check();
      const session = await auth();
      check();
      if (typeof session?.user?.id !== 'string' || !session.user.id
        || typeof session.user.email !== 'string' || !session.user.email)
        return reply({ error: 'unauthorized' }, 401);
      const owner = Object.freeze({ id: session.user.id, email: session.user.email });
      const skip = new Set((req.nextUrl.searchParams.get('skip') || '').split(',').filter(Boolean));
      const selected = await prisma.user.findUnique({
        where: { email: owner.email }, select: { id: true, email: true },
      });
      check();
      if (!selected) return reply({ error: 'Usuario no encontrado' }, 404);
      if (selected.id !== owner.id || selected.email !== owner.email)
        return reply({ error: 'unauthorized' }, 401);
      const plan = await getUserPlan(owner.id);
      check();
      const actions = await getNextActions(owner.id, plan !== 'free', check);
      check();
      return reply({ action: actions.find(a => !skip.has(a.id)) ?? null, actions });
    });
    // A retired wait neither cancels nor repeats SQL/OAuth already dispatched.
    const response = await Promise.race([original, stopped]);
    check();
    return response;
  } catch {
    return reply({ error: 'Acciones no disponibles' }, 503);
  } finally {
    retire();
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', retire);
  }
}
