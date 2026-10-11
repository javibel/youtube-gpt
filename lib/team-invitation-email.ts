import { Resend } from 'resend';

export interface InvitationEmail { to: string; subject: string; html: string; text: string }
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// A fresh invitation has its own fixed expiry. Preparation never renews a row.
export function prepareInvitationEmail(input: { email: string; teamName: string; inviter: string; language: string; token: string; expiresAt: string }, origin: string | undefined): Readonly<InvitationEmail> {
  if (!origin) throw Error('Invitation origin unavailable');
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw Error('Invalid invitation origin');
  if (!/^[a-f0-9]{64}$/.test(input.token) || new Date(input.expiresAt).toISOString() !== input.expiresAt) throw Error('Invalid invitation preparation');
  url.pathname = '/team/join'; url.searchParams.set('token', input.token);
  const en = input.language === 'en', team = input.teamName.replace(/[\r\n]/g, ' '), inviter = input.inviter.replace(/[\r\n]/g, ' ');
  const subject = en ? `You're invited to join ${team} on YTubViral` : `Te han invitado a unirte a ${team} en YTubViral`;
  const message = en ? `${inviter} has invited you to join ${team}.` : `${inviter} te ha invitado a unirte a ${team}.`;
  const expiry = en ? `Invitation expires: ${input.expiresAt}` : `La invitación caduca: ${input.expiresAt}`;
  const button = en ? 'Join team' : 'Unirse al equipo';
  return Object.freeze({ to: input.email, subject,
    html: `<!DOCTYPE html><html lang="${en ? 'en' : 'es'}"><body><h1>${escape(team)}</h1><p>${escape(message)}</p><p>${escape(expiry)}</p><a href="${escape(url.href)}">${button}</a></body></html>`,
    text: `${message}\n${expiry}\n${button}: ${url.href}` });
}

// One original transport invocation. A provider acknowledgement is not inbox
// delivery or operational acceptance. Errors never fall back to Gmail/retry.
export async function sendInvitationEmail(packet: Readonly<InvitationEmail>, originalId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw Error('Invitation transport unavailable');
  const result = await new Resend(apiKey).emails.send({ from: 'YTubViral <hello@ytubviral.com>', replyTo: 'support@ytubviral.com', ...packet }, { idempotencyKey: originalId });
  if (result.error || !result.data || typeof result.data.id !== 'string' || !result.data.id.trim()) throw Error('Invitation transport unconfirmed');
}
