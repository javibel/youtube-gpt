import { NextResponse, after } from 'next/server';
import { AFFILIATES_DORMANT } from '@/lib/features';
import { rateLimitRequest, rateLimitDb } from '@/lib/rate-limit-db';
import { parseAffiliateApplication, affiliateApplicationLimitEmail, prepareAffiliateApplicationJob, dispatchAffiliateApplication } from '@/lib/affiliate-application';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const reply = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  // Remains dormant in this repository; even parsing/limiting/scheduling is closed.
  if (AFFILIATES_DORMANT) return reply({ error: 'not_found' }, 404);
  const deadline = performance.now()+25_000;
  let retired = false, rejectWait!: (e: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Application unconfirmed')); } };
  const timer = setTimeout(retire, 25_000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now()>=deadline) retire(); if (retired) throw Error('Application unconfirmed'); };
  const accepted = () => ({ body: { ok: true, status: 'accepted' }, status: 202 });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const allowed = await rateLimitRequest(request, 'affapply', 3, 60, true); check();
      if (allowed !== true) return { body: { error: 'too_many_requests' }, status: 429 };
      let value: unknown;
      try { value = await request.json(); } catch { check(); return { body: { error: 'invalid_input' }, status: 400 }; }
      check(); const input = parseAffiliateApplication(value); if (!input) return { body: { error: 'invalid_input' }, status: 400 };
      const allowedEmail = await rateLimitDb('affapply:email:'+affiliateApplicationLimitEmail(input), 3, 60, true); check();
      if (allowedEmail !== true) return accepted();
      const job = prepareAffiliateApplicationJob(input); if (!job) return { body: { error: 'application_unconfirmed' }, status: 503 };
      check(); after(async () => { await dispatchAffiliateApplication(job); }); return accepted();
    });
    const result = await Promise.race([original, stopped]); check(); return reply(result.body, result.status);
  } catch { return reply({ error: 'application_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
