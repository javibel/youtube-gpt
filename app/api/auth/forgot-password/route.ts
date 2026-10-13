import { NextResponse, after } from 'next/server';
import { rateLimitRequest, rateLimitDb } from '@/lib/rate-limit-db';
import { parseForgotPasswordInput, forgotPasswordLimitEmail, prepareForgotPasswordJob, dispatchForgotPasswordJob } from '@/lib/forgot-password-server';

export const maxDuration = 60;
export async function POST(request: Request) {
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Forgot request unconfirmed')); } };
  const timer = setTimeout(retire, 25_000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Forgot request unconfirmed'); };
  const reply = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const accepted = () => ({ body: { ok: true, status: 'accepted' }, status: 202 });
  try {
    const original = Promise.resolve().then(async () => {
      check();
      const allowed = await rateLimitRequest(request, 'forgot-password', 5, 15, true); check();
      if (allowed !== true) return { body: { error: 'too_many_requests' }, status: 429 };
      let body: unknown;
      try { body = await request.json(); } catch { check(); return { body: { error: 'invalid_input' }, status: 400 }; }
      check(); const input = parseForgotPasswordInput(body);
      if (!input) return { body: { error: 'invalid_input' }, status: 400 };
      const email = forgotPasswordLimitEmail(input)!;
      const emailAllowed = await rateLimitDb('forgot-password:email:' + email, 3, 60, true); check();
      if (emailAllowed !== true) return accepted();
      const job = prepareForgotPasswordJob(input, process.env.APP_PUBLIC_URL); check();
      if (!job) return { body: { error: 'forgot_password_unconfirmed' }, status: 503 };
      // Registration is uniform for every email, before any account lookup.
      // after may still run if HTTP retires; only this private callback owns it.
      after(async () => { await dispatchForgotPasswordJob(job); });
      return accepted();
    });
    const result = await Promise.race([original, stopped]); check(); return reply(result.body, result.status);
  } catch { return reply({ error: 'forgot_password_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
