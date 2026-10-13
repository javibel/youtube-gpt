'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { beginTotp, claimTotpConfirmation, currentTotpOriginal, observeTotpOriginal, ownsTotpOriginal, retireTotpProgress, subscribeTotp, totpBlocked, totpHeldByOtherCookieWriter } from '@/lib/totp-client-command';
import type { TotpAttempt, TotpOutcome } from '@/lib/totp-client-command';

export default function VerifyTotpPage() {
  const { data: session } = useSession();
  const ref = (session?.user as { authSessionRef?: unknown } | undefined)?.authSessionRef;
  const scope = JSON.stringify([session?.user?.id, session?.user?.email, ref]);
  return <VerifyTotpAccount key={scope} />;
}

function VerifyTotpAccount() {
  const router = useRouter();
  const { data: session } = useSession();
  const sessionRef = (session?.user as { authSessionRef?: unknown } | undefined)?.authSessionRef;
  const canIdentify = typeof sessionRef === 'string' && !!sessionRef;

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [lang, setLang] = useState<'es' | 'en'>('es');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const mounted = useRef(true);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const context = useRef({});
  const attempt = useRef<TotpAttempt | null>(null);
  const observer = useRef<ReturnType<typeof observeTotpOriginal> | null>(null);
  const [, render] = useState(0);
  const blocked = totpBlocked();
  const otherCookieWriter = totpHeldByOtherCookieWriter();
  const original = currentTotpOriginal();
  const ownOriginal = original && ownsTotpOriginal(original, context.current) ? original : undefined;
  useEffect(() => subscribeTotp(() => render(value => value + 1)), []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      observer.current?.retire();
      if (attempt.current) retireTotpProgress(attempt.current);
      if (navigationTimer.current !== null) clearTimeout(navigationTimer.current);
    };
  }, []);

  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as 'es' | 'en' | null;
    if (stored) setLang(stored);
  }, []);

  // If the session is already clear (e.g. verified in another tab), leave.
  useEffect(() => {
    if (!attempt.current && !blocked && session?.user
      && (session.user as { requiresTotp?: boolean; isAdmin?: boolean }).requiresTotp === false
      && (session.user as { isAdmin?: boolean }).isAdmin === true) {
      router.push('/dashboard');
    }
  }, [session, router, blocked]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleDigitChange(index: number, value: string) {
    if (verifying || blocked || verified || !canIdentify) return;
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError('');

    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    if (digit && index === 5 && next.every((d) => d)) submitCode(next.join(''));
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    if (verifying || blocked || verified || !canIdentify) return;
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(''));
      inputRefs.current[5]?.focus();
      submitCode(pasted);
    }
  }

  function showOutcome(outcome: TotpOutcome, command: TotpAttempt) {
    if (!mounted.current || attempt.current !== command) return;
    setVerifying(false);
    if (outcome.status === 'confirmed' && claimTotpConfirmation(command, context.current, outcome)) {
      setVerified(true);
      navigationTimer.current = setTimeout(() => {
        if (mounted.current) window.location.href = '/dashboard';
      }, 1000);
    } else if (outcome.status === 'invalid' || outcome.status === 'rate-limited') {
      setError(outcome.status === 'rate-limited'
        ? t('Demasiados intentos. Espera unos minutos.', 'Too many attempts. Wait a few minutes.')
        : t('Código incorrecto. Revísalo e inténtalo de nuevo.', 'Incorrect code. Check it and try again.'));
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } else if (outcome.status === 'not-issued') {
      setError(t('La espera terminó antes de actualizar la sesión. Introduce un código nuevo.', 'The wait ended before updating the session. Enter a new code.'));
      setCode(['', '', '', '', '', '']);
    } else {
      setError(t('No se ha confirmado la verificación. Consulta el resultado pendiente antes de enviar otro código.', 'Verification was not confirmed. Check the pending result before sending another code.'));
    }
  }

  function waitFor(command: TotpAttempt) {
    if (!mounted.current) return;
    observer.current?.retire();
    const wait = observeTotpOriginal(command, () => mounted.current);
    observer.current = wait;
    setVerifying(true);
    setError('');
    void wait.promise.then(outcome => {
      if (observer.current === wait) showOutcome(outcome, command);
    });
  }

  function submitCode(fullCode: string) {
    if (verifying || verified || totpBlocked()) return;
    const owner = session?.user;
    if (!owner?.id || !owner.email || typeof sessionRef !== 'string' || !sessionRef) return;
    const command = beginTotp({ id: owner.id, email: owner.email, authSessionRef: sessionRef }, context.current, fullCode, () => mounted.current);
    if (!command) return;
    attempt.current = command;
    waitFor(command);
  }

  function observe() {
    if (!verifying && ownOriginal && mounted.current) {
      attempt.current = ownOriginal;
      waitFor(ownOriginal);
    }
  }

  return (
    <div className="min-h-screen grain grid-bg flex items-center justify-center p-4" style={{ background: 'var(--ink)' }}>
      <div className="absolute top-6 left-6">
        <a href="/" className="flex items-center gap-1">
          <svg width="16" height="16" viewBox="7 7 18 18" fill="none">
            <circle cx="16" cy="16" r="8" fill="#e84d5b" />
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
                {t('VERIFICADO', 'VERIFIED')}
              </p>
              <h1 className="font-display font-bold text-2xl text-white mb-3">
                {t('¡Todo listo!', "You're all set!")}
              </h1>
              <p className="text-zinc-400 text-sm">{t('Redirigiendo...', 'Redirecting...')}</p>
            </div>
          ) : (
            <div>
              <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
                {t('VERIFICACIÓN EN DOS PASOS', 'TWO-FACTOR VERIFICATION')}
              </p>
              <h1 className="font-display font-bold text-2xl text-white mb-3">
                {t('Introduce el código', 'Enter the code')}
              </h1>
              <p className="text-zinc-400 text-sm mb-6">
                {t(
                  'Abre tu app de autenticación e introduce el código de 6 dígitos.',
                  'Open your authenticator app and enter the 6-digit code.'
                )}
              </p>

              <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    aria-label={t(`Dígito ${i + 1} del código`, `Code digit ${i + 1}`)}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    disabled={verifying || blocked || !canIdentify}
                    className="yv-input w-12 h-14 text-center text-xl font-bold text-white disabled:opacity-50"
                    style={{ caretColor: 'var(--yv-brand)' }}
                  />
                ))}
              </div>

              {error && <div role="alert" className="yv-note yv-note--error mb-4">{error}</div>}
              {!canIdentify && <div role="status" className="text-zinc-400 text-sm mb-4">
                <p>{t('Inicia sesión de nuevo para verificar esta sesión.', 'Sign in again to verify this session.')}</p>
                <a href="/login" className="yv-btn mt-3 inline-block">{t('Volver a iniciar sesión', 'Sign in again')}</a>
              </div>}
              {(blocked || ownOriginal) && !verifying && (
                <div className="text-zinc-400 text-sm mb-4" role="status">
                  {blocked && <p>{otherCookieWriter
                    ? t('Hay un cierre de sesión en curso. Espera antes de verificar.', 'A sign-out is in progress. Wait before verifying.')
                    : t('Hay una verificación pendiente. Todavía no se puede enviar otro código.', 'A verification is pending. Another code cannot be sent yet.')}</p>}
                  {ownOriginal && <button type="button" className="yv-btn mt-3" onClick={observe}>
                    {t('Consultar resultado pendiente', 'Check pending result')}
                  </button>}
                </div>
              )}

              {verifying && (
                <div role="status" className="flex items-center justify-center gap-2 text-zinc-400 text-sm mb-4">
                  <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full spin-r" />
                  {t('Verificando...', 'Verifying...')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
