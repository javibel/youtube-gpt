import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimitRequest, rateLimitDb } from '@/lib/rate-limit-db';
import { parseWaitlistInput, waitlistLimitEmail, prepareWaitlistJob, dispatchWaitlistJob } from '@/lib/waitlist-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const reply = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  const deadline = performance.now()+25_000;
  let retired = false, rejectWait!: (e: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Waitlist request unconfirmed')); } };
  const timer = setTimeout(retire, 25_000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now()>=deadline) retire(); if (retired) throw Error('Waitlist request unconfirmed'); };
  const accepted = () => ({ body: { ok: true, status: 'accepted' }, status: 202 });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const allowed = await rateLimitRequest(request, 'waitlist', 8, 60, true); check();
      if (allowed !== true) return { body: { error: 'too_many_requests' }, status: 429 };
      let value: unknown;
      try { value = await request.json(); } catch { check(); return { body: { error: 'invalid_input' }, status: 400 }; }
      check(); const input = parseWaitlistInput(value); if (!input) return { body: { error: 'invalid_input' }, status: 400 };
      const allowedEmail = await rateLimitDb('waitlist:email:'+waitlistLimitEmail(input), 3, 60, true); check();
      if (allowedEmail !== true) return accepted();
      const job = prepareWaitlistJob(input); if (!job) return { body: { error: 'waitlist_unconfirmed' }, status: 503 };
      check(); after(async () => { await dispatchWaitlistJob(job); }); return accepted();
    });
    const result = await Promise.race([original, stopped]); check(); return reply(result.body, result.status);
  } catch { return reply({ error: 'waitlist_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
export async function GET() {
  try {
    const count = await prisma.launchWaitlist.count();
    if (!Number.isSafeInteger(count) || count < 0) return reply({ error: 'count_unconfirmed' }, 503);
    // Aggregate registrations, not accepted marketing consent or email delivery.
    return reply({ count }, 200);
  } catch { return reply({ error: 'count_unconfirmed' }, 503); }
}
