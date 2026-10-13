import { NextRequest, NextResponse } from 'next/server';
import { authorizeNativeProfile, checkNativeProfile, dispatchNativeProfile } from '@/lib/profile-native-authorization';
import { validProfileUpdate } from '@/lib/profile-update';

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
      check(); const authorization = await authorizeNativeProfile(); check();
      if (!authorization) return reply({ error: 'Unauthorized' }, 401);
      checkNativeProfile(authorization);
      const key = req.headers.get('Idempotency-Key');
      let body: unknown;
      try { body = await req.json(); } catch { check(); return reply({ error: 'invalid_input' }, 400); }
      check(); checkNativeProfile(authorization); if (!validProfileUpdate(body, key)) return reply({ error: 'invalid_input' }, 400);
      const result = await dispatchNativeProfile(authorization, body, key!, check);
      check(); checkNativeProfile(authorization);
      return result.ok ? reply(result) : reply({ error: result.error }, result.status);
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'profile_update_unconfirmed' }, 503); }
  finally { clearTimeout(timer); req.signal.removeEventListener('abort', retire); }
}
