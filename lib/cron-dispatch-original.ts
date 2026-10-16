import { timingSafeEqual } from 'node:crypto';

declare const nativeCronDispatch: unique symbol;
export type NativeCronDispatch = { readonly [nativeCronDispatch]: true };
type Slot = 'morning' | 'evening';
type Original = { request: Request; url: string; secret: string; configured: string; header: string;
  at: number; until: number; started: number; deadline: number; used: boolean };
const originals = new WeakMap<object, Original>();

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
    originals.set(original, { request, url: request.url, secret, configured, header, at, until: at + lifetime,
      started, deadline: started + lifetime, used: false });
    return original;
  } catch { return null; }
}

// This owns only entry into the next cron job. It neither admits downstream
// writers nor resumes/cancels work already invoked. Await that same promise;
// its own native producer/receipt retains responsibility for completion.
export async function runCronDispatch<T>(original: NativeCronDispatch | null,
  run: (step: <V>(work: () => Promise<V>) => Promise<V>) => Promise<T>): Promise<T> {
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
  try { check(); const result = await run(step); check(); return result; }
  finally { retired = true; }
}
