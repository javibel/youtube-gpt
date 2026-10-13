import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { prepareDomainEmailOriginal, dispatchDomainEmailOriginal } from '@/lib/send-email';

export type ForgotPasswordInput = Readonly<{ kind: 'forgot-password-input' }>;
type Input = { email: string; lang: 'es' | 'en' };
const inputs = new WeakMap<ForgotPasswordInput, Input>();
export function parseForgotPasswordInput(value: unknown): ForgotPasswordInput | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !['email', 'lang'].includes(key)) || typeof row.email !== 'string'
    || row.lang !== undefined && row.lang !== 'es' && row.lang !== 'en') return;
  const email = row.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(email)) return;
  const input: ForgotPasswordInput = Object.freeze({ kind: 'forgot-password-input' });
  inputs.set(input, { email, lang: row.lang ?? 'es' }); return input;
}
// Exposes captured email solely to the route's negative rate-limit check.
export function forgotPasswordLimitEmail(input: ForgotPasswordInput): string | undefined { return inputs.get(input)?.email; }
export type ForgotPasswordJob = Readonly<{ kind: 'forgot-password-job-original' }>;
export type ForgotPasswordOutcome = 'provider-accepted' | 'not-required' | 'busy' | 'not-configured' | 'not-issued' | 'unconfirmed';
type Captured = Input & { origin: string };
type Own = { captured: Captured | null; promise?: Promise<ForgotPasswordOutcome> };
type Receipt = { outcome: string; email: string | null; userId: string | null; noticeId: string | null; tokenId: string | null; token: string | null; expiresAt: string | null };
const jobs = new WeakMap<ForgotPasswordJob, Own>();
export function prepareForgotPasswordJob(input: ForgotPasswordInput, origin: string | undefined): ForgotPasswordJob | undefined {
  const captured = inputs.get(input); inputs.delete(input);
  if (!captured || !origin) return;
  try {
    const url = new URL(origin);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) return;
    const job: ForgotPasswordJob = Object.freeze({ kind: 'forgot-password-job-original' });
    jobs.set(job, { captured: { ...captured, origin: url.origin } }); return job;
  } catch { return; }
}

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function message(row: Receipt, captured: Captured) {
  const url = new URL('/reset-password', captured.origin); url.searchParams.set('token', row.token!);
  const en = captured.lang === 'en', subject = en ? 'Reset your password - YTubViral' : 'Restablecer contraseña - YTubViral';
  const intro = en ? 'We received a request to reset your password.' : 'Recibimos una solicitud para restablecer tu contraseña.';
  const expiry = (en ? 'This link expires at: ' : 'Este enlace caduca el: ') + row.expiresAt;
  const ignore = en ? 'If you did not request this, you can ignore this email.' : 'Si no solicitaste esto, puedes ignorar este correo.';
  const button = en ? 'Reset password' : 'Restablecer contraseña';
  return { to: row.email!, subject, html: '<!DOCTYPE html><html lang="' + (en ? 'en' : 'es') + '"><body><h1>' + escape(subject)
    + '</h1><p>' + escape(intro) + '</p><p>' + escape(expiry) + '</p><a href="' + escape(url.href) + '">' + button
    + '</a><p>' + escape(ignore) + '</p></body></html>', text: intro + '\n' + expiry + '\n' + button + ': ' + url.href + '\n' + ignore,
    isTransactional: true, idempotencyKey: row.noticeId! };
}

// Scheduling captures one live job, never a restored queue item from JSON/IDs.
// Its native SQL ACK owns the token and marker. The marker is negative exclusion
// only; unknown SQL/scheduling/provider/close ACK never permits adoption/replay.
export function dispatchForgotPasswordJob(job: ForgotPasswordJob): Promise<ForgotPasswordOutcome> {
  const own = jobs.get(job); if (!own) return Promise.resolve('not-issued');
  if (own.promise) return own.promise;
  own.promise = Promise.resolve().then(async (): Promise<ForgotPasswordOutcome> => {
    try {
      const captured = own.captured!, token = randomBytes(32).toString('hex'), noticeId = randomUUID(), tokenId = randomUUID();
      const rows = await prisma.$queryRawUnsafe<Receipt[]>(
        `WITH account AS MATERIALIZED (
           SELECT id, email FROM users WHERE email=$1 FOR UPDATE
         ), admitted AS (
           INSERT INTO password_reset_request_admissions (email,"noticeId","userId","tokenId","createdAt")
           SELECT email,$3,id,$4,timezone('UTC',clock_timestamp()) FROM account
           ON CONFLICT (email) DO NOTHING RETURNING email,"noticeId","userId","tokenId"
         ), removed AS (
           DELETE FROM password_reset_tokens AS t USING admitted AS a WHERE t.email=a.email RETURNING t.id
         ), inserted AS (
           INSERT INTO password_reset_tokens (id,email,token,expires,"createdAt")
           SELECT $4,email,$2,timezone('UTC',clock_timestamp())+INTERVAL '1 hour',timezone('UTC',clock_timestamp())
           FROM admitted WHERE (SELECT count(*) FROM removed)>=0 RETURNING id,email,token,expires
         )
         SELECT CASE WHEN EXISTS(SELECT 1 FROM inserted) THEN 'prepared'
           WHEN EXISTS(SELECT 1 FROM account) THEN 'busy' ELSE 'not-required' END AS outcome,
           (SELECT email FROM inserted) AS email,(SELECT "userId" FROM admitted) AS "userId",
           (SELECT "noticeId" FROM admitted) AS "noticeId",(SELECT id FROM inserted) AS "tokenId",
           (SELECT token FROM inserted) AS token,
           (SELECT to_char(expires,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM inserted) AS "expiresAt"`,
        captured.email, token, noticeId, tokenId,
      );
      if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || Object.keys(rows[0]).length !== 7) return 'unconfirmed';
      const row = rows[0];
      if (['busy', 'not-required'].includes(row.outcome) && Object.entries(row).every(([key, value]) => key === 'outcome' || value === null))
        return row.outcome as 'busy' | 'not-required';
      if (row.outcome !== 'prepared' || row.email !== captured.email || row.token !== token || row.noticeId !== noticeId || row.tokenId !== tokenId
        || typeof row.userId !== 'string' || !/^[\w-]{1,128}$/.test(row.userId)
        || typeof row.expiresAt !== 'string' || new Date(row.expiresAt).toISOString() !== row.expiresAt) return 'unconfirmed';
      // Dependent eligibility can only deny the live original, never recreate it.
      const eligible = await prisma.$queryRawUnsafe<{ eligible: boolean }[]>(
        `SELECT EXISTS(
           SELECT 1 FROM password_reset_request_admissions AS a JOIN users AS u ON u.id=a."userId" AND u.email=a.email
           JOIN password_reset_tokens AS t ON t.id=a."tokenId" AND t.email=a.email
           WHERE a.email=$1 AND a."noticeId"=$2 AND a."userId"=$3 AND a."tokenId"=$4 AND t.token=$5
             AND t.expires=$6::timestamp AND t.expires>timezone('UTC',clock_timestamp())
         ) AS eligible`, row.email, row.noticeId, row.userId, row.tokenId, row.token, row.expiresAt,
      );
      if (!Array.isArray(eligible) || eligible.length !== 1 || Object.keys(eligible[0]).length !== 1 || typeof eligible[0]?.eligible !== 'boolean') return 'unconfirmed';
      let outcome: ForgotPasswordOutcome = 'not-issued';
      if (eligible[0].eligible) {
        const original = prepareDomainEmailOriginal(message(row, captured));
        outcome = original ? await dispatchDomainEmailOriginal(original) : 'not-issued';
      }
      if (!['provider-accepted', 'not-configured', 'not-issued'].includes(outcome)) return 'unconfirmed';
      // This original alone can close its own marker after known native terminal.
      const closed = await prisma.$queryRawUnsafe<{ noticeId: string }[]>(
        `DELETE FROM password_reset_request_admissions WHERE email=$1 AND "noticeId"=$2 AND "userId"=$3 AND "tokenId"=$4 RETURNING "noticeId"`,
        row.email, row.noticeId, row.userId, row.tokenId,
      );
      return Array.isArray(closed) && closed.length === 1 && Object.keys(closed[0]).length === 1 && closed[0]?.noticeId === noticeId ? outcome : 'unconfirmed';
    } catch { return 'unconfirmed'; }
    finally { own.captured = null; }
  });
  return own.promise;
}
