import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { currencyForCountry } from '@/lib/pricing';
import { checkoutOriginal, validCheckoutKey, validCheckoutInput } from '@/lib/checkout-session';

export const maxDuration = 60;
export async function POST(request: Request) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Checkout unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Checkout unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check();
      const suppliedKey = request.headers.get('Idempotency-Key'), key = suppliedKey ?? randomUUID();
      if (!validCheckoutKey(key)) return { body: { error: 'invalid_input' }, status: 400 };
      const session = await auth(); check();
      if (!session?.user?.id || typeof session.user.email !== 'string' || !session.user.email)
        return { body: { error: 'Unauthorized' }, status: 401 };
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email });
      let body: unknown;
      try { body = await request.json(); } catch { check(); return { body: { error: 'invalid_input' }, status: 400 }; }
      check(); if (!validCheckoutInput(body)) return { body: { error: 'invalid_input' }, status: 400 };
      const input = Object.freeze({ plan: body.plan, lang: body.lang }), currency = currencyForCountry(request.headers.get('x-vercel-ip-country'));
      check(); const result = await checkoutOriginal(owner, input, key, currency, check); check();
      if (!result.ok) return { body: { error: result.error }, status: result.status };
      const { ok: _ok, ...receipt } = result;
      // Preserve the legacy public shape, with mandatory durable account denial
      // behind both forms. A missing key is fresh input, never recovery.
      if (suppliedKey === null) {
        const { key: _key, plan: _plan, lang: _lang, ...legacy } = receipt;
        return { body: legacy, status: 200 };
      }
      return { body: receipt, status: 200 };
    });
    const result = await Promise.race([original, stopped]); check(); return reply(result.body, result.status);
  } catch { return reply({ error: 'checkout_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
