import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/auth';
import { changePasswordOriginal, validPasswordChange, validPasswordKey } from '@/lib/password-change';
import { preparePasswordChangeNotice, sendPasswordChangeNotice } from '@/lib/password-change-notice';

export const maxDuration = 60;
type Confirmed = { ok: true; userId: string; email: string; key: string; status: 'updated'; lang: 'es' | 'en';
  notification: 'not_started' | 'unconfirmed' | 'acknowledged' };
export async function POST(request: Request) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void, confirmed: Confirmed | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Password unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Password unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id || typeof session.user.email !== 'string' || !session.user.email)
        return { body: { error: 'No autorizado' }, status: 401 };
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email });
      // Legacy callers may omit a key: this is a fresh invocation, never a resume.
      // A retained pending admission still denies every other key for this account.
      const suppliedKey = request.headers.get('Idempotency-Key'), key = suppliedKey ?? randomUUID();
      if (!validPasswordKey(key)) return { body: { error: 'invalid_input' }, status: 400 };
      let body: unknown;
      try { body = await request.json(); } catch { check(); return { body: { error: 'invalid_input' }, status: 400 }; }
      check(); if (!validPasswordChange(body)) return { body: { error: 'invalid_input' }, status: 400 };
      const result = await changePasswordOriginal(owner, body, key, check);
      if (!result.ok) return { body: { error: result.error }, status: result.status };
      confirmed = { ok: true, userId: result.userId, email: result.email, key: result.key, status: 'updated',
        lang: result.lang, notification: 'not_started' };
      try {
        check();
        const packet = preparePasswordChangeNotice(result.email, result.noticeName, result.lang);
        check();
        await sendPasswordChangeNotice(packet, result.noticeId, check, () => {
          check(); confirmed = { ...confirmed!, notification: 'unconfirmed' };
        });
        check(); confirmed = { ...confirmed, notification: 'acknowledged' };
      } catch { /* Keep confirmed password separate from unavailable/uncertain notice. No retry. */ }
      return { body: confirmed, status: 200 };
    });
    const result = await Promise.race([original, stopped]); check(); return reply(result.body, result.status);
  } catch {
    return confirmed ? reply(confirmed) : reply({ error: 'password_change_unconfirmed' }, 503);
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
