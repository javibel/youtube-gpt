'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import PasswordInput from '@/components/PasswordInput';
import { hasTrackingConsent } from '@/components/CookieConsent';

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get('ref') || '';

  // Store ref in cookie so Google OAuth signIn callback can read it
  // RGPD: cookie de atribución — solo con consentimiento de tracking
  useEffect(() => {
    if (refCode && hasTrackingConsent()) {
      document.cookie = `ytv_ref=${refCode};path=/;max-age=3600;samesite=lax`;
    }
  }, [refCode]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<'es'|'en'>('es');

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as 'es'|'en' | null;
    if (stored) setLang(stored);
  }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('Las contraseñas no coinciden', 'Passwords do not match'));
      return;
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(t(
        'Mínimo 8 caracteres, con al menos 1 letra y 1 número',
        'At least 8 characters, with at least 1 letter and 1 number'
      ));
      return;
    }

    // Read first-touch UTM attribution from cookie
    let utmSource: string | undefined;
    let utmMedium: string | undefined;
    let utmCampaign: string | undefined;
    try {
      const utmCookie = document.cookie.split('; ').find(r => r.startsWith('ytv_utm='));
      if (utmCookie) {
        const parsed = JSON.parse(decodeURIComponent(utmCookie.split('=').slice(1).join('=')));
        utmSource = parsed.source ?? undefined;
        utmMedium = parsed.medium ?? undefined;
        utmCampaign = parsed.campaign ?? undefined;
      }
    } catch {}

    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, lang, utmSource, utmMedium, utmCampaign, ref: refCode || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('Error al crear cuenta', 'Error creating account'));
      } else {
        // Store password temporarily for auto-login after verification
        sessionStorage.setItem('ytv_signup_pw', password);
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
      }
    } catch {
      setError(t('Error al crear cuenta', 'Error creating account'));
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
          <p className="font-mono-jb text-[13px] tracking-widest uppercase mb-3" style={{ color: 'var(--red)' }}>▸ {t('REGISTRO GRATIS', 'FREE SIGN UP')}</p>
          <h1 className="font-display font-bold text-3xl tracking-tight text-white mb-2">{t('Empieza a crecer hoy', 'Start growing today')}</h1>
          <p className="text-zinc-400 text-sm">{t('10 generaciones al mes gratis. Sin tarjeta de crédito.', '10 free generations per month. No credit card required.')}</p>
        </div>

        <div className="soft-card p-8">
          <button
            onClick={() => signIn('google', { callbackUrl: refCode ? `/dashboard?ref=${refCode}` : '/dashboard' })}
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
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">{t('Nombre', 'Name')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="soft-field py-3 px-4 text-sm"
                placeholder={t('Tu nombre', 'Your name')} required />
            </div>

            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="soft-field py-3 px-4 text-sm" placeholder="you@email.com" required />
            </div>

            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">{t('Contraseña', 'Password')}</label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)}
                className="py-3 px-4 text-sm"
                placeholder={t('Mínimo 8 caracteres', 'At least 8 characters')} required />
              <p className="font-mono-jb text-[11px] mt-1.5" style={{ color: 'var(--yv-text-4)' }}>
                {t('Al menos 1 letra y 1 número', 'At least 1 letter and 1 number')}
              </p>
            </div>

            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">{t('Confirmar contraseña', 'Confirm password')}</label>
              <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="py-3 px-4 text-sm"
                placeholder={t('Repite tu contraseña', 'Repeat your password')} required />
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(232,77,91,0.08)', border: '1px solid rgba(232,77,91,0.3)', color: '#f87171' }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-offset w-full py-3.5 font-display font-bold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />{t('Creando cuenta...', 'Creating account...')}</>
              ) : t('Crear cuenta gratis →', 'Create free account →')}
            </button>
          </form>

          <p className="text-zinc-600 text-[13px] mt-5 text-center leading-relaxed">
            {t('Al registrarte aceptas nuestros', 'By signing up you agree to our')}{' '}
            <a href="/terms" className="text-zinc-400 hover:text-white transition underline">{t('Términos y Condiciones', 'Terms and Conditions')}</a>{' '}
            {t('y la', 'and our')}{' '}
            <a href="/privacy" className="text-zinc-400 hover:text-white transition underline">{t('Política de Privacidad', 'Privacy Policy')}</a>.
          </p>
        </div>

        <p className="text-zinc-500 text-sm mt-6 text-center">
          {t('¿Ya tienes cuenta?', 'Already have an account?')}{' '}
          <a href="/login" className="text-white hover:underline font-medium">{t('Inicia sesión aquí', 'Sign in here')}</a>
        </p>

        <div className="mt-6 flex justify-center gap-5 text-[13px] text-zinc-600">
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
        </div>
      </div>
    </div>
  );
}
