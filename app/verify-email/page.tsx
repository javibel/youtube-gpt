'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, update } = useSession();

  const emailFromUrl = searchParams.get('email') ?? '';

  const [email, setEmail] = useState(emailFromUrl);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [lang, setLang] = useState<'es'|'en'>('es');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as 'es'|'en' | null;
    if (stored) setLang(stored);
  }, []);

  // If user has a stale session (already verified in DB but JWT says requiresVerification),
  // refresh the JWT from DB and redirect to dashboard
  useEffect(() => {
    if (session?.user && (session.user as { requiresVerification?: boolean }).requiresVerification) {
      update().then((updated) => {
        if (updated && !(updated.user as { requiresVerification?: boolean }).requiresVerification) {
          router.push('/dashboard');
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Auto-focus first input
  useEffect(() => {
    if (emailFromUrl) inputRefs.current[0]?.focus();
  }, [emailFromUrl]);

  function handleDigitChange(index: number, value: string) {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError('');

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (digit && index === 5 && next.every(d => d)) {
      submitCode(next.join(''));
    }
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
      const digits = pasted.split('');
      setCode(digits);
      inputRefs.current[5]?.focus();
      submitCode(pasted);
    }
  }

  async function submitCode(fullCode: string) {
    if (!email) return;
    setVerifying(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: fullCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'invalid_code') {
          setError(t('Código incorrecto. Revísalo e intenta de nuevo.', 'Incorrect code. Check it and try again.'));
        } else if (data.error === 'expired_code') {
          setError(t('El código ha expirado. Solicita uno nuevo.', 'Code has expired. Request a new one.'));
        } else {
          setError(t('Error al verificar. Intenta de nuevo.', 'Verification error. Try again.'));
        }
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        return;
      }

      setVerified(true);

      // Auto-login: retrieve password from sessionStorage (set during signup)
      const pw = sessionStorage.getItem('ytv_signup_pw');
      if (pw) {
        sessionStorage.removeItem('ytv_signup_pw');
        const loginResult: any = await signIn('credentials', { email, password: pw, redirect: false });
        if (!loginResult?.error) {
          setTimeout(() => router.push('/dashboard'), 1500);
          return;
        }
      }
      // Fallback: redirect to login with message
      setTimeout(() => router.push('/login?verified=1'), 2000);
    } catch {
      setError(t('Error de conexión. Intenta de nuevo.', 'Connection error. Try again.'));
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!email || resending) return;
    setResending(true);
    setResent(false);
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang }),
      });
      setResent(true);
      setCode(['', '', '', '', '', '']);
      setError('');
      inputRefs.current[0]?.focus();
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen grain grid-bg flex items-center justify-center p-4" style={{ background: 'var(--ink)' }}>
      <div className="absolute top-6 left-6">
        <a href="/" className="flex items-center gap-1">
          <svg width="16" height="16" viewBox="7 7 18 18" fill="none">
            <circle cx="16" cy="16" r="8" fill="#ee4d5e"/>
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
                {t('¡Todo listo!', "You're all set!")}
              </h1>
              <p className="text-zinc-400 text-sm">
                {t('Redirigiendo...', 'Redirecting...')}
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('tu@email.com', 'your@email.com')}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-white/25"
                  />
                </div>
              )}

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
                    disabled={verifying}
                    className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-white/15 bg-white/5 text-white focus:outline-none focus:border-[var(--red)] transition disabled:opacity-50"
                    style={{ caretColor: 'var(--red)' }}
                  />
                ))}
              </div>

              {error && (
                <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{ background: 'rgba(232,77,91,0.08)', border: '1px solid rgba(232,77,91,0.3)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm mb-4">
                  <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full spin-r" />
                  {t('Verificando...', 'Verifying...')}
                </div>
              )}

              {resent ? (
                <p className="text-center text-sm text-zinc-400 mb-4">
                  {t('Nuevo código enviado. Revisa tu bandeja.', 'New code sent. Check your inbox.')}
                </p>
              ) : (
                <p className="text-center text-sm text-zinc-500 mb-4">
                  {t('¿No lo recibiste? ', "Didn't receive it? ")}
                  <button
                    onClick={handleResend}
                    disabled={resending}
                    className="text-white hover:underline disabled:opacity-50"
                  >
                    {resending ? t('Enviando...', 'Sending...') : t('Reenviar código', 'Resend code')}
                  </button>
                </p>
              )}

              <div className="mt-6 pt-6 border-t border-white/5">
                <a href="/login" className="text-zinc-500 text-[13px] hover:text-zinc-300 transition">
                  &#8592; {t('Volver al login', 'Back to login')}
                </a>
              </div>
            </div>
          )}
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
