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

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as 'es'|'en' | null;
    if (stored) setLang(stored);
  }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result: any = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError(t('Email o contraseña incorrectos', 'Incorrect email or password'));
      } else {
        router.push('/dashboard');
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

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(232,77,91,0.08)', border: '1px solid rgba(232,77,91,0.3)', color: '#f87171' }}>
                ⚠️ {error}
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
