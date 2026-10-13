import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { prepareDomainEmailOriginal, dispatchDomainEmailOriginal } from '@/lib/send-email';
import { isInternalAccount } from '@/lib/internal-accounts';

export type FeedbackOriginal = Readonly<{ kind: 'feedback-email-original' }>;
export type FeedbackOutcome = 'provider-accepted' | 'dry-run' | 'not-required' | 'not-issued' | 'not-configured' | 'unconfirmed';
type Captured = { userId: string; expectedEmail?: string; beforeEffect?: () => void };
type Account = { id: string; email: string; name: string | null; lang: string; emailVerified: Date | null; marketingOptOut: boolean };
type Notice = { noticeId: string; token: string };
const originals = new WeakMap<FeedbackOriginal, { captured: Captured | null; promise?: Promise<FeedbackOutcome> }>();
const LIVE = process.env.LIFECYCLE_EMAILS_LIVE === 'true';
const validEmail = (value: unknown): value is string => typeof value === 'string' && value.length <= 254
  && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(value);
export function prepareFeedbackOriginal(userId: string, expectedEmail?: string, beforeEffect?: () => void): FeedbackOriginal | undefined {
  if (typeof userId !== 'string' || !/^[\w-]{1,128}$/.test(userId) || expectedEmail !== undefined && !validEmail(expectedEmail)
    || beforeEffect !== undefined && typeof beforeEffect !== 'function') return;
  const original: FeedbackOriginal = Object.freeze({ kind: 'feedback-email-original' });
  originals.set(original, { captured: { userId, expectedEmail, beforeEffect } }); return original;
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const eligible = (u: Account, c: Captured) => u && u.id === c.userId && validEmail(u.email)
  && (!c.expectedEmail || u.email === c.expectedEmail) && u.emailVerified instanceof Date && Number.isFinite(u.emailVerified.getTime())
  && u.marketingOptOut === false && !isInternalAccount(u.email) && ['es', 'en'].includes(u.lang)
  && (u.name === null || typeof u.name === 'string' && u.name.length <= 512);
const ownNotice = (rows: unknown, id: string): rows is { noticeId: string }[] => Array.isArray(rows)
  && rows.length === 1 && rows[0] && Object.keys(rows[0]).length === 1 && rows[0].noticeId === id;

// A live creator/transaction ACK, never an existing token, ID or row, owns this
// message. Prior feedback is never deleted/replaced/adopted for another send.
export function dispatchFeedbackOriginal(original: FeedbackOriginal): Promise<FeedbackOutcome> {
  const own = originals.get(original); if (!own) return Promise.resolve('not-issued');
  if (own.promise) return own.promise;
  own.promise = Promise.resolve().then(async (): Promise<FeedbackOutcome> => {
    try {
      const c = own.captured!; c.beforeEffect?.();
      if (!LIVE) return 'dry-run';
      const noticeId = randomUUID(), token = randomUUID();
      const account = await prisma.$transaction(async tx => {
        const users = await tx.$queryRawUnsafe<Account[]>(`SELECT id,email,name,lang,"emailVerified","marketingOptOut"
          FROM users WHERE id=$1 FOR UPDATE`, c.userId);
        if (!Array.isArray(users)) throw Error('Unknown account acknowledgement');
        if (users.length === 0) return null;
        if (users.length !== 1 || !eligible(users[0], c)) return null;
        c.beforeEffect?.();
        const rows = await tx.$queryRawUnsafe<Notice[]>(`WITH locked_clock AS MATERIALIZED (
          SELECT timezone('UTC',clock_timestamp()) AS now
        ), admitted AS (
          INSERT INTO lifecycle_email_admissions ("userId","noticeId",sequence,step,"createdAt")
          SELECT u.id,$2,'feedback','initial',clock.now FROM users u CROSS JOIN locked_clock clock
          WHERE u.id=$1 AND u."emailVerified" IS NOT NULL AND u."marketingOptOut"=false
            AND u."feedbackEmailSentAt" IS NULL AND u."createdAt"<=clock.now-INTERVAL '3 days'
            AND NOT EXISTS(SELECT 1 FROM user_feedbacks f WHERE f."userId"=u.id)
            AND NOT EXISTS(SELECT 1 FROM email_logs l WHERE l."userId"=u.id
              AND l.sequence IN ('conv','onboarding','react','feedback') AND l."sentAt">clock.now-INTERVAL '1 day')
          ON CONFLICT ("userId") DO NOTHING RETURNING "userId","noticeId"
        ), created AS (
          INSERT INTO user_feedbacks (id,"userId",token,lang,"createdAt")
          SELECT $2,a."userId",$3,u.lang,timezone('UTC',clock_timestamp())
            FROM admitted a JOIN users u ON u.id=a."userId"
          RETURNING id,token
        ) SELECT id AS "noticeId",token FROM created`, c.userId, noticeId, token);
        if (Array.isArray(rows) && rows.length === 0) return null;
        if (!Array.isArray(rows) || rows.length !== 1 || Object.keys(rows[0]).length !== 2
          || rows[0].noticeId !== noticeId || rows[0].token !== token) throw Error('Unknown feedback acknowledgement');
        return users[0];
      }, { isolationLevel: 'ReadCommitted' });
      if (!account) return 'not-required';
      if (!eligible(account, c)) return 'unconfirmed';
      let active = true, outcome: FeedbackOutcome = 'not-issued';
      try { c.beforeEffect?.(); } catch { active = false; }
      if (active) {
        const rows = await prisma.$queryRawUnsafe<{ eligible: boolean }[]>(`SELECT EXISTS(
          SELECT 1 FROM lifecycle_email_admissions a JOIN users u ON u.id=a."userId"
          JOIN user_feedbacks f ON f.id=a."noticeId" AND f."userId"=u.id AND f.token=$3
          WHERE a."userId"=$1 AND a."noticeId"=$2 AND a.sequence='feedback' AND a.step='initial'
            AND u.email=$4 AND u.lang=$5 AND u.name IS NOT DISTINCT FROM $6
            AND u."emailVerified" IS NOT NULL AND u."marketingOptOut"=false
            AND u."feedbackEmailSentAt" IS NULL AND f."submittedAt" IS NULL
        ) AS eligible`, c.userId, noticeId, token, account.email, account.lang, account.name);
        if (!Array.isArray(rows) || rows.length !== 1 || Object.keys(rows[0]).length !== 1 || typeof rows[0].eligible !== 'boolean') return 'unconfirmed';
        active = rows[0].eligible;
      }
      if (active) {
        const lang = account.lang as 'es' | 'en', name = account.name?.split(' ')[0] || (lang === 'es' ? 'creador' : 'creator');
        const url = new URL('/feedback', 'https://ytubviral.com'); url.searchParams.set('token', token);
        const subject = lang === 'es' ? '¿Cómo va tu experiencia con YTubViral?' : 'How is your experience with YTubViral?';
        const text = lang === 'es' ? 'Hola '+name+',\n\nNos gustaría conocer tu experiencia con YTubViral. Tu opinión nos ayuda a mejorar.\n\n'+url.href+'\n\nGracias,\nEl equipo de YTubViral'
          : 'Hi '+name+',\n\nWe would love to hear about your experience with YTubViral. Your feedback helps us improve.\n\n'+url.href+'\n\nThank you,\nThe YTubViral Team';
        const mail = prepareDomainEmailOriginal({ to: account.email, subject, text, html: '<p>'+escape(text).replace(/\n/g, '<br>')+'</p>',
          isTransactional: false, idempotencyKey: noticeId }, c.beforeEffect);
        outcome = mail ? await dispatchDomainEmailOriginal(mail) : 'not-issued';
      }
      if (!['provider-accepted','not-issued','not-configured'].includes(outcome)) return 'unconfirmed';
      const closed = await prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, c.userId);
        if (outcome === 'provider-accepted') return tx.$queryRawUnsafe<{ noticeId: string }[]>(`WITH accepted AS (
          INSERT INTO email_logs (id,"userId",sequence,step,"sentAt")
          SELECT $2,$1,'feedback','initial',timezone('UTC',clock_timestamp())
          FROM lifecycle_email_admissions a JOIN users u ON u.id=a."userId"
          JOIN user_feedbacks f ON f.id=a."noticeId" AND f."userId"=u.id AND f.token=$3
          WHERE a."userId"=$1 AND a."noticeId"=$2 AND a.sequence='feedback' AND a.step='initial'
            AND u."feedbackEmailSentAt" IS NULL RETURNING id
        ), updated AS (
          UPDATE users SET "feedbackEmailSentAt"=timezone('UTC',clock_timestamp())
            WHERE id=$1 AND EXISTS(SELECT 1 FROM accepted WHERE id=$2) RETURNING id
        ) DELETE FROM lifecycle_email_admissions WHERE "userId"=$1 AND "noticeId"=$2
          AND sequence='feedback' AND step='initial' AND EXISTS(SELECT 1 FROM updated WHERE id=$1)
          RETURNING "noticeId"`, c.userId, noticeId, token);
        return tx.$queryRawUnsafe<{ noticeId: string }[]>(`DELETE FROM lifecycle_email_admissions
          WHERE "userId"=$1 AND "noticeId"=$2 AND sequence='feedback' AND step='initial'
          RETURNING "noticeId"`, c.userId, noticeId);
      }, { isolationLevel: 'ReadCommitted' });
      return ownNotice(closed, noticeId) ? outcome : 'unconfirmed';
    } catch { return 'unconfirmed'; }
    finally { own.captured = null; }
  });
  return own.promise;
}
