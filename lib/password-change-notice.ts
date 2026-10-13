import { prepareDomainEmailOriginal, dispatchDomainEmailOriginal, DomainEmailUnconfirmed } from '@/lib/send-email';
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
  if (typeof originalId !== 'string') throw new DomainEmailUnconfirmed('not-issued');
  const original = prepareDomainEmailOriginal({ ...packet, isTransactional: true, idempotencyKey: originalId },
    () => { beforeStep(); onDispatch(); });
  const outcome = original ? await dispatchDomainEmailOriginal(original) : 'not-issued';
  if (outcome !== 'provider-accepted') throw new DomainEmailUnconfirmed(outcome);
}
