import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { prepareDomainEmailOriginal, dispatchDomainEmailOriginal } from '@/lib/send-email';
import { waitlistWelcomeEmail } from '@/lib/emails';

export type WaitlistInput = Readonly<{ kind: 'waitlist-input' }>;
export type WaitlistJob = Readonly<{ kind: 'waitlist-job-original' }>;
export type WaitlistOutcome = 'provider-accepted' | 'not-required' | 'not-issued' | 'not-configured' | 'unconfirmed';
type Captured = { email: string; lang: 'es' | 'en'; source: string; referrer: string | null };
const inputs = new WeakMap<WaitlistInput, Captured>();
const jobs = new WeakMap<WaitlistJob, { captured: Captured | null; promise?: Promise<WaitlistOutcome> }>();
const LIVE = process.env.WAITLIST_EMAILS_LIVE === 'true';
export function parseWaitlistInput(value: unknown): WaitlistInput | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(k => !['email','lang','source','referrer'].includes(k)) || typeof row.email !== 'string'
    || row.lang !== undefined && row.lang !== 'es' && row.lang !== 'en') return;
  const email = row.email.trim().toLowerCase(), source = row.source ?? 'launch-page';
  if (email.length > 254 || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(email)
    || typeof source !== 'string' || source.length < 1 || source.length > 160 || /[\x00-\x1f\x7f]/.test(source)) return;
  let referrer: string | null = null;
  if (row.referrer !== undefined && row.referrer !== null) {
    if (typeof row.referrer !== 'string' || row.referrer.length > 2048 || /[\x00-\x1f\x7f]/.test(row.referrer)) return;
    if (/^[\w.-]{1,80}$/.test(row.referrer)) referrer = row.referrer;
    else {
      try {
        const url = new URL(row.referrer);
        if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return;
        // Attribution is untrusted metadata, never consent or recovery authority.
        // Do not retain query/hash secrets from another page.
        referrer = url.origin + url.pathname;
      } catch { return; }
    }
  }
  const input: WaitlistInput = Object.freeze({ kind: 'waitlist-input' });
  inputs.set(input, { email, lang: row.lang ?? 'es', source, referrer }); return input;
}
export function waitlistLimitEmail(input: WaitlistInput): string | undefined { return inputs.get(input)?.email; }
export function prepareWaitlistJob(input: WaitlistInput): WaitlistJob | undefined {
  const captured = inputs.get(input); inputs.delete(input); if (!captured) return;
  const job: WaitlistJob = Object.freeze({ kind: 'waitlist-job-original' });
  jobs.set(job, { captured }); return job;
}
const exactNotice = (rows: unknown, id: string): rows is { noticeId: string }[] => Array.isArray(rows)
  && rows.length === 1 && rows[0] && Object.keys(rows[0]).length === 1 && rows[0].noticeId === id;

// Only this live job's native creation ACK owns its welcome. Prior registrations
// or admissions never become permission to send, replay, renew or restore it.
export function dispatchWaitlistJob(job: WaitlistJob): Promise<WaitlistOutcome> {
  const own = jobs.get(job); if (!own) return Promise.resolve('not-issued');
  if (own.promise) return own.promise;
  own.promise = Promise.resolve().then(async (): Promise<WaitlistOutcome> => {
    try {
      const c = own.captured!, rowId = randomUUID(), noticeId = randomUUID();
      const rows = await prisma.$queryRawUnsafe<{ id: string; email: string; lang: string; noticeId: string }[]>(`WITH created AS (
        INSERT INTO launch_waitlist (id,email,source,referrer,lang,"createdAt")
        VALUES ($1,$2,$3,$4,$5,timezone('UTC',clock_timestamp()))
        ON CONFLICT (email) DO NOTHING RETURNING id,email,lang
      ), admitted AS (
        INSERT INTO waitlist_welcome_admissions (email,"noticeId","rowId",status,"createdAt")
        SELECT email,$6,id,'pending',timezone('UTC',clock_timestamp()) FROM created
        RETURNING email,"noticeId","rowId"
      ) SELECT c.id,c.email,c.lang,a."noticeId" FROM created c JOIN admitted a ON a."rowId"=c.id AND a.email=c.email`,
        rowId, c.email, c.source, c.referrer, c.lang, noticeId);
      if (Array.isArray(rows) && rows.length === 0) return 'not-required';
      if (!Array.isArray(rows) || rows.length !== 1 || Object.keys(rows[0]).length !== 4
        || rows[0].id !== rowId || rows[0].email !== c.email || rows[0].lang !== c.lang || rows[0].noticeId !== noticeId) return 'unconfirmed';
      let outcome: WaitlistOutcome = 'not-issued';
      if (LIVE) {
        const eligible = await prisma.$queryRawUnsafe<{ eligible: boolean }[]>(`SELECT EXISTS(
          SELECT 1 FROM waitlist_welcome_admissions a JOIN launch_waitlist w ON w.id=a."rowId" AND w.email=a.email
          WHERE a.email=$1 AND a."noticeId"=$2 AND a."rowId"=$3 AND a.status='pending' AND w.lang=$4
        ) AS eligible`, c.email, noticeId, rowId, c.lang);
        if (!Array.isArray(eligible) || eligible.length !== 1 || Object.keys(eligible[0]).length !== 1 || typeof eligible[0].eligible !== 'boolean') return 'unconfirmed';
        if (eligible[0].eligible) {
          const subject = c.lang === 'en' ? 'Your YTubViral waitlist request' : 'Tu solicitud a la lista de YTubViral';
          const text = c.lang === 'en'
            ? 'We received your request to hear about YTubViral. Thank you for your interest.\nThis message does not confirm a discount, launch date or delivery of future emails.\nhttps://ytubviral.com'
            : 'Hemos recibido tu solicitud para conocer novedades de YTubViral. Gracias por tu interés.\nEste mensaje no confirma descuentos, fecha de lanzamiento ni entrega de futuros correos.\nhttps://ytubviral.com';
          const mail = prepareDomainEmailOriginal({ to: c.email, subject, html: waitlistWelcomeEmail(c.lang), text,
            isTransactional: false, idempotencyKey: noticeId });
          outcome = mail ? await dispatchDomainEmailOriginal(mail) : 'not-issued';
        }
      }
      if (!['provider-accepted','not-issued','not-configured'].includes(outcome)) return 'unconfirmed';
      // Keep the admission permanently, including known no-emission. This is not
      // a reusable queue or a timed permission to welcome the same email again.
      const completed = await prisma.$queryRawUnsafe<{ noticeId: string }[]>(`UPDATE waitlist_welcome_admissions
        SET status=$4,"completedAt"=timezone('UTC',clock_timestamp())
        WHERE email=$1 AND "noticeId"=$2 AND "rowId"=$3 AND status='pending' RETURNING "noticeId"`,
        c.email, noticeId, rowId, outcome === 'provider-accepted' ? 'provider-accepted' : 'not-issued');
      return exactNotice(completed, noticeId) ? outcome : 'unconfirmed';
    } catch { return 'unconfirmed'; }
    finally { own.captured = null; }
  });
  return own.promise;
}
