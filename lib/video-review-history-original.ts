import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { videoReviewObject, videoReviewCommand, reviewHistoryResult, videoReviewResult, reviewTemplate, type ReviewHistory } from '@/lib/video-review-contract';
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const address = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && v === v.trim().toLowerCase() && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(v);
const date = (v: unknown): v is Date => v instanceof Date && Number.isFinite(v.getTime()) && v.getTime() >= 0;
function fail(message = 'videoReview_unconfirmed'): never { throw Error(message); }

// This closure retains the actual HTTP producer. Input, IDs and stored rows
// only restrict it; none can recreate, renew or resume a retired invocation.
export async function videoReviewHistoryOriginal(request: Request): Promise<ReviewHistory> {
  const startedAt = Date.now(), deadline = performance.now() + 25000;
  const controller = new AbortController(), signal = controller.signal;
  const origin = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const cookie = request.headers.get('cookie'), commandRef = request.headers.get('idempotency-key');
  const requestOrigin = request.headers.get('origin'), contentType = request.headers.get('content-type');
  const url = new URL(request.url), nativeFetch = fetch;
  let expiresAt = startedAt + 25000, closed = false, rejectStop!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (closed) return; closed = true; controller.abort(); rejectStop(Error('videoReview_unconfirmed')); };
  const check = () => {
    if (closed || request.signal.aborted || signal.aborted || Date.now() < startedAt || Date.now() >= expiresAt
      || performance.now() >= deadline || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== origin) { retire(); fail(); }
  };
  const step = async <T>(action: () => Promise<T>): Promise<T> => {
    check(); const pending = Promise.resolve().then(() => { check(); return action(); }); void pending.catch(() => {});
    const result = await Promise.race([pending, stopped]); check(); return result;
  };
  let timer = setTimeout(retire, 25000);
  const arm = () => { clearTimeout(timer); timer = setTimeout(retire, Math.max(0, Math.min(expiresAt - Date.now(), deadline - performance.now()))); };
  request.signal.addEventListener('abort', retire, { once: true });
  async function text(body: ReadableStream<Uint8Array> | null, limit: number) {
    if (!body) fail(); const reader = body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0, result = '';
    try { for (;;) {
      const part = await step(() => reader.read()); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > limit) fail(limit === 4096 ? 'invalid_input' : 'videoReview_unconfirmed'); result += decoder.decode(part.value, { stream: true });
    } return result + decoder.decode(); }
    finally { void reader.cancel().catch(() => {}); }
  }
  try {
    if (!origin || !cookie || !videoReviewCommand(commandRef) || request.method !== 'GET'
      || request.headers.has('x-ytv-recovery') || request.headers.has('x-ytv-resume')) fail('invalid_input');
    const configured = new URL(origin);
    if (configured.username || configured.password || configured.search || configured.hash || configured.pathname !== '/'
      || configured.protocol !== 'https:' && !(configured.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname))
      || url.origin !== configured.origin || requestOrigin !== null && requestOrigin !== configured.origin || url.pathname !== '/api/youtube/seo-score' || url.hash) fail('unauthorized');
    // Freeze and bound ingress before auth/provider work. A header changed
    // after the first yield never changes identity or dispatch.
    const lang = url.searchParams.get('lang'); if (!['es', 'en'].includes(lang ?? '') || [...url.searchParams.keys()].join(',') !== 'lang') fail('invalid_input');
    const native = await step(() => readNativeSessionCookie(new Request(new URL('/api/auth/session', origin), { headers: { cookie }, signal })));
    if (!native) fail('unauthorized');
    const decoded = videoReviewObject(native);
    const { id, sub, email, authSessionRef, iat, exp, requiresVerification, requiresTotp } = decoded;
    if (!identifier(id) || sub !== id || !address(email) || !videoReviewCommand(authSessionRef) || requiresVerification !== false || requiresTotp !== false
      || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat > startedAt / 1000
      || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000) || iat >= exp || exp * 1000 <= Date.now()) fail('unauthorized');
    expiresAt = Math.min(expiresAt, exp * 1000); check(); arm();
    const account = async () => step(() => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } }));
    const plan = async () => step(() => prisma.subscription.findUnique({ where: { userId: id }, select: { id: true, plan: true, status: true, stripeCustomerId: true, currentPeriodEnd: true } }));
    const channel = async () => step(() => prisma.youtubeToken.findUnique({ where: { userId: id }, select: { id: true, userId: true, channelId: true, accessToken: true, expiresAt: true } }));
    const a = await account();
    if (!a || a.id !== id || a.email !== email || !date(a.emailVerified) || a.emailVerified.getTime() > Date.now()) fail('unauthorized');
    const verifiedAt = a.emailVerified.getTime();
    const checkAccount = async () => { const row = await account(); if (!row || row.id !== id || row.email !== email || !date(row.emailVerified) || row.emailVerified.getTime() !== verifiedAt) fail('unauthorized'); check(); };
    await checkAccount();
    // SQL bounds both row count and selected text. These are historical reads,
    // never an admission lookup, replay, settlement or recovered operation ACK.
    const rows = await step(() => prisma.$queryRaw<{ id: string; output: string; createdAt: Date }[]>`SELECT id,LEFT(output,131073) AS output,"createdAt" FROM generations WHERE "userId"=${id} AND template=${reviewTemplate} ORDER BY "createdAt" DESC,id DESC LIMIT 5`);
    check(); if (!Array.isArray(rows) || rows.length > 5) fail(); const entries: ReviewHistory['entries'] = []; let omitted = 0;
    for (const row of rows) { try { if (typeof row.output !== 'string' || new TextEncoder().encode(row.output).length > 131072 || !date(row.createdAt) || row.createdAt.getTime() > startedAt) throw Error(); const review = videoReviewResult(JSON.parse(row.output)); if (!review.persisted || review.reviewAnalysis.userId !== id || review.reviewAnalysis.asOf !== row.createdAt.getTime() || row.id !== 'private_video_review_' + review.reviewAnalysis.commandRef) throw Error(); entries.push({ id: row.id, recordedAt: row.createdAt.toISOString(), review }); } catch { omitted++; } }
    await checkAccount();
    const old = await step(() => prisma.$queryRaw<{ id: string; videoId: string; title: string | null; analyzedAt: Date }[]>`SELECT id,"videoId",LEFT(title,500) AS title,"analyzedAt" FROM video_seo_scores WHERE "userId"=${id} ORDER BY "analyzedAt" DESC,id DESC LIMIT 5`);
    check(); if (!Array.isArray(old) || old.length > 5) fail(); const legacy: ReviewHistory['legacy'] = [];
    for (const row of old) { if (typeof row.id !== 'string' || !row.id || row.id.length > 128 || typeof row.videoId !== 'string' || row.videoId.length > 128 || row.title !== null && typeof row.title !== 'string' || !date(row.analyzedAt) || row.analyzedAt.getTime() > startedAt) { omitted++; continue; } legacy.push({ id: row.id, videoId: row.videoId, title: row.title, recordedAt: row.analyzedAt.toISOString() }); }
    await checkAccount(); check(); return reviewHistoryResult({ entries, legacy, omitted, historyAnalysis: { commandRef, userId: id, email, sessionRef: authSessionRef, lang, asOf: startedAt, expiresAt, limit: 5, historicalOnly: true } });
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); retire(); }
}
