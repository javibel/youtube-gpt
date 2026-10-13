import bcrypt from 'bcryptjs';
import type { SignupInput } from '@/lib/signup-input';
import { takeSignupTurnstilePermit, type SignupTurnstilePermit } from '@/lib/signup-turnstile';
import { AFFILIATES_DORMANT } from '@/lib/features';
import { randomInt, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { verificationEmail } from '@/lib/emails';
import { sendDomainEmailOriginal } from '@/lib/send-email';

export type VerificationNotice = Readonly<{ kind: 'email-resend-original' }>;
export type ResendPreparation =
  | { status: 'prepared'; notice: VerificationNotice }
  | { status: 'not-required' | 'busy' | 'unconfirmed' };
type Receipt = {
  outcome: string; noticeId: string | null; tokenId: string | null;
  userId: string | null; email: string | null; name: string | null; token: string | null;
};
type NoticeOutcome = 'provider-accepted' | 'not-configured' | 'not-issued' | 'unconfirmed';
type Original = {
  record: Receipt | null; lang: 'es' | 'en'; dispatch?: Promise<NoticeOutcome>;
};
const originals = new WeakMap<VerificationNotice, Original>();

/** A pending durable marker only excludes another resend. It never restores the
 * original notice capability, even after expiry, process loss or account changes.
 */
export async function prepareVerificationResend(email: string, lang: 'es' | 'en'): Promise<ResendPreparation> {
  if (typeof email !== 'string' || email !== email.trim().toLowerCase() || email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (lang !== 'es' && lang !== 'en')) {
    return { status: 'unconfirmed' };
  }
  try {
    const code = String(randomInt(100000, 1000000));
    const noticeId = randomUUID(), tokenId = randomUUID();
    const rows = await prisma.$queryRawUnsafe<Receipt[]>(
      `WITH account AS MATERIALIZED (
         SELECT id, email, name, "emailVerified" FROM users WHERE email = $1 FOR UPDATE
       ), admitted AS (
         INSERT INTO email_verification_resend_admissions (email, "noticeId", "userId", "createdAt")
         SELECT email, $3, id, timezone('UTC', clock_timestamp()) FROM account
         WHERE "emailVerified" IS NULL
         ON CONFLICT (email) DO NOTHING RETURNING email, "noticeId", "userId"
       ), removed AS (
         DELETE FROM email_verification_tokens AS t USING admitted AS a
         WHERE t.email = a.email RETURNING t.id
       ), inserted AS (
         INSERT INTO email_verification_tokens (id, email, token, expires, "createdAt")
         SELECT $4, email, $2, timezone('UTC', clock_timestamp()) + INTERVAL '15 minutes',
           timezone('UTC', clock_timestamp())
         FROM admitted WHERE (SELECT count(*) FROM removed) >= 0
         RETURNING id, email, token
       )
       SELECT CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN 'prepared'
         WHEN EXISTS (SELECT 1 FROM account WHERE "emailVerified" IS NULL) THEN 'busy'
         ELSE 'not-required' END AS outcome,
         (SELECT "noticeId" FROM admitted) AS "noticeId", (SELECT id FROM inserted) AS "tokenId",
         (SELECT "userId" FROM admitted) AS "userId", (SELECT email FROM inserted) AS email,
         CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN (SELECT name FROM account) ELSE NULL END AS name,
         (SELECT token FROM inserted) AS token`,
      email, code, noticeId, tokenId,
    );
    if (!Array.isArray(rows) || rows.length !== 1) return { status: 'unconfirmed' };
    const row = rows[0];
    if (row.outcome === 'prepared' && row.noticeId === noticeId && row.tokenId === tokenId
      && typeof row.userId === 'string' && row.userId.length > 0 && row.email === email
      && row.token === code && (row.name === null || typeof row.name === 'string')) {
      const notice: VerificationNotice = Object.freeze({ kind: 'email-resend-original' });
      originals.set(notice, { record: { ...row }, lang });
      return { status: 'prepared', notice };
    }
    if ((row.outcome === 'not-required' || row.outcome === 'busy')
      && row.noticeId === null && row.tokenId === null && row.userId === null
      && row.email === null && row.name === null && row.token === null) return { status: row.outcome };
  } catch {
    // Collision/failure/lost commit ACK never retries or adopts an old code.
  }
  return { status: 'unconfirmed' };
}

/** Only the live capability created from the acknowledged original can dispatch.
 * Duplicate calls join one promise. No exported ID/JSON/reset/probe can release it.
 */
export function dispatchVerificationResend(notice: VerificationNotice): Promise<NoticeOutcome> {
  const original = originals.get(notice);
  if (!original) return Promise.resolve('not-issued');
  if (original.dispatch) return original.dispatch;
  original.dispatch = Promise.resolve().then(async () => {
    const record = original.record!;
    const { email, token, tokenId, noticeId, userId } = record;
    let outcome: NoticeOutcome = 'unconfirmed';
    try {
      // A dependent negative eligibility check cannot adopt a notice: the same
      // live original remains necessary even when a DB row matches.
      const rows = await prisma.$queryRawUnsafe<{ eligible: boolean }[]>(
        `SELECT EXISTS (
           SELECT 1 FROM email_verification_resend_admissions AS a
           JOIN users AS u ON u.id = a."userId" AND u.email = a.email
           JOIN email_verification_tokens AS t ON t.email = a.email
           WHERE a.email = $1 AND a."noticeId" = $2 AND a."userId" = $3
             AND t.id = $4 AND t.token = $5 AND u."emailVerified" IS NULL
             AND t.expires > timezone('UTC', clock_timestamp())
         ) AS eligible`, email, noticeId, userId, tokenId, token,
      );
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.eligible !== 'boolean') return 'unconfirmed';
      if (!rows[0].eligible) outcome = 'not-issued';
      else {
        const name = (record.name ?? email!).replace(/[&<>"']/g, character => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[character]!));
        const html = verificationEmail(name, token!, original.lang)
          .replace('The code expires in 15 minutes.', 'The code expires 15 minutes after it was requested.')
          .replace('El código expira en 15 minutos.', 'El código expira 15 minutos después de solicitarlo.');
        outcome = await sendDomainEmailOriginal({
          to: email!,
          subject: original.lang === 'en' ? `${token} — Verify your email - YTubViral`
            : `${token} — Verifica tu email - YTubViral`,
          html,
        });
      }
      if (outcome !== 'provider-accepted' && outcome !== 'not-configured' && outcome !== 'not-issued') return 'unconfirmed';
      // Only a known terminal of this genuine original closes its own marker.
      const closed = await prisma.$queryRawUnsafe<{ noticeId: string }[]>(
        `DELETE FROM email_verification_resend_admissions
         WHERE email = $1 AND "noticeId" = $2 AND "userId" = $3
         RETURNING "noticeId"`, email, noticeId, userId,
      );
      return Array.isArray(closed) && closed.length === 1 && closed[0]?.noticeId === noticeId
        ? outcome : 'unconfirmed';
    } catch {
      return 'unconfirmed';
    } finally {
      original.record = null; // Keep the original promise, not code/name/email.
    }
  });
  return original.dispatch;
}

/** Consume the native Turnstile original once before account/hash writes.
 * User, initial code and notice exclusion commit in one SQL statement.
 */
export async function createSignupAndNotice(input: SignupInput, permit: SignupTurnstilePermit):
  Promise<{ status: 'created'; notice: VerificationNotice } | { status: 'exists' | 'blocked' | 'unconfirmed' }> {
  if (!takeSignupTurnstilePermit(permit, input)) return { status: 'unconfirmed' };
  try {
    const passwordHash = await bcrypt.hash(input.password, 12);
    const userId = randomUUID(), noticeId = randomUUID(), tokenId = randomUUID();
    const code = String(randomInt(100000, 1000000));
    const aff = !AFFILIATES_DORMANT && input.aff?.trim() ? input.aff.trim().toLowerCase() : null;
    const rows = await prisma.$queryRawUnsafe<Receipt[]>(
      `WITH inserted_user AS (
         INSERT INTO users (id,email,password,name,lang,"utmSource","utmMedium","utmCampaign",
           "signupReferrer","signupLandingPage","referredBy","referredByCode","referredAt","createdAt","updatedAt")
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
           CASE WHEN $12::text IS NULL THEN NULL ELSE timezone('UTC',clock_timestamp()) END,
           timezone('UTC',clock_timestamp()),timezone('UTC',clock_timestamp())
         WHERE NOT EXISTS (SELECT 1 FROM email_verification_resend_admissions WHERE email=$2)
           AND NOT EXISTS (SELECT 1 FROM email_verification_tokens WHERE email=$2)
         ON CONFLICT (email) DO NOTHING RETURNING id,email,name
       ), admitted AS (
         INSERT INTO email_verification_resend_admissions (email,"noticeId","userId","createdAt")
         SELECT email,$13,id,timezone('UTC',clock_timestamp()) FROM inserted_user
         RETURNING email,"noticeId","userId"
       ), inserted_token AS (
         INSERT INTO email_verification_tokens (id,email,token,expires,"createdAt")
         SELECT $14,email,$15,timezone('UTC',clock_timestamp())+INTERVAL '15 minutes',
           timezone('UTC',clock_timestamp()) FROM admitted RETURNING id,email,token
       )
       SELECT CASE WHEN EXISTS(SELECT 1 FROM inserted_token) THEN 'created'
         WHEN EXISTS(SELECT 1 FROM users WHERE email=$2) THEN 'exists'
         WHEN EXISTS(SELECT 1 FROM email_verification_resend_admissions WHERE email=$2)
           OR EXISTS(SELECT 1 FROM email_verification_tokens WHERE email=$2) THEN 'blocked'
         ELSE 'unconfirmed' END AS outcome,
         (SELECT "noticeId" FROM admitted) AS "noticeId",
         (SELECT id FROM inserted_token) AS "tokenId", (SELECT "userId" FROM admitted) AS "userId",
         (SELECT email FROM inserted_token) AS email, (SELECT name FROM inserted_user) AS name,
         (SELECT token FROM inserted_token) AS token`,
      userId, input.email, passwordHash, input.name, input.lang,
      input.utmSource ?? null, input.utmMedium ?? null, input.utmCampaign ?? null,
      input.signupReferrer ?? null, input.signupLandingPage ?? null,
      AFFILIATES_DORMANT ? null : (input.ref ?? null), aff, noticeId, tokenId, code,
    );
    if (!Array.isArray(rows) || rows.length !== 1) return { status: 'unconfirmed' };
    const row = rows[0];
    if (row.outcome === 'created' && row.noticeId === noticeId && row.tokenId === tokenId
      && row.userId === userId && row.email === input.email && row.name === input.name && row.token === code) {
      const notice: VerificationNotice = Object.freeze({ kind: 'email-resend-original' });
      originals.set(notice, { record: { ...row }, lang: input.lang });
      return { status: 'created', notice };
    }
    if ((row.outcome === 'exists' || row.outcome === 'blocked')
      && row.noticeId === null && row.tokenId === null && row.userId === null
      && row.email === null && row.name === null && row.token === null) return { status: row.outcome };
  } catch { /* Unknown commit never creates a notice or adopts an account. */ }
  return { status: 'unconfirmed' };
}
