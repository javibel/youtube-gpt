import { timingSafeEqual } from 'node:crypto';

declare const nativeCronDispatch: unique symbol;
export type NativeCronDispatch = { readonly [nativeCronDispatch]: true };
declare const nativeCronDailyTip: unique symbol;
export type NativeCronDailyTip = { readonly [nativeCronDailyTip]: true };
declare const nativeCronDailyIdeas: unique symbol;
export type NativeCronDailyIdeas = { readonly [nativeCronDailyIdeas]: true };
type Slot = 'morning' | 'evening';
type Original = { request: Request; url: string; slot: Slot; secret: string; configured: string; header: string;
  at: number; until: number; started: number; deadline: number; used: boolean };
const originals = new WeakMap<object, Original>();
const dailyTips = new WeakMap<object, { date: string; check: () => void; promise?: Promise<unknown> }>();
const dailyIdeas = new WeakMap<object, { date: string; check: () => void; promise?: Promise<unknown> }>();

export function authorizeCronDispatch(request: Request, slot: Slot): NativeCronDispatch | null {
  try {
    const secret = process.env.CRON_SECRET, configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    const header = request.headers.get('authorization');
    if (!['morning', 'evening'].includes(slot) || !secret || secret.length < 16 || secret.length > 4096
      || /[\r\n]/.test(secret) || !configured || !header || request.method !== 'GET' || request.signal.aborted) return null;
    const url = new URL(request.url), origin = new URL(configured), expected = 'Bearer ' + secret;
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
      || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))
      || url.origin !== origin.origin || url.pathname !== '/api/cron/' + slot || url.search || url.hash
      || request.headers.has('x-ytv-resume') || request.headers.has('x-ytv-recovery')
      || Buffer.byteLength(header) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(header), Buffer.from(expected))) return null;
    const at = Date.now(), started = performance.now(), lifetime = slot === 'morning' ? 115000 : 55000;
    const original = Object.freeze({}) as NativeCronDispatch;
    originals.set(original, { request, url: request.url, slot, secret, configured, header, at, until: at + lifetime,
      started, deadline: started + lifetime, used: false });
    return original;
  } catch { return null; }
}

// This owns only entry into the next cron job. It neither admits downstream
// writers nor resumes/cancels work already invoked. Await that same promise;
// its own native producer/receipt retains responsibility for completion.
export async function runCronDispatch<T>(original: NativeCronDispatch | null,
  run: (step: <V>(work: () => Promise<V>) => Promise<V>, issueDailyTip: () => NativeCronDailyTip, issueDailyIdeas: () => NativeCronDailyIdeas) => Promise<T>): Promise<T> {
  const own = original && originals.get(original);
  if (!own || own.used) throw Error('cron_invocation_unconfirmed');
  own.used = true;
  let retired = false;
  const check = () => {
    if (retired || own.request.signal.aborted || Date.now() < own.at || Date.now() >= own.until
      || performance.now() < own.started || performance.now() >= own.deadline
      || own.request.method !== 'GET' || own.request.url !== own.url
      || own.request.headers.has('x-ytv-resume') || own.request.headers.has('x-ytv-recovery')
      || process.env.CRON_SECRET !== own.secret
      || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== own.configured
      || own.request.headers.get('authorization') !== own.header) {
      retired = true;
      throw Error('cron_invocation_unconfirmed');
    }
  };
  const step = async <V>(work: () => Promise<V>): Promise<V> => {
    check();
    const result = await work();
    check();
    return result;
  };
  let issued = false;
  const issueDailyTip = (): NativeCronDailyTip => {
    check();
    if (own.slot !== 'morning' || issued) throw Error('daily_tip_unconfirmed');
    issued = true;
    const child = Object.freeze({}) as NativeCronDailyTip;
    // Original UTC day is fixed. A date/body/SQL row cannot issue this child.
    const date = new Date(own.at).toISOString().slice(0, 10);
    dailyTips.set(child, { date, check: () => {
      check();
      if (new Date(Date.now()).toISOString().slice(0, 10) !== date) throw Error('daily_tip_unconfirmed');
    } });
    return child;
  };
  let ideasIssued = false;
  const issueDailyIdeas = (): NativeCronDailyIdeas => {
    check();
    if (own.slot !== 'morning' || ideasIssued) throw Error('daily_ideas_unconfirmed');
    ideasIssued = true;
    const child = Object.freeze({}) as NativeCronDailyIdeas;
    const date = new Date(own.at).toISOString().slice(0, 10);
    dailyIdeas.set(child, { date, check: () => {
      check();
      if (new Date(Date.now()).toISOString().slice(0, 10) !== date) throw Error('daily_ideas_unconfirmed');
    } });
    return child;
  };
  try { check(); const result = await run(step, issueDailyTip, issueDailyIdeas); check(); return result; }
  finally { retired = true; }
}

// Batch purpose is private to the live morning invocation. Its lexical scan and
// each producer still require their own native SQL source and INSERT ACK.
export function runCronDailyIdeas<T>(original: NativeCronDailyIdeas | undefined,
  run: (context: { date: string; checkBeforeDispatch: () => void }) => Promise<T>): Promise<T> {
  const own = original && dailyIdeas.get(original);
  if (!own) return Promise.reject(Error('daily_ideas_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(() => {
    own.check();
    return run({ date: own.date, checkBeforeDispatch: own.check });
  })) as Promise<T>;
}

// Same child joins the same original producer. Only a live morning GET can
// issue it; JSON, an old date, a reservation or another module cannot do so.
export function runCronDailyTip<T>(original: NativeCronDailyTip,
  run: (context: { date: string; checkBeforeDispatch: () => void }) => Promise<T>): Promise<T> {
  const own = original && dailyTips.get(original);
  if (!own) return Promise.reject(Error('daily_tip_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(() => {
    own.check();
    return run({ date: own.date, checkBeforeDispatch: own.check });
  })) as Promise<T>;
}
