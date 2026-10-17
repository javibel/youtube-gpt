import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';

declare const nativeAdminYoutubeComments: unique symbol;
export type NativeAdminYoutubeComments = { readonly [nativeAdminYoutubeComments]: true };
declare const nativeAdminGmailMetadata: unique symbol;
export type NativeAdminGmailMetadata = { readonly [nativeAdminGmailMetadata]: true };
type YoutubeReadContext = Readonly<{ at: number; signal: AbortSignal; checkBeforeRead: () => void; remainingBeforeRead: () => number }>;
const youtubePurposes = new WeakMap<object, { context: YoutubeReadContext; promise?: Promise<unknown> }>();
const gmailPurposes = new WeakMap<object, { context: YoutubeReadContext; promise?: Promise<unknown> }>();
const requests = new WeakMap<Request, Promise<Response>>();

// A callback may consume only a purpose already issued inside the authenticated
// POST below. Neither callbacks nor serialized selectors can create that purpose.
export function runAdminYoutubeComments<T>(purpose: NativeAdminYoutubeComments | undefined, run: (context: YoutubeReadContext) => Promise<T>): Promise<T> {
  const own = purpose && youtubePurposes.get(purpose);
  if (!own) return Promise.reject(Error('youtube_comments_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(async () => {
    own.context.checkBeforeRead(); const value = await run(own.context); own.context.checkBeforeRead(); return value;
  })) as Promise<T>;
}
// A distinct child of this POST carries metadata-read authority only.
export function runAdminGmailMetadata<T>(purpose: NativeAdminGmailMetadata | undefined, run: (context: YoutubeReadContext) => Promise<T>): Promise<T> {
  const own = purpose && gmailPurposes.get(purpose);
  if (!own) return Promise.reject(Error('gmail_metadata_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(async () => {
    own.context.checkBeforeRead(); const value = await run(own.context); own.context.checkBeforeRead(); return value;
  })) as Promise<T>;
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const denied = () => Response.json({ ok: false, error: 'social_messages_unconfirmed' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
const unavailable = () => Response.json({ ok: false, error: 'social_messages_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

// This POST issues only its own read purpose after native authentication and SQL
// source checks. It cannot issue a cron purpose, reply/send intent or full review.
export function handleAdminSocialMessages(request: Request): Promise<Response> {
  const previous = requests.get(request);
  if (previous) return previous;
  const promise = (async () => {
    const at = Date.now(), started = performance.now(), config = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    const adminConfig = process.env.ADMIN_EMAIL, secret = process.env.AUTH_SECRET;
    const cookie = request.headers.get('cookie'), command = request.headers.get('x-ytv-social-messages-command');
    const headerOrigin = request.headers.get('origin'), contentType = request.headers.get('content-type'), url = request.url;
    let until = at + 55000, retired = false, timer: ReturnType<typeof setTimeout> | undefined, rejectStop!: (error: Error) => void;
    const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
    void stopped.catch(() => {});
    const retire = () => { if (retired) return; retired = true; clearTimeout(timer); rejectStop(Error('social_messages_unconfirmed')); };
    const check = () => {
      if (retired || request.signal.aborted || Date.now() < at || Date.now() >= until || performance.now() < started || performance.now() >= started + 55000
        || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== config || process.env.ADMIN_EMAIL !== adminConfig || process.env.AUTH_SECRET !== secret
        || request.method !== 'POST' || request.url !== url || request.headers.get('cookie') !== cookie || request.headers.get('origin') !== headerOrigin
        || request.headers.get('content-type') !== contentType || request.headers.get('x-ytv-social-messages-command') !== command
        || ['x-ytv-resume','x-ytv-recovery','x-ytv-social-preview-command','x-ytv-social-publish-command'].some(key => request.headers.has(key))) throw Error('social_messages_unconfirmed');
    };
    const arm = () => { clearTimeout(timer); timer = setTimeout(retire, Math.max(0, Math.min(until - Date.now(), started + 55000 - performance.now()))); };
    const wait = async <T,>(run: () => Promise<T>): Promise<T> => {
      check();
      // Retiring the HTTP waiter does not cancel or replace an issued native IO.
      const pending = Promise.resolve().then(() => { check(); return run(); });
      void pending.catch(() => {});
      const value = await Promise.race([pending, stopped]); check(); return value;
    };
    request.signal.addEventListener('abort', retire, { once: true });
    arm();
    try {
      if (request.method !== 'POST' || request.signal.aborted || !config || !cookie || !uuid(command) || !contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
        || request.bodyUsed || !ADMIN_EMAIL || ADMIN_EMAIL.length > 254 || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(ADMIN_EMAIL)) return denied();
      check();
      const origin = new URL(config), target = new URL(url);
      if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
        || origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))
        || target.origin !== origin.origin || target.pathname !== '/api/agent/run' || target.search || target.hash || headerOrigin !== origin.origin) return denied();
      const length = request.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > 1024)) return denied();
      const reader = request.body?.getReader(); if (!reader) return denied();
      const chunks: Uint8Array[] = []; let bytes = 0;
      let pendingRead: ReturnType<typeof reader.read> | undefined;
      const read = async () => { const pending = reader.read(); pendingRead = pending; try { return await pending; } finally { if (pendingRead === pending) pendingRead = undefined; } };
      try {
        for (;;) {
          const part = await wait(read);
          if (part.done) break;
          bytes += part.value.byteLength; if (bytes > 1024 || chunks.length >= 32) return denied();
          chunks.push(part.value);
        }
      } finally {
        const release = () => { try { reader.releaseLock(); } catch {} };
        if (pendingRead) void pendingRead.then(release, release); else release();
      }
      const raw = new Uint8Array(bytes); let position = 0;
      for (const chunk of chunks) { raw.set(chunk, position); position += chunk.byteLength; }
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).join(',') !== 'action' || (input as {action:unknown}).action !== 'messages') return denied();
      const native = await wait(() => readNativeSessionCookie(new Request(new URL('/api/auth/session', origin.origin), { headers: { cookie }, signal: request.signal })));
      if (!native || typeof native !== 'object' || Array.isArray(native)) return denied();
      const { id, sub, email, authSessionRef, iat, exp, isAdmin, requiresVerification, requiresTotp } = native;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || sub !== id || email !== ADMIN_EMAIL || !uuid(authSessionRef)
        || isAdmin !== true || requiresVerification !== false || requiresTotp !== false
        || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat > Date.now() / 1000
        || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000) || iat >= exp || exp * 1000 <= Date.now()) return denied();
      until = Math.min(until, exp * 1000); arm(); check();
      const account = await wait(() => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } }));
      if (!account || account.id !== id || account.email !== email || !(account.emailVerified instanceof Date)
        || !Number.isFinite(account.emailVerified.getTime()) || account.emailVerified.getTime() < 0 || account.emailVerified.getTime() > at) return denied();
      const verifiedAt = account.emailVerified.getTime();
      check();
      const purpose = Object.freeze({}) as NativeAdminYoutubeComments;
      youtubePurposes.set(purpose, { context: Object.freeze({ at, signal: request.signal, checkBeforeRead: check,
        remainingBeforeRead: () => { check(); return Math.min(until - Date.now(), started + 55000 - performance.now()); } }) });
      const { readAdminYoutubeComments, consumeYoutubeComments, validateYoutubeCommentsRead } = await wait(() => import('@/lib/agent/youtube-comment-original'));
      const receipt = await wait(() => readAdminYoutubeComments(purpose));
      // The private live receipt is consumed before this POST retires. Its JSON
      // projection is read-only coverage, never a reply or recovery capability.
      const coverage = await wait(() => consumeYoutubeComments(receipt, async ({ comments: _comments, ...window }) => Object.freeze(window)));
      const gmailPurpose = Object.freeze({}) as NativeAdminGmailMetadata;
      gmailPurposes.set(gmailPurpose, { context: Object.freeze({ at, signal: request.signal, checkBeforeRead: check,
        remainingBeforeRead: () => { check(); return Math.min(until - Date.now(), started + 55000 - performance.now()); } }) });
      const { readGmailMetadata, consumeGmailMetadata, validateGmailMetadataRead } = await wait(() => import('@/lib/agent/gmail-metadata-original'));
      const gmailReceipt = await wait(() => readGmailMetadata(gmailPurpose));
      const gmail = await wait(() => consumeGmailMetadata(gmailReceipt, async ({ messages: _messages, ...window }) => Object.freeze(window)));
      if (!coverage.configured && !gmail.configured) return unavailable();
      // Re-reading the original account is a veto after network/body waits. It
      // cannot renew the session, verification date or original request budget.
      const current = await wait(() => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } }));
      if (!current || current.id !== id || current.email !== email || !(current.emailVerified instanceof Date)
        || current.emailVerified.getTime() !== verifiedAt) return denied();
      check();
      validateYoutubeCommentsRead(receipt); validateGmailMetadataRead(gmailReceipt);
      const response = Response.json({ ok: false, error: 'social_messages_unavailable',
        youtube: coverage.configured ? { status: 'read-only', coverage } : { status: 'unavailable' },
        gmail: gmail.configured ? { status: 'read-only-metadata', coverage: gmail } : { status: 'unavailable' },
        messagesRead: { commandRef: command, userId: id, email, sessionRef: authSessionRef, asOf: at, expiresAt: until } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } });
      check(); return response;
    } catch { return unavailable(); }
    finally { retire(); request.signal.removeEventListener('abort', retire); }
  })();
  requests.set(request, promise); return promise;
}
