import { NextResponse } from 'next/server';
import { rateLimitRequest } from '@/lib/rate-limit-db';
import { parsePasswordResetInput } from '@/lib/password-reset-input';
import { consumePasswordResetOriginal, dispatchPasswordResetNotice } from '@/lib/password-reset-server';

export const maxDuration = 60;
type Confirmed = { ok: true; status: 'updated'; notification: 'not_started' | 'unconfirmed' | 'acknowledged' };
export async function POST(request: Request) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void, confirmed: Confirmed | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Reset unconfirmed')); } };
  const timer = setTimeout(retire, 55_000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Reset unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check();
      const allowed = await rateLimitRequest(request, 'reset-pw', 10, 15, true); check();
      if (!allowed) return { body: { error: 'too_many_requests' }, status: 429 };
      let body: unknown;
      try { body = await request.json(); } catch { check(); return { body: { error: 'invalid_input' }, status: 400 }; }
      check();
      const input = parsePasswordResetInput(body);
      if (!input) return { body: { error: 'invalid_input' }, status: 400 };
      const result = await consumePasswordResetOriginal(input, check);
      if (result.status !== 'changed') {
        check();
        return result.status === 'unconfirmed' ? { body: { error: 'password_reset_unconfirmed' }, status: 503 }
          : { body: { error: result.status === 'weak-password' ? result.error : 'invalid_or_expired_link' }, status: 400 };
      }
      // Confirmed password is separate from provider ACK; no cookie/authentication.
      confirmed = { ok: true, status: 'updated', notification: 'not_started' };
      try {
        check();
        const notice = await dispatchPasswordResetNotice(result.change, check, () => {
          check(); confirmed = { ...confirmed!, notification: 'unconfirmed' };
        });
        check(); confirmed = { ...confirmed, notification: notice };
      } catch { /* Keep confirmed password; no notice retry or SQL lookup. */ }
      return { body: confirmed, status: 200 };
    });
    const result = await Promise.race([original, stopped]); check(); return reply(result.body, result.status);
  } catch { return confirmed ? reply(confirmed) : reply({ error: 'password_reset_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
