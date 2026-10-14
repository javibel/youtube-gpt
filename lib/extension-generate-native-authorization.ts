import { prisma } from '@/lib/prisma';

const contextBrand = Symbol('extension-generate-original');
type TokenRow = Awaited<ReturnType<typeof lookup>>;
const lookup = (token: string) => prisma.extensionToken.findUnique({ where: { token }, include: { user: { select: { id: true, email: true, emailVerified: true } } } });
const planLookup = (userId: string) => prisma.subscription.findUnique({ where: { userId }, select: { plan: true, status: true, stripeCustomerId: true, currentPeriodEnd: true } });
function eligible(row: TokenRow, token: string) {
  return !!row && row.token === token && typeof row.id === 'string' && !!row.id && row.id.length <= 128
    && row.user && typeof row.user.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.user.id) && row.userId === row.user.id
    && typeof row.user.email === 'string' && row.user.email.length <= 254 && row.user.email === row.user.email.trim().toLowerCase()
    && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(row.user.email)
    && row.expiresAt instanceof Date && Number.isFinite(row.expiresAt.getTime()) && row.expiresAt.getTime() > Date.now()
    && row.user.emailVerified instanceof Date && Number.isFinite(row.user.emailVerified.getTime()) && row.user.emailVerified.getTime() <= Date.now();
}
function planSnapshot(row: Awaited<ReturnType<typeof planLookup>>) {
  if (!row) return { value: 'absent', isPro: false, horizon: Infinity };
  if (!['free', 'pro', 'business'].includes(row.plan) || !['active', 'trialing', 'canceled', 'incomplete', 'past_due', 'unpaid', 'paused', 'incomplete_expired'].includes(row.status)
    || !(row.stripeCustomerId === null || typeof row.stripeCustomerId === 'string')
    || !(row.currentPeriodEnd === null || row.currentPeriodEnd instanceof Date && Number.isFinite(row.currentPeriodEnd.getTime()))) throw Error('Generation plan unavailable');
  const active = ['active', 'trialing'].includes(row.status), manual = row.stripeCustomerId === 'manual_admin', period = row.currentPeriodEnd?.getTime() ?? null;
  if (active && row.plan === 'free') throw Error('Generation plan contradictory');
  const isPro = active && (!manual || period !== null && period > Date.now());
  return { value: JSON.stringify([row.plan, row.status, row.stripeCustomerId, period]), isPro, horizon: isPro && manual ? period! : Infinity };
}
export type ExtensionGenerateContext = {
  readonly [contextBrand]: true;
  readonly owner: Readonly<{ id: string; email: string; isPro: boolean }>;
  readonly body: Readonly<{ template: string; inputs: Readonly<Record<string, string>>; lang?: string }>;
  readonly request: Request;
  readonly operationKey: string | null;
  readonly recovery: string | null;
  readonly signal: AbortSignal;
  readonly check: () => void;
  readonly step: <T>(operation: () => Promise<T>) => Promise<T>;
};
const contexts = new WeakMap<object, { used: boolean; check: () => void; value: ExtensionGenerateContext }>();
export function consumeExtensionGenerateContext(context: ExtensionGenerateContext) {
  const own = context && typeof context === 'object' ? contexts.get(context) : undefined;
  if (!own || own.used) throw Error('Generation context unavailable');
  own.check(); own.used = true; return own.value;
}

// The original context supplies negative guards, never authority from a client,
// row, transaction, key, hash or copied callback. Transactions and their individual
// statements retain their invoked promises after interruption; no next statement
// or acknowledgement fallback can start through this client after retirement.
export function extensionGenerateClient(context: ExtensionGenerateContext): typeof prisma {
  const own = contexts.get(context); if (!own?.used) throw Error('Generation context unavailable'); own.check();
  const cache = new WeakMap<object, object>();
  const wrap = (target: any): any => {
    if (cache.has(target)) return cache.get(target);
    const proxy = new Proxy(target, { get(object, key) {
      const value = Reflect.get(object, key);
      if (key === '$transaction') return (action: (tx: any) => Promise<unknown>, options: unknown) => {
        if (typeof action !== 'function') throw Error('Generation transaction unavailable');
        return context.step(() => value.call(object, (tx: any) => action(wrap(tx)), options));
      };
      if (typeof value === 'function') return (...args: unknown[]) => context.step(() => value.apply(object, args));
      if (value && typeof value === 'object') return wrap(value);
      return value;
    } }); cache.set(target, proxy); return proxy;
  };
  return wrap(prisma);
}

export async function handleExtensionGenerate(request: Request, action: (context: ExtensionGenerateContext) => Promise<Response>): Promise<Response> {
  const startedAt = Date.now(), deadline = performance.now() + 55000, nativeSignal = request.signal, headers = new Headers(request.headers), readBody = request.text.bind(request);
  const controller = new AbortController(), captured = new Request(request.url, { method: 'POST', headers, signal: controller.signal });
  let retired = false, expiresAt = startedAt + 55000, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; controller.abort(); rejectWait(Error('Generation unconfirmed')); } };
  const check = () => { if (nativeSignal.aborted || performance.now() >= deadline || Date.now() < startedAt || Date.now() >= expiresAt) retire(); if (retired) throw Error('Generation unconfirmed'); };
  const run = async <T,>(operation: () => Promise<T>) => { check(); const original = Promise.resolve().then(() => { check(); return operation(); }); void original.catch(() => {}); const value = await Promise.race([original, stopped]); check(); return value; };
  const timer = setTimeout(retire, 55000); nativeSignal.addEventListener('abort', retire, { once: true });
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const header = headers.get('authorization'); if (!header || !/^Bearer [a-f0-9]{64}$/.test(header)) return reply({ error: 'No autorizado' }, 401);
    const token = header.slice(7), row = await run(() => lookup(token)); if (!eligible(row, token) || !row) return reply({ error: 'No autorizado' }, 401);
    const tokenId = row.id, ownerId = row.userId, email = row.user.email!, verifiedAt = row.user.emailVerified!.getTime(), tokenExpires = row.expiresAt.getTime();
    expiresAt = Math.min(expiresAt, tokenExpires); check();
    const plan = planSnapshot(await run(() => planLookup(ownerId))); expiresAt = Math.min(expiresAt, plan.horizon); check();
    const recheck = async () => {
      const fresh = await run(() => lookup(token));
      if (!eligible(fresh, token) || !fresh || fresh.id !== tokenId || fresh.userId !== ownerId || fresh.user.email !== email
        || fresh.user.emailVerified!.getTime() !== verifiedAt || fresh.expiresAt.getTime() !== tokenExpires) throw Error('Generation credential changed');
      if (planSnapshot(await run(() => planLookup(ownerId))).value !== plan.value) throw Error('Generation plan changed'); check();
    };
    const step = async <T,>(operation: () => Promise<T>) => { try { await recheck(); const value = await run(operation); await recheck(); return value; } catch (e) { retire(); throw e; } };
    const operationKey = headers.get('idempotency-key'), recovery = headers.get('x-generation-recovery');
    if (operationKey !== null && !/^[A-Za-z0-9._:-]{1,128}$/.test(operationKey)) return reply({ error: 'Invalid operation key' }, 400);
    if (recovery !== null && (recovery !== 'retained-only-v1' || operationKey === null)) return reply({ error: 'Invalid recovery mode' }, 400);
    const raw = await step(readBody); if (new TextEncoder().encode(raw).length > 131072) return reply({ error: 'Invalid body' }, 400);
    let body; try { body = JSON.parse(raw); } catch { return reply({ error: 'Invalid body' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.template !== 'string' || body.template.length > 128
      || !body.inputs || typeof body.inputs !== 'object' || Array.isArray(body.inputs) || Object.keys(body.inputs).length > 64
      || Object.entries(body.inputs).some(([k, v]) => k.length > 128 || typeof v !== 'string' || v.length > (k === '_previousContent' ? 32000 : 500))
      || body.lang != null && typeof body.lang !== 'string') return reply({ error: 'Invalid body' }, 400);
    const frozen = Object.freeze({ template: body.template, inputs: Object.freeze({ ...body.inputs }) as Readonly<Record<string, string>>, ...(body.lang == null ? {} : { lang: body.lang }) });
    const context = Object.freeze({ [contextBrand]: true as const, owner: Object.freeze({ id: ownerId, email, isPro: plan.isPro }), body: frozen,
      request: captured, operationKey, recovery, signal: controller.signal, check, step }); contexts.set(context, { value: context, used: false, check });
    const response = await run(() => action(context));
    if (!contexts.get(context)?.used || !(response instanceof Response) || response.headers.has('set-cookie')) throw Error('Generation response unavailable');
    const text = await step(() => response.text()); if (new TextEncoder().encode(text).length > 262144) throw Error('Generation response too large');
    let value; try { value = JSON.parse(text); } catch { throw Error('Generation response unavailable'); }
    await recheck(); check(); return reply(value, response.status);
  } catch { retire(); return reply({ error: 'Generation unconfirmed', code: 'text_result_unconfirmed', retryMayConsume: false }, 503); }
  finally { retire(); clearTimeout(timer); nativeSignal.removeEventListener('abort', retire); }
}
