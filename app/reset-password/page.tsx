'use client';

import { useState, useEffect, Suspense } from 'react';
import PasswordRecoveryForm from '@/components/PasswordRecoveryForm';

export default function ResetPasswordPage() {
  const [lang, setLang] = useState<'es'|'en'>('es');

  useEffect(() => {
    try { const stored = localStorage.getItem('ytubviral_lang'); if (stored === 'es' || stored === 'en') setLang(stored); } catch {}
  }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <div className="min-h-screen grain grid-bg flex items-center justify-center p-4" style={{ background: 'var(--ink)' }}>
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-1">
          <svg width="16" height="16" viewBox="7 7 18 18" fill="none">
            <circle cx="16" cy="16" r="8" fill="#e84d5b"/>
          </svg>
          <span className="font-display font-bold text-[15px] tracking-tight text-white">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
        </a>
        <button
          onClick={() => { const next = lang === 'es' ? 'en' : 'es'; setLang(next); try { localStorage.setItem('ytubviral_lang', next); } catch {} document.cookie = `ytubviral_lang=${next};path=/;max-age=31536000;samesite=lax`; }}
          className="yv-chip flex items-center gap-1 font-mono-jb text-[13px] tracking-wider px-2 py-1"
        >
          <span style={{ color: lang === 'es' ? 'white' : '#52525b', fontWeight: lang === 'es' ? 700 : 400 }}>ES</span>
          <span className="text-zinc-700 mx-0.5">|</span>
          <span style={{ color: lang === 'en' ? 'white' : '#52525b', fontWeight: lang === 'en' ? 700 : 400 }}>EN</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8">
          <p className="font-mono-jb text-[13px] tracking-widest uppercase mb-3" style={{ color: 'var(--red)' }}>▸ {t('NUEVA CONTRASEÑA', 'NEW PASSWORD')}</p>
          <h1 className="font-display font-bold text-3xl tracking-tight text-white mb-2">{t('Restablece tu contraseña', 'Reset your password')}</h1>
          <p className="text-zinc-400 text-sm">{t('Elige una contraseña segura para tu cuenta.', 'Choose a strong password for your account.')}</p>
        </div>

        <div className="soft-card p-8">
          <Suspense>
            <PasswordRecoveryForm mode="reset" lang={lang} />
          </Suspense>
        </div>

        <div className="mt-8 flex justify-center gap-5 text-[13px] text-zinc-600">
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
        </div>
      </div>
    </div>
  );
}
