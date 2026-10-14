import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

declare const keywordsBrand: unique symbol;
type KeywordsOriginal = { readonly [keywordsBrand]: true };
type Own = { token: string; tokenId: string; userId: string; email: string; verifiedAt: number;
  tokenExpires: number; capturedAt: number; expiresAt: number; readRef: string; request: Request; used: boolean };
const originals = new WeakMap<object, Own>();
const keywordContextBrand = Symbol('keyword-context-original');
const contexts = new WeakMap<object, { cap: KeywordsOriginal; check: () => void; value: ExtensionKeywordContext; used: boolean }>();
const lookup = (token: string) => prisma.extensionToken.findUnique({ where: { token },
  include: { user: { select: { id: true, email: true, emailVerified: true } } } });
function eligible(row: Awaited<ReturnType<typeof lookup>>, token: string) {
  const now = Date.now();
  return !!row && row.token === token && typeof row.id === 'string' && !!row.id && row.id.length <= 128
    && row.user && typeof row.user.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.user.id) && row.userId === row.user.id
    && typeof row.user.email === 'string' && row.user.email.length <= 254 && row.user.email === row.user.email.trim().toLowerCase()
    && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(row.user.email)
    && row.expiresAt instanceof Date && Number.isFinite(row.expiresAt.getTime()) && row.expiresAt.getTime() > now
    && row.user.emailVerified instanceof Date && Number.isFinite(row.user.emailVerified.getTime()) && row.user.emailVerified.getTime() <= now;
}
export async function authorizeExtensionKeywords(request: Request): Promise<KeywordsOriginal | null> {
  const capturedAt = Date.now(), header = request.headers.get('authorization'), readRef = request.headers.get('x-ytv-read-ref');
  if (request.signal.aborted || !Number.isSafeInteger(capturedAt) || capturedAt < 0 || !header || !/^Bearer [a-f0-9]{64}$/.test(header)
    || !readRef || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(readRef)) return null;
  const token = header.slice(7), row = await lookup(token);
  if (!eligible(row, token) || !row || !row.user.email) return null;
  const expiresAt = Math.min(capturedAt + 25000, row.expiresAt.getTime());
  if (request.signal.aborted || Date.now() < capturedAt || Date.now() >= expiresAt) return null;
  const cap = Object.freeze({}) as KeywordsOriginal;
  originals.set(cap, { token, tokenId: row.id, userId: row.user.id, email: row.user.email,
    verifiedAt: row.user.emailVerified!.getTime(), tokenExpires: row.expiresAt.getTime(), capturedAt, expiresAt,
    readRef, request, used: false });
  return cap;
}
function retained(cap: KeywordsOriginal) {
  const own = cap && typeof cap === 'object' ? originals.get(cap) : undefined, now = Date.now();
  if (!own || own.request.signal.aborted || now < own.capturedAt || now >= own.expiresAt) throw Error('Keyword original unavailable');
  return own;
}
export function readExtensionKeywordsOwner(cap: KeywordsOriginal) {
  const own = retained(cap); if (own.used) throw Error('Keyword original used'); own.used = true;
  // Extension keyword lookup remains available to verified Free users. This
  // purpose grants neither paid access, usage activity nor cache recovery.
  return Object.freeze({ userId: own.userId, readRef: own.readRef, observedAt: new Date(own.capturedAt).toISOString(), expiresAt: own.expiresAt });
}
export async function recheckExtensionKeywords(cap: KeywordsOriginal, check: () => void) {
  const own = retained(cap); if (!own.used) throw Error('Keyword purpose not consumed');
  const row = await lookup(own.token); retained(cap); check();
  if (!eligible(row, own.token) || !row || row.id !== own.tokenId || row.userId !== own.userId || row.user.email !== own.email
    || row.expiresAt.getTime() !== own.tokenExpires || row.user.emailVerified!.getTime() !== own.verifiedAt) throw Error('Keyword credential changed');
}
export type ExtensionKeywordContext = {
  readonly [keywordContextBrand]: true;
  keyword: string; language: 'es' | 'en';
  step: <T>(operation: () => Promise<T>) => Promise<T>;
  reply: (data: unknown, cacheExpiresAt?: Date) => Promise<Response>;
};
export function consumeExtensionKeywordContext(context: ExtensionKeywordContext): ExtensionKeywordContext {
  const own = context && typeof context === 'object' ? contexts.get(context) : undefined;
  if (!own || own.used) throw Error('Keyword producer context unavailable');
  retained(own.cap); own.check(); own.used = true; return own.value;
}
export async function handleExtensionKeywords(request: Request, analyze: (context: ExtensionKeywordContext) => Promise<Response>): Promise<Response> {
  const startedAt = Date.now(), deadline = performance.now() + 25000;
  const captured = new Request(request.url, { method: 'POST', headers: new Headers(request.headers), signal: request.signal });
  let retired = false, cap: KeywordsOriginal | undefined, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Keyword request unconfirmed')); } };
  const timer = setTimeout(retire, 25000); request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline || Date.now() < startedAt) retire();
    if (retired) throw Error('Keyword request unconfirmed'); if (cap) retained(cap); };
  const run = async <T,>(operation: () => Promise<T>) => { check(); const original = Promise.resolve().then(() => { check(); return operation(); });
    void original.catch(() => {}); const result = await Promise.race([original, stopped]); check(); return result; };
  const json = (data: unknown, status: number) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const granted = await run(() => authorizeExtensionKeywords(captured)); if (!granted) return json({ error: 'Unauthorized' }, 401); cap = granted;
    const owner = readExtensionKeywordsOwner(cap), raw = await run(() => request.text());
    if (new TextEncoder().encode(raw).length > 4096) return json({ error: 'invalid_keyword' }, 400);
    let body: unknown; try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_keyword' }, 400); }
    const input = body as { keyword?: unknown; lang?: unknown };
    if (!input || Array.isArray(input) || typeof input !== 'object' || typeof input.keyword !== 'string' || !input.keyword
      || input.keyword !== input.keyword.trim() || input.keyword.length > 200 || /[\x00-\x1f\x7f]/.test(input.keyword)
      || !['en', 'es'].includes(input.lang as string)) return json({ error: 'invalid_keyword' }, 400);
    const keyword = input.keyword, language = input.lang as 'es' | 'en';
    const recheck = () => run(() => recheckExtensionKeywords(cap!, check));
    const step = async <T,>(operation: () => Promise<T>) => { await recheck(); const value = await run(operation); await recheck(); return value; };
    const reply = async (data: unknown, cacheExpiresAt?: Date) => { await recheck();
      if (cacheExpiresAt && (!(cacheExpiresAt instanceof Date) || !Number.isFinite(cacheExpiresAt.getTime()) || cacheExpiresAt.getTime() <= Date.now())) throw Error('Keyword cache expired');
      const result = json({ ...owner, keyword, language, sourceStatus: cacheExpiresAt ? 'cached-unconfirmed' : 'collected-unconfirmed',
        cacheExpiresAt: cacheExpiresAt?.toISOString() ?? null, data }, 200); check(); return result; };
    const context = Object.freeze({ [keywordContextBrand]: true as const, keyword, language, step, reply });
    contexts.set(context, { cap, check, value: context, used: false });
    const response = await run(() => analyze(context)); check(); return response;
  } catch { retire(); return json({ error: 'keywords_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
