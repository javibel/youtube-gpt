/** Domain-only email transport. Provider acceptance is never delivery.
 * https://resend.com/docs/api-reference/emails/send-email
 */
export type DomainEmailInput = Readonly<{ to: string; subject: string; html: string; isTransactional?: boolean }>;
export type DomainEmailOriginal = Readonly<{ kind: 'domain-email-original' }>;
export type DomainEmailOutcome = 'provider-accepted' | 'not-configured' | 'not-issued' | 'unconfirmed';
type Captured = { to: string; subject: string; html: string; text: string; isTransactional: boolean };
type Original = { captured: Captured | null; promise?: Promise<DomainEmailOutcome> };
const originals = new WeakMap<DomainEmailOriginal, Original>();
const apiKey = process.env.RESEND_API_KEY?.trim();
const endpoint = 'https://api.resend.com/emails';

function plainText(html: string) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n').replace(/<\/tr>/gi, '\n').replace(/<\/td>/gi, ' ')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&middot;/g, '·')
    .replace(/&copy;/g, '(c)').replace(/&#\d+;/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** A captured new invocation, not restored authority from email/ID/hash/JSON.
 * Business admission/consent remain the caller's responsibility; this transport
 * does not reconcile a lost business original or admit another delivery attempt.
 */
export function prepareDomainEmailOriginal(input: DomainEmailInput): DomainEmailOriginal | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['to', 'subject', 'html', 'isTransactional'].includes(key))
    || typeof input.to !== 'string' || typeof input.subject !== 'string' || typeof input.html !== 'string'
    || input.isTransactional !== undefined && typeof input.isTransactional !== 'boolean') return;
  const to = input.to.trim().toLowerCase(), subject = input.subject.trim();
  if (to.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to)
    || /[\u0000-\u001f\u007f]/.test(to) || !subject || subject.length > 200 || /[\u0000-\u001f\u007f]/.test(subject)
    || !input.html || input.html.length > 1048576) return;
  const original: DomainEmailOriginal = Object.freeze({ kind: 'domain-email-original' });
  originals.set(original, { captured: { to, subject, html: input.html, text: plainText(input.html), isTransactional: input.isTransactional === true } });
  return original;
}

/** Duplicate dispatches join one private native HTTP/body promise. No fallback,
 * automatic retry, provider lookup or exported receipt can rebuild this original.
 * Once HTTP starts its actual promise remains authoritative even if a caller
 * stops waiting; no timeout or cancellation is treated as proof of nonissuance.
 */
export function dispatchDomainEmailOriginal(original: DomainEmailOriginal): Promise<DomainEmailOutcome> {
  const own = originals.get(original); if (!own) return Promise.resolve('not-issued');
  if (own.promise) return own.promise;
  own.promise = Promise.resolve().then(async (): Promise<DomainEmailOutcome> => {
    try {
      if (!apiKey) return 'not-configured';
      const message = own.captured!;
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ from: 'YTubViral <hello@ytubviral.com>', reply_to: 'hello@ytubviral.com',
          to: [message.to], subject: message.subject, html: message.html, text: message.text,
          ...(!message.isTransactional && { headers: { 'List-Unsubscribe': '<mailto:hello@ytubviral.com?subject=unsubscribe>' } }),
        }),
      });
      if (response.status !== 200 || response.ok !== true || response.redirected
        || response.url && response.url !== endpoint
        || !response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) return 'unconfirmed';
      const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
      let text = '', bytes = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4096) return 'unconfirmed'; text += decoder.decode(part.value, { stream: true }); } text += decoder.decode(); }
      finally { reader.releaseLock(); }
      const receipt: unknown = JSON.parse(text);
      return receipt && typeof receipt === 'object' && !Array.isArray(receipt) && Object.keys(receipt).length === 1
        && 'id' in receipt && typeof receipt.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(receipt.id)
        ? 'provider-accepted' : 'unconfirmed';
    } catch { return 'unconfirmed'; }
    finally { own.captured = null; }
  });
  return own.promise;
}

export function sendDomainEmailOriginal(input: Omit<DomainEmailInput, 'isTransactional'>): Promise<DomainEmailOutcome> {
  const original = prepareDomainEmailOriginal({ ...input, isTransactional: true });
  return original ? dispatchDomainEmailOriginal(original) : Promise.resolve('not-issued');
}

/** Compatibility: legacy callers may advance their acceptance marker only after
 * the same original native provider ACK. Missing configuration, unknown ACK or
 * invalid input throws a sanitized error; no Gmail/default alias or replay.
 */
export async function sendTransactionalEmail(input: DomainEmailInput): Promise<void> {
  const original = prepareDomainEmailOriginal(input);
  const outcome = original ? await dispatchDomainEmailOriginal(original) : 'not-issued';
  if (outcome !== 'provider-accepted') throw new DomainEmailUnconfirmed(outcome);
}
export class DomainEmailUnconfirmed extends Error {
  readonly outcome: Exclude<DomainEmailOutcome, 'provider-accepted'>;
  constructor(outcome: Exclude<DomainEmailOutcome, 'provider-accepted'>) { super('Domain email ' + outcome); this.name = 'DomainEmailUnconfirmed'; this.outcome = outcome; }
}
