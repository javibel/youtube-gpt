'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PasswordInput from '@/components/PasswordInput';
import { validatePassword } from '@/lib/password';
import { beginPasswordRecovery, observePasswordRecovery, retireRecoveryProgress, canObserveRecovery, claimRecoveryCompletion, recoveryBlocked, type RecoveryAttempt, type RecoveryOutcome } from '@/lib/password-recovery-client';
import { subscribeSessionCookieWriter } from '@/lib/session-cookie-writer';

type Selection = { mode: 'forgot' | 'reset'; email: string; password: string; confirm: string; token: string; lang: 'es' | 'en'; path: string; query: string; browserSearch: string };
export default function PasswordRecoveryForm({ mode, lang }: { mode: 'forgot' | 'reset'; lang: 'es' | 'en' }) {
  const path = usePathname(), params = useSearchParams(), query = params.toString(), token = params.get('token') ?? '';
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [waiting, setWaiting] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<RecoveryOutcome>();
  const [, renderLane] = useState(0);
  const mounted = useRef(true), selection = useRef<Selection | undefined>(undefined);
  const command = useRef<{ attempt: RecoveryAttempt; context: Selection; observer?: ReturnType<typeof observePasswordRecovery> } | undefined>(undefined);
  if (!selection.current || selection.current.mode !== mode || selection.current.email !== email || selection.current.password !== password
    || selection.current.confirm !== confirm || selection.current.token !== token || selection.current.lang !== lang
    || selection.current.path !== path || selection.current.query !== query)
    selection.current = { mode, email, password, confirm, token, lang, path, query, browserSearch: typeof window === 'undefined' ? '' : window.location.search };
  const current = selection.current;
  const live = () => mounted.current && selection.current === current && window.location.pathname === current.path && window.location.search === current.browserSearch;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; const old = command.current; if (old) { retireRecoveryProgress(old.attempt); old.observer?.retire(); } };
  }, []);
  useEffect(() => subscribeSessionCookieWriter(() => renderLane(v => v + 1)), []);
  useEffect(() => {
    const old = command.current;
    if (old && old.context !== current) { retireRecoveryProgress(old.attempt); old.observer?.retire(); setWaiting(false); setResult(undefined); setError(''); }
  }, [current]);
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const retireField = () => { const old = command.current; if (old) { retireRecoveryProgress(old.attempt); old.observer?.retire(); } setWaiting(false); setResult(undefined); setError(''); };
  const observe = async (attempt: RecoveryAttempt) => {
    if (!live() || !canObserveRecovery(attempt, current)) return;
    const observer = observePasswordRecovery(attempt, current, live);
    command.current = { attempt, context: current, observer }; setWaiting(true); setError('');
    const outcome = await observer.promise;
    if (!live() || command.current?.observer !== observer) return;
    setWaiting(false); setResult(outcome);
    const completion = claimRecoveryCompletion(attempt, current, outcome);
    if (completion === '/login?reset=1' && live()) window.location.href = completion;
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!live() || waiting || recoveryBlocked()) return;
    setError('');
    if (mode === 'reset') {
      if (password !== confirm) { setError(t('Las contraseñas no coinciden.', 'Passwords do not match.')); return; }
      if (!/^[a-f0-9]{64}$/.test(token)) { setError(t('Enlace inválido.', 'Invalid link.')); return; }
      if (new TextEncoder().encode(password).length > 72) { setError(t('La contraseña es demasiado larga.', 'The password is too long.')); return; }
      const policy = validatePassword(password, lang); if (policy) { setError(policy); return; }
    }
    const attempt = beginPasswordRecovery(mode === 'forgot' ? { mode, email, lang } : { mode, token, password, lang }, current, live);
    if (!attempt) { setError(t('Revisa los datos y la solicitud pendiente.', 'Check your input and pending request.')); return; }
    command.current = { attempt, context: current }; void observe(attempt);
  };
  const own = command.current, pending = recoveryBlocked(), canObserve = !!own && own.context === current && canObserveRecovery(own.attempt, current);
  if (mode === 'reset' && !/^[a-f0-9]{64}$/.test(token)) return <div role="alert" className="text-center">
    <p className="text-red-400 text-sm mb-4">{t('Enlace inválido.', 'Invalid link.')}</p>
    <Link href="/forgot-password" className="text-zinc-400">{t('Solicitar nuevo enlace', 'Request a new link')}</Link>
  </div>;
  if (result?.status === 'accepted') return <div role="status" className="text-center">
    <p className="text-white font-semibold mb-2">{t('Solicitud aceptada', 'Request accepted')}</p>
    <p className="text-zinc-400 text-sm leading-relaxed">{t('Si la cuenta es elegible, se procesará un enlace de recuperación. Esta confirmación no garantiza que se haya enviado o recibido un correo.', 'If the account is eligible, a recovery link will be processed. This confirmation does not guarantee that an email was sent or received.')}</p>
    <Link href="/login" className="mt-6 inline-block text-zinc-400">{t('Volver al login', 'Back to sign in')}</Link>
  </div>;
  return <form onSubmit={submit} className="space-y-5" aria-busy={waiting}>
    {mode === 'forgot' ? <div>
      <label htmlFor="recovery-email" className="block text-zinc-500 mb-2">Email</label>
      <input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={e => { retireField(); setEmail(e.target.value); }} className="soft-field py-3 px-4 text-sm" />
    </div> : <>
      <div><label htmlFor="recovery-password" className="block text-zinc-500 mb-2">{t('Nueva contraseña', 'New password')}</label>
        <PasswordInput id="recovery-password" autoComplete="new-password" required value={password} onChange={e => { retireField(); setPassword(e.target.value); }} className="py-3 px-4 text-sm" />
      </div>
      <div><label htmlFor="recovery-confirm" className="block text-zinc-500 mb-2">{t('Confirmar contraseña', 'Confirm password')}</label>
        <PasswordInput id="recovery-confirm" autoComplete="new-password" required value={confirm} onChange={e => { retireField(); setConfirm(e.target.value); }} className="py-3 px-4 text-sm" />
      </div>
    </>}
    {error ? <p role="alert" className="text-red-400 text-sm">{error}</p> : null}
    {result?.status === 'unconfirmed' || pending && !waiting ? <p role="status" className="text-zinc-400 text-sm">{t('La solicitud sigue sin confirmar. No se enviará otra desde este formulario.', 'The request remains unconfirmed. This form will not send another one.')}</p> : null}
    {result && ['invalid', 'expired', 'rate-limited'].includes(result.status) ? <p role="alert" className="text-red-400 text-sm">{result.status === 'rate-limited' ? t('Demasiadas solicitudes. Espera antes de intentarlo de nuevo.', 'Too many requests. Wait before trying again.') : t('Revisa los datos o solicita un enlace nuevo.', 'Check your input or request a new link.')}</p> : null}
    <button type="submit" disabled={waiting || pending} className="btn-offset w-full py-3.5 font-display font-bold disabled:opacity-60">
      {waiting ? t('Comprobando...', 'Checking...') : mode === 'forgot' ? t('Solicitar enlace', 'Request link') : t('Restablecer contraseña', 'Reset password')}
    </button>
    {result?.status === 'unconfirmed' && canObserve ? <button type="button" disabled={waiting} onClick={() => { if (own) void observe(own.attempt); }} className="w-full text-zinc-400 text-sm">
      {t('Consultar solicitud pendiente', 'Check pending request')}
    </button> : null}
    <Link href={mode === 'forgot' ? '/login' : '/forgot-password'} className="block text-center text-zinc-500 text-sm">{mode === 'forgot' ? t('Volver al login', 'Back to sign in') : t('Solicitar nuevo enlace', 'Request a new link')}</Link>
  </form>;
}
