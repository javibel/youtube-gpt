import { randomUUID } from 'node:crypto';
import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';

const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const sessionRef = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const email = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && v === v.trim().toLowerCase()
  && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(v);
const date = (v: unknown): v is Date => v instanceof Date && Number.isFinite(v.getTime()) && v.getTime() >= 0;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 2_147_483_647;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function fail(reason = 'ab_read_unconfirmed'): never { throw Error(reason); }

// Only this invocation's encrypted incoming cookie establishes its reader.
// Stored history and this response are display data, never a continuation or
// permission to publish, reconcile, release or repeat an uncertain writer.
export async function readAbHistoryOriginal(request: Request): Promise<Response> {
  const requestedAt = Date.now(), deadline = performance.now() + 25_000, commandRef = randomUUID();
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const cookie = request.headers.get('cookie'), incomingOrigin = request.headers.get('origin');
  const readRef = request.headers.get('X-YTV-Read-Ref');
  const bearer = request.headers.has('authorization'), url = new URL(request.url);
  const controller = new AbortController();
  let expiresAt = requestedAt + 25_000, retired = false, rejectStop!: (e: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; controller.abort(); rejectStop(Error('ab_read_unconfirmed')); } };
  const check = () => {
    if (retired || request.signal.aborted || Date.now() < requestedAt || Date.now() >= expiresAt || performance.now() >= deadline
      || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== configured) { retire(); fail(); }
  };
  const step = async <T>(read: () => Promise<T>): Promise<T> => {
    check(); const original = Promise.resolve().then(() => { check(); return read(); }); void original.catch(() => {});
    const value = await Promise.race([original, stopped]); check(); return value;
  };
  let timer = setTimeout(retire, 25_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    check();
    if (request.method !== 'GET' || url.pathname !== '/api/youtube/ab-test' || url.search || url.hash
      || request.headers.has('x-ytv-recovery') || request.headers.has('x-ytv-resume') || readRef !== null && !sessionRef(readRef)) fail('invalid_input');
    if (!configured || !cookie || bearer) fail('unauthorized');
    const origin = new URL(configured);
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
      || origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
      || url.origin !== origin.origin || incomingOrigin !== null && incomingOrigin !== origin.origin) fail('unauthorized');
    const decoded = await step(() => readNativeSessionCookie(new Request(new URL('/api/auth/session', origin.origin), {
      headers: { cookie }, signal: controller.signal,
    })));
    if (!object(decoded)) fail('unauthorized');
    const { id, sub, email: address, authSessionRef, iat, exp, requiresVerification, requiresTotp } = decoded;
    if (!identifier(id) || sub !== id || !email(address) || !sessionRef(authSessionRef) || requiresVerification !== false || requiresTotp !== false
      || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat > requestedAt / 1000
      || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000) || exp <= iat || exp * 1000 <= Date.now()) fail('unauthorized');
    expiresAt = Math.min(expiresAt, exp * 1000); check();
    clearTimeout(timer); timer = setTimeout(retire, Math.max(0, Math.min(expiresAt - Date.now(), deadline - performance.now())));
    const account = () => step(() => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } }));
    const owner = await account();
    if (!owner || owner.id !== id || owner.email !== address || !date(owner.emailVerified) || owner.emailVerified.getTime() > Date.now()) fail('unauthorized');
    const verifiedAt = owner.emailVerified.getTime();
    const current = async () => {
      const value = await account();
      if (!value || value.id !== id || value.email !== address || !date(value.emailVerified) || value.emailVerified.getTime() !== verifiedAt) fail('unauthorized');
      check();
    };
    await current();
    // Bound every textual projection inside SQL as well as the row count.
    // A clipped/invalid field fails validation; it is never presented as full.
    const rows = await step(() => prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'SELECT LEFT(id,129) AS id,"userId",LEFT("videoId",129) AS "videoId",LEFT(thumbnail,2049) AS thumbnail,LEFT("originalTitle",1025) AS "originalTitle",LEFT("variantA",1025) AS "variantA",LEFT("variantB",1025) AS "variantB",LEFT(status,32) AS status,"hoursPerVariant","startedAt","switchedAt","completedAt","initialViews","switchViews","endViews",LEFT(winner,8) AS winner,LEFT("aiInsight"::text,4097) AS "aiInsight" FROM ab_tests WHERE "userId"=$1 ORDER BY "startedAt" DESC,id DESC LIMIT 20', id));
    if (!Array.isArray(rows) || rows.length > 20) fail();
    const tests = rows.map(row => {
      if (!object(row) || !identifier(row.id) || row.userId !== id || !identifier(row.videoId)
        || !text(row.originalTitle, 1024) || !text(row.variantA, 1024) || !text(row.variantB, 1024)
        || !['variant_a', 'variant_b', 'completed', 'cancelled'].includes(row.status as string)
        || !count(row.hoursPerVariant) || row.hoursPerVariant < 1 || row.hoursPerVariant > 168
        || !date(row.startedAt) || row.switchedAt !== null && !date(row.switchedAt) || row.completedAt !== null && !date(row.completedAt)
        || !count(row.initialViews) || row.switchViews !== null && !count(row.switchViews) || row.endViews !== null && !count(row.endViews)
        || row.winner !== null && !['A', 'B', 'tie'].includes(row.winner as string)) fail();
      if (row.thumbnail !== null && row.thumbnail !== '') {
        if (!text(row.thumbnail, 2048)) fail();
        const image = new URL(row.thumbnail);
        if (image.protocol !== 'https:' || image.hostname !== 'i.ytimg.com' || image.username || image.password || image.port || image.search || image.hash
          || !image.pathname.startsWith('/vi/' + row.videoId + '/')) fail();
      }
      let insight: { es: string; en: string } | null = null;
      if (row.aiInsight !== null) {
        if (!text(row.aiInsight, 4096)) fail(); const value = JSON.parse(row.aiInsight);
        if (value !== null) {
          if (!object(value) || Object.keys(value).sort().join(',') !== 'en,es' || !text(value.es, 2000) || !text(value.en, 2000)) fail();
          insight = { es: value.es, en: value.en };
        }
      }
      return { ...row, id: row.id, startedAt: row.startedAt.toISOString(), switchedAt: (row.switchedAt as Date | null)?.toISOString() ?? null,
        completedAt: (row.completedAt as Date | null)?.toISOString() ?? null, aiInsight: insight };
    });
    if (new Set(tests.map(row => row.id)).size !== tests.length) fail();
    await current();
    const response = json({ userId: id, tests, historyRead: { commandRef, readRef, email: address, sessionRef: authSessionRef, sessionExpiresAt: exp * 1000,
      requestedAt, expiresAt, coverage: 'latest-up-to-20-stored-records', sourceOwnership: 'not-verified', operationalFreshness: 'not-verified' } });
    check(); return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    return reason === 'unauthorized' ? json({ error: 'Unauthorized' }, 401)
      : reason === 'invalid_input' ? json({ error: 'invalid_input' }, 400) : json({ error: 'ab_read_unconfirmed' }, 503);
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); retire(); }
}
