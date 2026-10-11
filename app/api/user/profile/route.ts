import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { updateProfileOriginal, validProfileUpdate } from '@/lib/profile-update';

export const maxDuration = 60;
export async function PATCH(req: NextRequest) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Profile unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  req.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (req.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Profile unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id || typeof session.user.email !== 'string') return reply({ error: 'Unauthorized' }, 401);
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email });
      const key = req.headers.get('Idempotency-Key');
      let body: unknown;
      try { body = await req.json(); } catch { check(); return reply({ error: 'invalid_input' }, 400); }
      check(); if (!validProfileUpdate(body, key)) return reply({ error: 'invalid_input' }, 400);
      const result = await updateProfileOriginal(owner, body, key!, check);
      return result.ok ? reply(result) : reply({ error: result.error }, result.status);
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'profile_update_unconfirmed' }, 503); }
  finally { clearTimeout(timer); req.signal.removeEventListener('abort', retire); }
}
