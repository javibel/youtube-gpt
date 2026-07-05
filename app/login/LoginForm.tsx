'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/PasswordInput';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<'es'|'en'>('es');
  const [justVerified, setJustVerified] = useState(false);
  const [totp, setTotp] = useState('');
  const [showTotp, setShowTotp] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as 'es'|'en' | null;
    if (stored) setLang(stored);
    if (new URLSearchParams(window.location.search).get('verified') === '1') setJustVerified(true);
  }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result: any = await signIn('credentials', { email, password, totp: totp || undefined, redirect: false });
      if (result?.error) {
        if (!showTotp) {
          // First failure: could be a wrong password, or an admin account missing its 2FA
          // code — the message stays neutral either way so it doesn't reveal which account
          // has 2FA enabled.
          setShowTotp(true);
          setError(t(
            'Credenciales incorrectas. Si tu cuenta tiene verificación en dos pasos, introduce el código.',
            'Incorrect credentials. If your account has two-step verification, enter the code.'
          ));
        } else {
          setError(t('Email, contraseña o código incorrectos', 'Incorrect email, password, or code'));
        }
      } else {
        // Check if the user needs verification (middleware would redirect anyway, but this is better UX)
        const sess = await fetch('/api/auth/session').then(r => r.json());
        if (sess?.user?.requiresVerification) {
          // Send a fresh verification code
          fetch('/api/auth/resend-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, lang }),
          }).catch(() => {});
          router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        } else {
          router.push('/dashboard');
        }
      }
    } catch {
      setError(t('Error al ingresar', 'Sign in error'));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grain grid-bg flex items-center justify-center p-4" style={{ background: 'var(--ink)' }}>
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-1">
          <svg width="16" height="16" viewBox="7 7 18 18" fill="none">
            <circle cx="16" cy="16" r="8" fill="#ee4d5e"/>
          </svg>
          <span className="font-display font-bold text-[15px] tracking-tight text-white">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
        </a>
        <button
          onClick={() => { const next = lang === 'es' ? 'en' : 'es'; setLang(next); localStorage.setItem('ytubviral_lang', next); document.cookie = `ytubviral_lang=${next};path=/;max-age=31536000;samesite=lax`; }}
          className="flex items-center gap-1 font-mono-jb text-[13px] tracking-wider border border-white/15 rounded px-2 py-1 hover:border-white/30 transition"
        >
          <span style={{ color: lang === 'es' ? 'white' : '#52525b', fontWeight: lang === 'es' ? 700 : 400 }}>ES</span>
          <span className="text-zinc-700 mx-0.5">|</span>
          <span style={{ color: lang === 'en' ? 'white' : '#52525b', fontWeight: lang === 'en' ? 700 : 400 }}>EN</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8">
          <p className="font-mono-jb text-[13px] tracking-widest uppercase mb-3" style={{ color: 'var(--red)' }}>▸ {t('ACCESO', 'SIGN IN')}</p>
          <h1 className="font-display font-bold text-3xl tracking-tight text-white mb-2">{t('Bienvenido de vuelta', 'Welcome back')}</h1>
          <p className="text-zinc-400 text-sm">{t('Inicia sesión para seguir creando contenido viral', 'Sign in to keep creating viral content')}</p>
        </div>

        <div className="soft-card p-8">
          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl text-sm font-medium text-white transition hover:brightness-110"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {t('Continuar con Google', 'Continue with Google')}
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
            <span className="text-zinc-600 text-[13px] font-mono-jb">{t('o con email', 'or with email')}</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="soft-field py-3 px-4 text-sm" placeholder="you@email.com" required />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500">{t('Contraseña', 'Password')}</label>
                <a href="/forgot-password" className="font-mono-jb text-[13px] tracking-wider text-zinc-500 hover:text-white transition">
                  {t('¿Olvidaste la contraseña?', 'Forgot password?')}
                </a>
              </div>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)}
                className="py-3 px-4 text-sm" required />
            </div>

            {showTotp && (
              <div>
                <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">
                  {t('Código de verificación', 'Verification code')}
                </label>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  className="soft-field py-3 px-4 text-sm" placeholder="123456" maxLength={6} />
              </div>
            )}

            {justVerified && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(0,255,163,0.06)', border: '1px solid rgba(0,255,163,0.3)', color: '#4ade80' }}>
                {t('Email verificado. Inicia sesión para continuar.', 'Email verified. Sign in to continue.')}
              </div>
            )}

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(232,77,91,0.08)', border: '1px solid rgba(232,77,91,0.3)', color: '#f87171' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-offset w-full py-3.5 font-display font-bold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />{t('Ingresando...', 'Signing in...')}</>
              ) : t('Entrar →', 'Sign in →')}
            </button>
          </form>
        </div>

        <p className="text-zinc-500 text-sm mt-6 text-center">
          {t('¿No tienes cuenta?', "Don't have an account?")}{' '}
          <a href="/signup" className="text-white hover:underline font-medium">{t('Regístrate gratis', 'Sign up for free')}</a>
        </p>

        <div className="mt-8 flex justify-center gap-5 text-[13px] text-zinc-600">
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
        </div>
      </div>
    </div>
  );
}
