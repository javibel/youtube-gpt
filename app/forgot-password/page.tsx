'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<'es'|'en'>('es');

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as 'es'|'en' | null;
    if (stored) setLang(stored);
  }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen grain grid-bg flex items-center justify-center p-4" style={{ background: 'var(--ink)' }}>
      <a href="/" className="absolute top-6 left-6 flex items-center gap-2">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
          <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
        </svg>
        <span className="font-display font-bold text-[15px] tracking-tight text-white">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
      </a>

      <div className="w-full max-w-md">
        <div className="mb-8">
          <p className="font-mono-jb text-[10px] tracking-widest uppercase mb-3" style={{ color: 'var(--red)' }}>▸ {t('RECUPERAR ACCESO', 'RECOVER ACCESS')}</p>
          <h1 className="font-display font-bold text-3xl tracking-tight text-white mb-2">
            {t('¿Olvidaste tu contraseña?', 'Forgot your password?')}
          </h1>
          {!sent && <p className="text-zinc-400 text-sm">{t('Te enviaremos un enlace para restablecerla.', "We'll send you a link to reset it.")}</p>}
        </div>

        <div className="soft-card p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: 'rgba(232,77,91,0.15)', border: '1px solid rgba(232,77,91,0.3)' }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-white font-semibold mb-2">{t('Email enviado', 'Email sent')}</p>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {t('Si ese email está registrado, recibirás un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada.', 'If that email is registered, you will receive a link to reset your password. Check your inbox.')}
              </p>
              <Link href="/login" className="mt-6 inline-block font-mono-jb text-[11px] tracking-wider uppercase text-zinc-500 hover:text-white transition">
                ← {t('Volver al login', 'Back to sign in')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">Email</label>
                <input type="email" required placeholder="you@email.com" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="soft-field py-3 px-4 text-sm" />
              </div>
              <button type="submit" disabled={loading}
                className="btn-offset w-full py-3.5 font-display font-bold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />{t('Enviando...', 'Sending...')}</>
                ) : t('Enviar enlace →', 'Send link →')}
              </button>
              <div className="text-center">
                <Link href="/login" className="font-mono-jb text-[11px] tracking-wider uppercase text-zinc-500 hover:text-white transition">
                  ← {t('Volver al login', 'Back to sign in')}
                </Link>
              </div>
            </form>
          )}
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
