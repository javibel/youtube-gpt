'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function VerifyTotpPage() {
  const { data: session } = useSession();
  const scope = JSON.stringify([session?.user?.id, session?.user?.email]);
  return <VerifyTotpAccount key={scope} />;
}

function VerifyTotpAccount() {
  const router = useRouter();
  const { data: session, update } = useSession();

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [lang, setLang] = useState<'es' | 'en'>('es');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const mounted = useRef(true);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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
    if (session?.user && !(session.user as { requiresTotp?: boolean }).requiresTotp) {
      router.push('/dashboard');
    }
  }, [session, router]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleDigitChange(index: number, value: string) {
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
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(''));
      inputRefs.current[5]?.focus();
      submitCode(pasted);
    }
  }

  async function submitCode(fullCode: string) {
    setVerifying(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: fullCode }),
      });
      if (!mounted.current) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!mounted.current) return;
        setError(
          data.error === 'rate_limited'
            ? t('Demasiados intentos. Espera unos minutos.', 'Too many attempts. Wait a few minutes.')
            : t('Código incorrecto. Revísalo e inténtalo de nuevo.', 'Incorrect code. Check it and try again.')
        );
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        return;
      }
      const expected = session?.user;
      const confirmed = await update({ totpCode: fullCode });
      if (!mounted.current) return;
      const principal = confirmed?.user as { id?: string; email?: string | null; requiresTotp?: boolean; isAdmin?: boolean } | undefined;
      if (!expected?.id || !expected.email || !principal || principal.id !== expected.id
        || principal.email !== expected.email || principal.requiresTotp !== false || principal.isAdmin !== true) {
        throw new Error('Second factor was not confirmed for this session');
      }
      setVerified(true);
      navigationTimer.current = setTimeout(() => { if (mounted.current) router.push('/dashboard'); }, 1000);
    } catch {
      if (mounted.current) setError(t('No se ha confirmado la verificación. Inténtalo de nuevo.', 'Verification was not confirmed. Try again.'));
    } finally {
      if (mounted.current) setVerifying(false);
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
                    disabled={verifying}
                    className="yv-input w-12 h-14 text-center text-xl font-bold text-white disabled:opacity-50"
                    style={{ caretColor: 'var(--yv-brand)' }}
                  />
                ))}
              </div>

              {error && <div className="yv-note yv-note--error mb-4">{error}</div>}

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm mb-4">
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
