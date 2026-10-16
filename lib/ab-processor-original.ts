import { randomUUID, timingSafeEqual } from 'node:crypto';
declare const nativeAbProcessor: unique symbol;
export type NativeAbProcessor = {
    readonly [nativeAbProcessor]: true;
};
type Original = {
    request: Request;
    secret: string;
    configured: string;
    header: string;
    at: number;
    deadline: number;
    command: string;
    used: boolean;
};
const originals = new WeakMap<object, Original>();
export function authorizeNativeAbProcessor(request: Request): NativeAbProcessor | null {
    const at = Date.now(), secret = process.env.CRON_SECRET, configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL, header = request.headers.get('authorization'), deadline = performance.now() + 55000;
    try {
        if (!secret || secret.length < 16 || secret.length > 4096 || /[\r\n]/.test(secret) || !configured || !header || request.signal.aborted || request.method !== 'GET')
            return null;
        const url = new URL(request.url), origin = new URL(configured), expected = 'Bearer ' + secret;
        if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) || url.origin !== origin.origin || url.pathname !== '/api/cron/evening' || url.search || url.hash || request.headers.has('x-ytv-resume') || request.headers.has('x-ytv-recovery') || Buffer.byteLength(header) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(header), Buffer.from(expected)))
            return null;
        const result = Object.freeze({}) as NativeAbProcessor;
        originals.set(result, { request, secret, configured, header, at, deadline, command: randomUUID(), used: false });
        return result;
    }
    catch {
        return null;
    }
}
// Only a live native request enters once. Limits can only retire it earlier;
// dates,serialized fields and database rows cannot create or resume an original.
export async function runNativeAbProcessor<T>(original: NativeAbProcessor | null | undefined, run: (context: {
    check: () => void;
    shortenLifetime: (until: number) => void;
    at: number;
    signal: AbortSignal;
    command: string;
}) => Promise<T>, unconfirmed: T): Promise<T> {
    const own = original && originals.get(original);
    if (!own || own.used)
        return unconfirmed;
    own.used = true;
    let retired = false, rejectStop!: (e: Error) => void, timer: ReturnType<typeof setTimeout> | undefined, until = own.at + 55000, deadline = own.deadline;
    const stop = new Promise<never>((_, reject) => { rejectStop = reject; });
    void stop.catch(() => { });
    const retire = () => { if (!retired) {
        retired = true;
        rejectStop(Error('ab_processor_unconfirmed'));
    } };
    const check = () => { if (retired || own.request.signal.aborted || Date.now() < own.at || Date.now() >= until || performance.now() >= deadline || process.env.CRON_SECRET !== own.secret || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== own.configured || own.request.headers.get('authorization') !== own.header) {
        retire();
        throw Error('ab_processor_unconfirmed');
    } };
    const arm = () => { if (timer !== undefined)
        clearTimeout(timer); timer = setTimeout(retire, Math.max(0, Math.min(until - Date.now(), deadline - performance.now()))); };
    const shortenLifetime = (expiry: number) => { check(); if (!Number.isFinite(expiry))
        throw Error('ab_processor_unconfirmed'); until = Math.min(until, expiry); deadline = Math.min(deadline, performance.now() + Math.max(0, expiry - Date.now())); check(); arm(); };
    arm();
    own.request.signal.addEventListener('abort', retire, { once: true });
    try {
        check();
        const producer = Promise.resolve().then(() => { check(); return run({ check, shortenLifetime, at: own.at, signal: own.request.signal, command: own.command }); });
        void producer.catch(() => { });
        const result = await Promise.race([producer, stop]);
        check();
        return result;
    }
    catch {
        return unconfirmed;
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
        own.request.signal.removeEventListener('abort', retire);
        retire();
    }
}
