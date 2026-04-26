'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { update } = useSession();

  const success = searchParams.get('success') === '1';
  const error = searchParams.get('error'); // 'invalid' | 'expired'

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [lang, setLang] = useState<'es'|'en'>('es');

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as 'es'|'en' | null;
    if (stored) setLang(stored);
  }, []);

  // On success: refresh session so emailVerified is updated, then redirect
  useEffect(() => {
    if (success) {
      update().then(() => {
        setTimeout(() => router.push('/dashboard'), 2000);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), lang }),
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen grain grid-bg flex items-center justify-center p-4" style={{ background: 'var(--ink)' }}>
      <div className="absolute top-6 left-6">
        <a href="/" className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
            <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
          </svg>
          <span className="font-display font-bold text-[15px] tracking-tight text-white">
            YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
          </span>
        </a>
      </div>

      <div className="w-full max-w-md">
        <div className="soft-card p-8 rounded-2xl">

          {success ? (
            <div className="text-center">
              <div className="text-5xl mb-4">✓</div>
              <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
                {t('EMAIL VERIFICADO', 'EMAIL VERIFIED')}
              </p>
              <h1 className="font-display font-bold text-2xl text-white mb-3">
                {t('¡Todo listo!', "You're all set!")}
              </h1>
              <p className="text-zinc-400 text-sm">
                {t('Redirigiendo al dashboard...', 'Redirecting to dashboard...')}
              </p>
            </div>
          ) : error ? (
            <div>
              <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
                {t('ENLACE INVÁLIDO', 'INVALID LINK')}
              </p>
              <h1 className="font-display font-bold text-2xl text-white mb-3">
                {error === 'expired'
                  ? t('El enlace ha expirado', 'Link has expired')
                  : t('Enlace inválido', 'Invalid link')}
              </h1>
              <p className="text-zinc-400 text-sm mb-6">
                {t('Introduce tu email para recibir un nuevo enlace de verificación.', 'Enter your email to get a new verification link.')}
              </p>
              {sent ? (
                <div className="p-4 rounded-xl border border-white/10 bg-white/5 text-center">
                  <p className="text-zinc-300 text-sm">{t('Email enviado. Revisa tu bandeja de entrada.', 'Email sent. Check your inbox.')}</p>
                </div>
              ) : (
                <form onSubmit={handleResend} className="flex flex-col gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('tu@email.com', 'your@email.com')}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-white/25"
                  />
                  <button type="submit" disabled={sending} className="btn-offset w-full py-3 text-sm font-display disabled:opacity-50">
                    {sending ? t('Enviando...', 'Sending...') : t('Reenviar verificación', 'Resend verification')}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div>
              <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
                {t('VERIFICA TU EMAIL', 'VERIFY YOUR EMAIL')}
              </p>
              <h1 className="font-display font-bold text-2xl text-white mb-3">
                {t('Revisa tu bandeja de entrada', 'Check your inbox')}
              </h1>
              <p className="text-zinc-400 text-sm mb-6">
                {t(
                  'Te hemos enviado un email con un enlace de verificación. El enlace expira en 24 horas.',
                  "We've sent you a verification email. The link expires in 24 hours."
                )}
              </p>
              {sent ? (
                <div className="p-4 rounded-xl border border-white/10 bg-white/5 text-center">
                  <p className="text-zinc-300 text-sm">{t('Email reenviado. Revisa tu bandeja de entrada.', 'Email resent. Check your inbox.')}</p>
                </div>
              ) : (
                <div>
                  <p className="text-zinc-500 text-xs mb-4">{t('¿No lo recibiste?', "Didn't receive it?")}</p>
                  <form onSubmit={handleResend} className="flex flex-col gap-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('Introduce tu email', 'Enter your email')}
                      required
                      className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-white/25"
                    />
                    <button type="submit" disabled={sending} className="btn-offset w-full py-3 text-sm font-display disabled:opacity-50">
                      {sending ? t('Enviando...', 'Sending...') : t('Reenviar email', 'Resend email')}
                    </button>
                  </form>
                </div>
              )}
              <div className="mt-6 pt-6 border-t border-white/5">
                <a href="/login" className="text-zinc-500 text-xs hover:text-zinc-300 transition">
                  ← {t('Volver al login', 'Back to login')}
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
