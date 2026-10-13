import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { prepareDomainEmailOriginal, dispatchDomainEmailOriginal } from '@/lib/send-email';
import { SEQUENCES } from '@/lib/lifecycle-emails';
import { isInternalAccount } from '@/lib/internal-accounts';

export type LifecycleSequence = 'conv' | 'onboarding' | 'react';
export type LifecycleOutcome = 'provider-accepted' | 'dry-run' | 'not-required' | 'not-configured' | 'not-issued' | 'unconfirmed';
export type LifecycleOriginal = Readonly<{ kind: 'lifecycle-original' }>;
type Captured = { userId: string; sequence: LifecycleSequence; step: string; extra?: Record<string, string | number>; beforeEffect?: () => void };
type Account = { id: string; email: string; name: string | null; lang: string; emailVerified: Date | null; marketingOptOut: boolean };
type Admission = { noticeId: string };
const originals = new WeakMap<LifecycleOriginal, { captured: Captured | null; promise?: Promise<LifecycleOutcome> }>();
const LIVE = process.env.LIFECYCLE_EMAILS_LIVE === 'true';
const SECRET = (process.env.EMAIL_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || '').trim();
const steps = { conv: ['c1', 'c2', 'c3'], onboarding: ['a1', 'a2', 'a3', 'a4', 'a5'], react: ['b1', 'b2'] } as const;

// Rows/IDs are negative exclusion only, never authority to restore an original.
export function prepareLifecycleOriginal(userId: string, sequence: LifecycleSequence, step: string,
  extra?: Record<string, string | number>, beforeEffect?: () => void): LifecycleOriginal | undefined {
  if (typeof userId !== 'string' || !/^[\w-]{1,128}$/.test(userId) || !Object.hasOwn(steps, sequence)
    || !(steps[sequence] as readonly string[]).includes(step) || beforeEffect !== undefined && typeof beforeEffect !== 'function') return;
  let capturedExtra: Record<string, string | number> | undefined;
  if (extra !== undefined) {
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return;
    const keys = Object.keys(extra);
    if (sequence === 'conv' && step === 'c1' && keys.length === 1 && keys[0] === 'resetDay'
      && typeof extra.resetDay === 'number' && Number.isInteger(extra.resetDay) && extra.resetDay >= 1 && extra.resetDay <= 31)
      capturedExtra = { resetDay: extra.resetDay };
    else return;
  }
  const original: LifecycleOriginal = Object.freeze({ kind: 'lifecycle-original' });
  originals.set(original, { captured: { userId, sequence, step, extra: capturedExtra, beforeEffect } }); return original;
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const exactNotice = (rows: unknown, id: string): rows is Admission[] =>
  Array.isArray(rows) && rows.length === 1 && rows[0] && Object.keys(rows[0]).length === 1 && rows[0].noticeId === id;
const eligibleAccount = (row: Account, id: string) => row && row.id === id && typeof row.email === 'string'
  && row.email.length <= 254 && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(row.email)
  && row.emailVerified instanceof Date && Number.isFinite(row.emailVerified.getTime())
  && row.marketingOptOut === false && (row.name === null || typeof row.name === 'string' && row.name.length <= 512)
  && (row.lang === 'es' || row.lang === 'en') && !isInternalAccount(row.email);

export function dispatchLifecycleOriginal(original: LifecycleOriginal): Promise<LifecycleOutcome> {
  const own = originals.get(original); if (!own) return Promise.resolve('not-issued');
  if (own.promise) return own.promise;
  own.promise = Promise.resolve().then(async (): Promise<LifecycleOutcome> => {
    try {
      const captured = own.captured!;
      captured.beforeEffect?.();
      if (!LIVE) return 'dry-run';
      if (SECRET.length < 32) return 'not-configured';
      const noticeId = randomUUID();
      const receipt = await prisma.$transaction(async tx => {
        // Use a fresh statement after the user lock: a waiting READ COMMITTED
        // statement's old snapshot can miss the previous owner's accepted log.
        const accounts = await tx.$queryRawUnsafe<Account[]>(`SELECT id,email,name,lang,"emailVerified","marketingOptOut"
          FROM users WHERE id=$1 FOR UPDATE`, captured.userId);
        if (!Array.isArray(accounts)) throw Error('Unknown account acknowledgement');
        if (accounts.length === 0) return null;
        if (accounts.length !== 1 || !eligibleAccount(accounts[0], captured.userId)) return null;
        captured.beforeEffect?.();
        const admitted = await tx.$queryRawUnsafe<Admission[]>(`WITH locked_clock AS MATERIALIZED (
            SELECT timezone('UTC',clock_timestamp()) AS now
          ), eligible AS (
            SELECT u.id FROM users u CROSS JOIN locked_clock c WHERE u.id=$1
              AND u."emailVerified" IS NOT NULL AND u."marketingOptOut"=false
              AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s."userId"=u.id AND s.status IN ('active','trialing')
                AND (s."stripeCustomerId" IS DISTINCT FROM 'manual_admin' OR s."currentPeriodEnd">c.now))
              AND NOT EXISTS (SELECT 1 FROM email_logs l WHERE l."userId"=u.id
                AND ((l.sequence=$3 AND l.step=$4)
                  OR (l.sequence IN ('conv','onboarding','react','feedback') AND l."sentAt">c.now-INTERVAL '1 day')
                  OR ($3='conv' AND l.sequence='conv' AND l."sentAt">c.now-INTERVAL '14 days')))
              AND ($4<>'c2' OR (u."createdAt"<=c.now-INTERVAL '60 days'
                AND (SELECT count(*) FROM generations g WHERE g."userId"=u.id)>=16))
              AND ($3<>'onboarding' OR (u."createdAt"<=c.now AND u."createdAt">=c.now-INTERVAL '21 days'
                AND (($4='a1') OR ($4='a2' AND u."createdAt"<=c.now-INTERVAL '1 day'
                  AND NOT EXISTS(SELECT 1 FROM generations g WHERE g."userId"=u.id))
                OR ($4='a3' AND u."createdAt"<=c.now-INTERVAL '3 days')
                OR ($4='a4' AND u."createdAt"<=c.now-INTERVAL '7 days')
                OR ($4='a5' AND u."createdAt"<=c.now-INTERVAL '14 days'))))
              AND ($3<>'react' OR EXISTS(SELECT 1 FROM generations g WHERE g."userId"=u.id)
                AND (SELECT max(g."createdAt") FROM generations g WHERE g."userId"=u.id)<=c.now
                  -CASE WHEN $4='b2' THEN INTERVAL '30 days' ELSE INTERVAL '14 days' END)
          ) INSERT INTO lifecycle_email_admissions ("userId","noticeId",sequence,step,"createdAt")
            SELECT id,$2,$3,$4,c.now FROM eligible CROSS JOIN locked_clock c
            ON CONFLICT ("userId") DO NOTHING RETURNING "noticeId"`,
          captured.userId, noticeId, captured.sequence, captured.step);
        if (Array.isArray(admitted) && admitted.length === 0) return null;
        if (!exactNotice(admitted, noticeId)) throw Error('Unknown admission acknowledgement');
        return accounts[0];
      }, { isolationLevel: 'ReadCommitted' });
      // A native commit ACK, rather than a recovered row, owns this admission.
      if (!receipt) return 'not-required';
      if (!eligibleAccount(receipt, captured.userId)) return 'unconfirmed';
      let outcome: LifecycleOutcome = 'not-issued', active = true;
      try { captured.beforeEffect?.(); } catch { active = false; }
      if (active) {
        const eligibility = await prisma.$queryRawUnsafe<{ eligible: boolean }[]>(`SELECT EXISTS(SELECT 1 FROM lifecycle_email_admissions a JOIN users u ON u.id=a."userId"
          WHERE a."userId"=$1 AND a."noticeId"=$2 AND a.sequence=$3 AND a.step=$4
            AND u.email=$5 AND u."emailVerified" IS NOT NULL AND u."marketingOptOut"=false
            AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s."userId"=u.id AND s.status IN ('active','trialing')
              AND (s."stripeCustomerId" IS DISTINCT FROM 'manual_admin' OR s."currentPeriodEnd">timezone('UTC',clock_timestamp())))) AS eligible`,
          captured.userId, noticeId, captured.sequence, captured.step, receipt.email);
        if (!Array.isArray(eligibility) || eligibility.length !== 1 || Object.keys(eligibility[0]).length !== 1
          || typeof eligibility[0].eligible !== 'boolean') return 'unconfirmed';
        active = eligibility[0].eligible;
      }
      if (active) {
        // Dependent eligibility can only deny this live owner.
        const current = await prisma.user.findUnique({ where: { id: captured.userId },
          select: { id: true, email: true, name: true, lang: true, emailVerified: true, marketingOptOut: true } });
        if (current && eligibleAccount(current, captured.userId) && current.email === receipt.email
          && current.lang === receipt.lang && current.name === receipt.name) {
          const lang = receipt.lang as 'es' | 'en', name = escape(receipt.name?.split(' ')[0] || (lang === 'en' ? 'there' : 'crack'));
          const templates = captured.sequence === 'conv' ? SEQUENCES.conversion : captured.sequence === 'react' ? SEQUENCES.reactivation : SEQUENCES.onboarding;
          const tpl = (templates as Record<string, { subject: { es: string; en: string }; build: (n: string, l: 'es' | 'en', id: string, e?: Record<string, string | number>) => string }>)[captured.step];
          const mail = prepareDomainEmailOriginal({ to: receipt.email, subject: tpl.subject[lang],
            html: tpl.build(name, lang, captured.userId, captured.extra), idempotencyKey: noticeId, isTransactional: false }, captured.beforeEffect);
          outcome = mail ? await dispatchDomainEmailOriginal(mail) : 'not-issued';
        }
      }
      if (!['provider-accepted','not-issued','not-configured'].includes(outcome)) return 'unconfirmed';
      const closed = await prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, captured.userId);
        if (outcome === 'provider-accepted') return tx.$queryRawUnsafe<Admission[]>(`WITH accepted AS (
          INSERT INTO email_logs (id,"userId",sequence,step,"sentAt")
          SELECT $2,$1,$3,$4,timezone('UTC',clock_timestamp()) FROM lifecycle_email_admissions
            WHERE "userId"=$1 AND "noticeId"=$2 AND sequence=$3 AND step=$4
          RETURNING id
        ) DELETE FROM lifecycle_email_admissions WHERE "userId"=$1 AND "noticeId"=$2
          AND sequence=$3 AND step=$4 AND EXISTS(SELECT 1 FROM accepted WHERE id=$2) RETURNING "noticeId"`,
          captured.userId, noticeId, captured.sequence, captured.step);
        return tx.$queryRawUnsafe<Admission[]>(`DELETE FROM lifecycle_email_admissions WHERE "userId"=$1 AND "noticeId"=$2
          AND sequence=$3 AND step=$4 RETURNING "noticeId"`, captured.userId, noticeId, captured.sequence, captured.step);
      }, { isolationLevel: 'ReadCommitted' });
      return exactNotice(closed, noticeId) ? outcome : 'unconfirmed';
    } catch { return 'unconfirmed'; }
    finally { own.captured = null; }
  });
  return own.promise;
}
