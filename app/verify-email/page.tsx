'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PasswordInput from '@/components/PasswordInput';
import { beginEmailCommand, claimEmailNavigation, emailVerificationBlocked, observeEmailOriginal, retireEmailProgress, type EmailAttempt, type EmailOutcome } from '@/lib/email-verification-client';
import { subscribeSessionCookieWriter } from '@/lib/session-cookie-writer';

function VerifyEmailContent() {

  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const emailFromUrl = searchParams.get('email') ?? '';
  const [email, setEmail] = useState(emailFromUrl);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'es'|'en'>('es');
  const [, repaint] = useState(0);
  const [display, setDisplay] = useState<{ frame: object; kind: 'verify' | 'resend'; waiting: boolean; outcome?: EmailOutcome } | undefined>(undefined);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const mounted = useRef(true), context = useRef({});
  const selection = useRef({ email, password, lang, route: emailFromUrl, id: session?.user?.id ?? '', actorEmail: session?.user?.email ?? '', ref: (session?.user as { authSessionRef?: string } | undefined)?.authSessionRef ?? '' });
  const fields = { email, password, lang, route: emailFromUrl, id: session?.user?.id ?? '', actorEmail: session?.user?.email ?? '', ref: (session?.user as { authSessionRef?: string } | undefined)?.authSessionRef ?? '' };
  if (Object.keys(fields).some(key => fields[key as keyof typeof fields] !== selection.current[key as keyof typeof fields])) selection.current = fields;
  const rendered = selection.current;
  const command = useRef<{ attempt: EmailAttempt; frame: object } | undefined>(undefined);
  const observer = useRef<ReturnType<typeof observeEmailOriginal> | undefined>(undefined);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true; const unsubscribe = subscribeSessionCookieWriter(() => repaint(n => n + 1));
    return () => { mounted.current = false; unsubscribe(); observer.current?.retire(); if (command.current) retireEmailProgress(command.current.attempt); if (navigationTimer.current !== undefined) clearTimeout(navigationTimer.current); };
  }, []);
  useEffect(() => {
    if (command.current && command.current.frame !== rendered) { observer.current?.retire(); retireEmailProgress(command.current.attempt); if (navigationTimer.current !== undefined) clearTimeout(navigationTimer.current); }
  }, [rendered]);
  useEffect(() => { const stored = localStorage.getItem('ytubviral_lang'); if (stored === 'es' || stored === 'en') setLang(stored); }, []);
  useEffect(() => { if (emailFromUrl) { setEmail(emailFromUrl); inputRefs.current[0]?.focus(); } }, [emailFromUrl]);
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const current = display?.frame === rendered ? display : undefined;
  const verifying = !!current?.waiting && current.kind === 'verify';
  const resending = !!current?.waiting && current.kind === 'resend';
  const verified = !!current?.outcome && ['verified-login', 'verified-signin-required', 'login-unconfirmed'].includes(current.outcome.status);
  const resent = current?.outcome?.status === 'resend-accepted';
  const blocked = emailVerificationBlocked() || status === 'loading';
  const own = command.current?.frame === rendered;
  const canEdit = () => mounted.current && selection.current === rendered && !emailVerificationBlocked() && status !== 'loading' && !verified;
  const canObserve = !!own && !current?.waiting && ['unconfirmed', 'login-unconfirmed'].includes(current?.outcome?.status ?? '');
  async function observeOwn() {
    const ownCommand = command.current;
    const active = () => mounted.current && command.current === ownCommand && selection.current === ownCommand?.frame;
    if (!ownCommand || !active() || observer.current) return;
    const view = observeEmailOriginal(ownCommand.attempt, context.current, active); observer.current = view;
    setDisplay({ frame: ownCommand.frame, kind: ownCommand.attempt.kind, waiting: true });
    const outcome = await view.promise;
    if (observer.current !== view) return;
    observer.current = undefined;
    if (!active()) return;
    setDisplay({ frame: ownCommand.frame, kind: ownCommand.attempt.kind, waiting: false, outcome });
    if (outcome.status === 'invalid') setError(t('Código incorrecto. Puedes introducir otro.', 'Incorrect code. You can enter another.'));
    else if (outcome.status === 'expired') setError(t('El código ha expirado. Solicita uno nuevo.', 'The code expired. Request another.'));
    else if (outcome.status === 'rate-limited') setError(t('Demasiados intentos. Espera antes de enviar otra solicitud.', 'Too many attempts. Wait before sending another request.'));
    else if (outcome.status === 'not-issued') setError(t('No se envió la solicitud. Puedes intentarlo de nuevo.', 'The request was not sent. You can try again.'));
    else if (outcome.status === 'unconfirmed' || outcome.status === 'login-unconfirmed') setError(t('No se ha confirmado la solicitud. Consulta el intento pendiente.', 'The request was not confirmed. Check the pending attempt.'));
    else setError('');
    if (['invalid', 'expired', 'resend-accepted'].includes(outcome.status)) setCode(['', '', '', '', '', '']);
    const target = claimEmailNavigation(ownCommand.attempt, context.current, outcome);
    if (target) navigationTimer.current = setTimeout(() => { if (active()) window.location.href = target; }, target === '/dashboard' ? 1500 : 2000);
  }
  function submitCode(fullCode: string) {
    if (!canEdit() || !/^\d{6}$/.test(fullCode)) return;
    const captured = rendered, active = () => mounted.current && selection.current === captured;
    const attempt = beginEmailCommand('verify', { email: captured.email, code: fullCode, password: captured.password, lang: captured.lang }, window.location.origin, context.current, active);
    if (!attempt) return;
    command.current = { attempt, frame: captured }; setError(''); void observeOwn();
  }
  function handleDigitChange(index: number, value: string) {
    if (!canEdit()) return;
    const digit = value.replace(/\D/g, '').slice(-1), next = [...code]; next[index] = digit; setCode(next); setError('');
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    if (digit && index === 5 && next.every(d => d)) submitCode(next.join(''));
  }
  function handleKeyDown(index: number, e: React.KeyboardEvent) { if (canEdit() && e.key === 'Backspace' && !code[index] && index > 0) inputRefs.current[index - 1]?.focus(); }
  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault(); if (!canEdit()) return;
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) { setCode(pasted.split('')); inputRefs.current[5]?.focus(); submitCode(pasted); }
  }
  function handleResend() {
    if (!canEdit()) return;
    const captured = rendered, active = () => mounted.current && selection.current === captured;
    const attempt = beginEmailCommand('resend', { email: captured.email, code: '', password: '', lang: captured.lang }, window.location.origin, context.current, active);
    if (!attempt) return;
    command.current = { attempt, frame: captured }; setError(''); void observeOwn();
  }

  return (
    <div className="min-h-screen grain grid-bg flex items-center justify-center p-4" style={{ background: 'var(--ink)' }}>
      <div className="absolute top-6 left-6">
        <a href="/" className="flex items-center gap-1">
          <svg width="16" height="16" viewBox="7 7 18 18" fill="none">
            <circle cx="16" cy="16" r="8" fill="#e84d5b"/>
          </svg>
          <span className="font-display font-bold text-[15px] tracking-tight text-white">
            YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
          </span>
        </a>
      </div>

      <div className="w-full max-w-md">
        <div className="soft-card p-8 rounded-2xl">

          {verified ? (
            <div className="text-center">
              <div className="text-5xl mb-4">&#10003;</div>
              <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
                {t('EMAIL VERIFICADO', 'EMAIL VERIFIED')}
              </p>
              <h1 className="font-display font-bold text-2xl text-white mb-3">
                {t('Email confirmado', 'Email confirmed')}
              </h1>
              <p className="text-zinc-400 text-sm">
                {current?.outcome?.status === 'login-unconfirmed' ? t('El acceso sigue sin confirmar.', 'Sign-in is still unconfirmed.') : t('Redirigiendo...', 'Redirecting...')}
              </p>
            </div>
          ) : (
            <div>
              <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
                {t('VERIFICA TU EMAIL', 'VERIFY YOUR EMAIL')}
              </p>
              <h1 className="font-display font-bold text-2xl text-white mb-3">
                {t('Introduce el código', 'Enter the code')}
              </h1>
              <p className="text-zinc-400 text-sm mb-6">
                {t(
                  'Te hemos enviado un código de 6 dígitos a ',
                  "We've sent a 6-digit code to "
                )}
                {email ? <span className="text-white font-medium">{email}</span> : t('tu email', 'your email')}
              </p>

              {/* Email input (if not from URL) */}
              {!emailFromUrl && (
                <div className="mb-4">
                  <input
                    type="email"
                    disabled={blocked}
                    value={email}
                    onChange={(e) => { if (canEdit()) setEmail(e.target.value); }}
                    placeholder={t('tu@email.com', 'your@email.com')}
                    required
                    className="yv-input text-white placeholder-zinc-600 text-sm"
                  />
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="email-signin-password" className="text-sm text-zinc-400">{t('Contraseña para entrar al verificar (opcional)', 'Password to sign in after verification (optional)')}</label>
                <PasswordInput id="email-signin-password" disabled={blocked} value={password} onChange={(e) => { if (canEdit()) setPassword(e.target.value); }} />
              </div>

              {/* 6-digit code input */}
              <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    disabled={blocked}
                    className="yv-input w-12 h-14 text-center text-xl font-bold text-white disabled:opacity-50"
                    style={{ caretColor: 'var(--yv-brand)' }}
                  />
                ))}
              </div>


              {verifying && (
                <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm mb-4">
                  <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full spin-r" />
                  {t('Verificando...', 'Verifying...')}
                </div>
              )}

              {resent ? (
                <p className="text-center text-sm text-zinc-400 mb-4">
                  {t('Solicitud de código aceptada. Revisa tu bandeja.', 'Code request accepted. Check your inbox.')}
                </p>
              ) : (
                <p className="text-center text-sm text-zinc-500 mb-4">
                  {t('¿No lo recibiste? ', "Didn't receive it? ")}
                  <button
                    onClick={handleResend}
                    disabled={blocked}
                    className="text-white hover:underline disabled:opacity-50"
                  >
                    {resending ? t('Enviando...', 'Sending...') : t('Reenviar código', 'Resend code')}
                  </button>
                </p>
              )}

              <div className="mt-6 pt-6" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)' }}>
                <a href="/login" className="text-zinc-500 text-[13px] hover:text-zinc-300 transition">
                  &#8592; {t('Volver al login', 'Back to login')}
                </a>
              </div>
            </div>
          )}
          {error && <div role="alert" className="yv-note yv-note--error mb-4">{error}</div>}
          {canObserve && <button type="button" onClick={() => void observeOwn()}>{t('Consultar intento pendiente', 'Check pending attempt')}</button>}
          {blocked && !own && <p role="status">{t('Hay una operación pendiente. Espera a que termine.', 'An operation is pending. Wait for it to finish.')}</p>}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
