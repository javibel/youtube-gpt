'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/PasswordInput';

export default function SignupPage() {
  const router = useRouter();
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
    if (password.length < 6) {
      setError(t('La contraseña debe tener al menos 6 caracteres', 'Password must be at least 6 characters'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('Error al crear cuenta', 'Error creating account'));
      } else {
        router.push('/login');
      }
    } catch {
      setError(t('Error al crear cuenta', 'Error creating account'));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grain grid-bg flex items-center justify-center p-4" style={{ background: 'var(--ink)' }}>
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
            <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
          </svg>
          <span className="font-display font-bold text-[15px] tracking-tight text-white">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
        </a>
        <button
          onClick={() => { const next = lang === 'es' ? 'en' : 'es'; setLang(next); localStorage.setItem('ytubviral_lang', next); document.cookie = `ytubviral_lang=${next};path=/;max-age=31536000;samesite=lax`; }}
          className="flex items-center gap-1 font-mono-jb text-[10px] tracking-wider border border-white/15 rounded px-2 py-1 hover:border-white/30 transition"
        >
          <span style={{ color: lang === 'es' ? 'white' : '#52525b', fontWeight: lang === 'es' ? 700 : 400 }}>ES</span>
          <span className="text-zinc-700 mx-0.5">|</span>
          <span style={{ color: lang === 'en' ? 'white' : '#52525b', fontWeight: lang === 'en' ? 700 : 400 }}>EN</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8">
          <p className="font-mono-jb text-[10px] tracking-widest uppercase mb-3" style={{ color: 'var(--red)' }}>▸ {t('REGISTRO GRATIS', 'FREE SIGN UP')}</p>
          <h1 className="font-display font-bold text-3xl tracking-tight text-white mb-2">{t('Empieza a crecer hoy', 'Start growing today')}</h1>
          <p className="text-zinc-400 text-sm">{t('10 generaciones al mes gratis. Sin tarjeta de crédito.', '10 free generations per month. No credit card required.')}</p>
        </div>

        <div className="soft-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Nombre', 'Name')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="soft-field py-3 px-4 text-sm"
                placeholder={t('Tu nombre', 'Your name')} required />
            </div>

            <div>
              <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="soft-field py-3 px-4 text-sm" placeholder="you@email.com" required />
            </div>

            <div>
              <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Contraseña', 'Password')}</label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)}
                className="py-3 px-4 text-sm"
                placeholder={t('Mínimo 6 caracteres', 'At least 6 characters')} required />
            </div>

            <div>
              <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Confirmar contraseña', 'Confirm password')}</label>
              <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
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
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />{t('Creando cuenta...', 'Creating account...')}</>
              ) : t('Crear cuenta gratis →', 'Create free account →')}
            </button>
          </form>

          <p className="text-zinc-600 text-xs mt-5 text-center leading-relaxed">
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

        <div className="mt-6 flex justify-center gap-5 text-xs text-zinc-600">
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
        </div>
      </div>
    </div>
  );
}
