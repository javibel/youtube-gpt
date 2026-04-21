'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import PasswordInput from '@/components/PasswordInput';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<'es'|'en'>('es');

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as 'es'|'en' | null;
    if (stored) setLang(stored);
  }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('Las contraseñas no coinciden', 'Passwords do not match'));
      return;
    }
    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, lang }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? t('Error al restablecer la contraseña', 'Error resetting password'));
      return;
    }
    router.push('/login?reset=1');
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-red-400 text-sm mb-4">{t('Enlace inválido.', 'Invalid link.')}</p>
        <Link href="/forgot-password" className="font-mono-jb text-[11px] tracking-wider uppercase text-zinc-500 hover:text-white transition">
          {t('Solicitar nuevo enlace', 'Request new link')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Nueva contraseña', 'New password')}</label>
        <PasswordInput required placeholder={t('Mínimo 8 caracteres', 'At least 8 characters')}
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="py-3 px-4 text-sm" />
      </div>
      <div>
        <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Confirmar contraseña', 'Confirm password')}</label>
        <PasswordInput required
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="py-3 px-4 text-sm" />
      </div>
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(232,77,91,0.08)', border: '1px solid rgba(232,77,91,0.3)', color: '#f87171' }}>
          ⚠️ {error}
        </div>
      )}
      <button type="submit" disabled={loading}
        className="btn-offset w-full py-3.5 font-display font-bold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2">
        {loading ? (
          <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />{t('Guardando...', 'Saving...')}</>
        ) : t('Restablecer contraseña →', 'Reset password →')}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const [lang, setLang] = useState<'es'|'en'>('es');

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as 'es'|'en' | null;
    if (stored) setLang(stored);
  }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

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
          <p className="font-mono-jb text-[10px] tracking-widest uppercase mb-3" style={{ color: 'var(--red)' }}>▸ {t('NUEVA CONTRASEÑA', 'NEW PASSWORD')}</p>
          <h1 className="font-display font-bold text-3xl tracking-tight text-white mb-2">{t('Restablece tu contraseña', 'Reset your password')}</h1>
          <p className="text-zinc-400 text-sm">{t('Elige una contraseña segura para tu cuenta.', 'Choose a strong password for your account.')}</p>
        </div>

        <div className="soft-card p-8">
          <Suspense>
            <ResetPasswordForm />
          </Suspense>
        </div>

        <div className="mt-8 flex justify-center gap-5 text-xs text-zinc-600">
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
        </div>
      </div>
    </div>
  );
}
