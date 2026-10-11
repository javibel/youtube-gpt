import { Resend } from 'resend';
import { passwordChangedEmail } from '@/lib/emails';
export type PasswordChangeNotice = Readonly<{ to: string; subject: string; html: string; text: string }>;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function preparePasswordChangeNotice(email: string, name: string, lang: 'es' | 'en'): PasswordChangeNotice {
  const en = lang === 'en';
  return Object.freeze({ to: email,
    subject: en ? 'Your password was changed - YTubViral' : 'Tu contraseña ha sido cambiada - YTubViral',
    html: passwordChangedEmail(escape(name), lang),
    text: en ? 'Your YTubViral password was changed. If this was not you, reset your password: https://ytubviral.com/forgot-password'
      : 'Tu contraseña de YTubViral ha cambiado. Si no has sido tú, restablece tu contraseña: https://ytubviral.com/forgot-password' });
}
// One original provider call, never a fallback or a recovered invocation.
// Its acknowledgement is not proof of delivery to an inbox.
export async function sendPasswordChangeNotice(packet: PasswordChangeNotice, originalId: string,
  beforeStep: () => void, onDispatch: () => void): Promise<void> {
  beforeStep();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw Error('Password notice unavailable');
  const sender = new Resend(apiKey);
  beforeStep(); onDispatch();
  const response = await sender.emails.send({ from: 'YTubViral <hello@ytubviral.com>',
    replyTo: 'support@ytubviral.com', ...packet }, { idempotencyKey: originalId });
  if (response.error || !response.data || typeof response.data.id !== 'string' || !response.data.id.trim())
    throw Error('Password notice unconfirmed');
}
