import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { AFFILIATES_DORMANT } from '@/lib/features';
import { ADMIN_EMAIL } from '@/lib/admin-email';
import { isDisposableEmail } from '@/lib/disposable-domains';
import { prepareDomainEmailOriginal, dispatchDomainEmailOriginal } from '@/lib/send-email';

export type AffiliateApplicationInput = Readonly<{ kind: 'affiliate-application-input' }>;
export type AffiliateApplicationJob = Readonly<{ kind: 'affiliate-application-original' }>;
export type AffiliateApplicationOutcome = 'provider-accepted' | 'not-required' | 'not-issued' | 'not-configured' | 'unconfirmed';
type Captured = { name: string; email: string; lang: 'es' | 'en'; channelInfo: string | null };
const inputs = new WeakMap<AffiliateApplicationInput, Captured>();
const originals = new WeakMap<AffiliateApplicationJob, { captured: Captured | null; promise?: Promise<AffiliateApplicationOutcome> }>();
const LIVE = process.env.AFFILIATE_APPLICATION_EMAILS_LIVE === 'true';
const emailPattern = /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/;
const admin = ADMIN_EMAIL.length <= 254 && emailPattern.test(ADMIN_EMAIL) ? ADMIN_EMAIL : null;
export function parseAffiliateApplication(value: unknown): AffiliateApplicationInput | undefined {
  if (AFFILIATES_DORMANT || !value || typeof value !== 'object' || Array.isArray(value)) return;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(k => !['name','email','lang','channelInfo'].includes(k)) || typeof row.name !== 'string' || typeof row.email !== 'string'
    || row.lang !== undefined && row.lang !== 'es' && row.lang !== 'en') return;
  const name = row.name.trim(), email = row.email.trim().toLowerCase();
  if (!name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name) || email.length > 254 || !emailPattern.test(email) || isDisposableEmail(email)) return;
  let channelInfo: string | null = null;
  if (row.channelInfo !== undefined && row.channelInfo !== null) {
    if (typeof row.channelInfo !== 'string' || row.channelInfo.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(row.channelInfo)) return;
    channelInfo = row.channelInfo.replace(/\r\n?/g, '\n').trim() || null;
  }
  const input: AffiliateApplicationInput = Object.freeze({ kind: 'affiliate-application-input' });
  inputs.set(input, { name, email, lang: row.lang ?? 'es', channelInfo }); return input;
}
export function affiliateApplicationLimitEmail(input: AffiliateApplicationInput) { return inputs.get(input)?.email; }
export function prepareAffiliateApplicationJob(input: AffiliateApplicationInput): AffiliateApplicationJob | undefined {
  const captured = inputs.get(input); inputs.delete(input); if (AFFILIATES_DORMANT || !captured) return;
  const job: AffiliateApplicationJob = Object.freeze({ kind: 'affiliate-application-original' });
  originals.set(job, { captured }); return job;
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const exactNotice = (rows: unknown, noticeId: string) => Array.isArray(rows) && rows.length === 1 && rows[0]
  && Object.keys(rows[0]).length === 1 && rows[0].noticeId === noticeId;

// The private native creation ACK alone owns its notice. The retained admission
// is negative exclusion, never a resumable queue or authority from rows/JSON.
export function dispatchAffiliateApplication(job: AffiliateApplicationJob): Promise<AffiliateApplicationOutcome> {
  const own = originals.get(job); if (!own || AFFILIATES_DORMANT) return Promise.resolve('not-issued');
  if (own.promise) return own.promise;
  own.promise = Promise.resolve().then(async (): Promise<AffiliateApplicationOutcome> => {
    try {
      const c = own.captured!, id = randomUUID(), noticeId = randomUUID();
      const slug = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0,20) || 'afiliado';
      const code = slug + '-' + id.replaceAll('-', '');
      // Deferred FK checks the new affiliate at this statement's commit.
      // Reserve canonical email first; a competing module creates no orphan.
      // Existing affiliates (including legacy casing) are only negative guards.
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`WITH admitted AS (
        INSERT INTO affiliate_application_admissions (email,"noticeId","affiliateId",lang,status,"createdAt")
        SELECT $1,$2,$3,$4,'pending',timezone('UTC',clock_timestamp())
        WHERE NOT EXISTS (SELECT 1 FROM affiliates WHERE lower(btrim(email))=$1)
        ON CONFLICT (email) DO NOTHING RETURNING email,"noticeId","affiliateId",lang
      ), created AS (
        INSERT INTO affiliates (id,code,name,email,channel_info,status,commission_pct,months_paid,created_at)
        SELECT a."affiliateId",$5,$6,a.email,$7,'pending',30,12,timezone('UTC',clock_timestamp()) FROM admitted a
        RETURNING id,code,name,email,channel_info AS "channelInfo"
      ) SELECT c.id,c.code,c.name,c.email,c."channelInfo",a.lang,a."noticeId"
        FROM created c JOIN admitted a ON a."affiliateId"=c.id AND a.email=c.email`,
        c.email, noticeId, id, c.lang, code, c.name, c.channelInfo);
      if (Array.isArray(rows) && rows.length === 0) return 'not-required';
      if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || Object.keys(rows[0]).length !== 7 || rows[0].id !== id || rows[0].code !== code
        || rows[0].email !== c.email || rows[0].name !== c.name || rows[0].channelInfo !== c.channelInfo || rows[0].lang !== c.lang || rows[0].noticeId !== noticeId) return 'unconfirmed';
      let outcome: AffiliateApplicationOutcome = !LIVE ? 'not-issued' : !admin ? 'not-configured' : 'not-issued';
      if (LIVE && admin) {
        const eligible = await prisma.$queryRawUnsafe<{ eligible: boolean }[]>(`SELECT EXISTS(
          SELECT 1 FROM affiliate_application_admissions a JOIN affiliates f ON f.id=a."affiliateId" AND f.email=a.email
          WHERE a.email=$1 AND a."noticeId"=$2 AND a."affiliateId"=$3 AND a.status='pending' AND a.lang=$4
            AND f.status='pending' AND f.code=$5 AND f.name=$6 AND f.channel_info IS NOT DISTINCT FROM $7::text
        ) AS eligible`, c.email, noticeId, id, c.lang, code, c.name, c.channelInfo);
        if (!Array.isArray(eligible) || eligible.length !== 1 || Object.keys(eligible[0]).length !== 1 || typeof eligible[0].eligible !== 'boolean') return 'unconfirmed';
        if (eligible[0].eligible) {
          const html = '<p>Nueva solicitud del programa de afiliados. No implica aprobación ni pago.</p><p><b>Nombre:</b> '+escape(c.name)
            +'<br/><b>Email:</b> '+escape(c.email)+'<br/><b>Código propuesto:</b> '+escape(code)
            +'</p><p><b>Canal/audiencia:</b><br/>'+escape(c.channelInfo || '(no indicado)').replace(/\n/g,'<br/>')
            +'</p><p>Revisar en <a href="https://ytubviral.com/admin/affiliates">/admin/affiliates</a>.</p>';
          const text = 'Nueva solicitud del programa de afiliados. No implica aprobación ni pago.\nNombre: '+c.name+'\nEmail: '+c.email
            +'\nCódigo propuesto: '+code+'\nCanal/audiencia: '+(c.channelInfo || '(no indicado)')+'\nhttps://ytubviral.com/admin/affiliates';
          const mail = prepareDomainEmailOriginal({ to: admin, subject: 'Nueva solicitud de afiliación a YTubViral', html, text, isTransactional: true, idempotencyKey: noticeId });
          outcome = mail ? await dispatchDomainEmailOriginal(mail) : 'not-issued';
        }
      }
      if (!['provider-accepted','not-issued','not-configured'].includes(outcome)) return 'unconfirmed';
      // Permanent even after known no emission. No deletion, TTL, reset, retry,
      // readback reconciliation or subsequent adoption of an earlier request.
      const completed = await prisma.$queryRawUnsafe<{ noticeId: string }[]>(`UPDATE affiliate_application_admissions
        SET status=$4,"completedAt"=timezone('UTC',clock_timestamp())
        WHERE email=$1 AND "noticeId"=$2 AND "affiliateId"=$3 AND status='pending' RETURNING "noticeId"`,
        c.email, noticeId, id, outcome === 'provider-accepted' ? 'provider-accepted' : 'not-issued');
      return exactNotice(completed, noticeId) ? outcome : 'unconfirmed';
    } catch { return 'unconfirmed'; }
    finally { own.captured = null; }
  });
  return own.promise;
}
