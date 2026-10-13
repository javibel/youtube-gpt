'use client';

import { useState, useEffect, useCallback } from 'react';
import { hasAcceptedWaitlistResponse } from '@/lib/waitlist-response';
import { CheckIcon, RocketIcon } from '@/components/icons';

export default function ExitIntentPopup({ lang }: { lang: 'es' | 'en' }) {
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleMouseLeave = useCallback((e: MouseEvent) => {
    if (e.clientY <= 5 && !dismissed) {
      // Only show once per session
      if (sessionStorage.getItem('ytv_exit_shown')) return;
      sessionStorage.setItem('ytv_exit_shown', '1');
      setShow(true);
    }
  }, [dismissed]);

  useEffect(() => {
    // Don't show if already dismissed or already shown this session
    if (sessionStorage.getItem('ytv_exit_shown')) return;
    // Wait 5 seconds before enabling (don't trigger on initial page load mouse movement)
    const timer = setTimeout(() => {
      document.addEventListener('mouseleave', handleMouseLeave);
    }, 5000);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseLeave]);

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || state === 'loading') return;
    setState('loading');
    try {
      // Attribute which free tool fed the list (e.g. "exit:/title-analyzer")
      let source = 'exit-popup';
      let referrer: string | null = null;
      try {
        source = 'exit:' + window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        referrer = params.get('utm_source') || document.referrer || null;
      } catch { /* noop */ }
      const res = await fetch('/api/waitlist', {
        method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source, referrer, lang }),
      });
      const data = await res.json();
      if (!hasAcceptedWaitlistResponse(res.status, data)) { setState('error'); return; }
      setState('done');
    } catch {
      setState('error');
    }
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={handleDismiss}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-8 text-center"
        style={{ background: '#111', border: '1px solid rgba(232,77,91,0.3)', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {state === 'done' ? (
          <>
            <span className="inline-flex items-center justify-center rounded-full mb-3" style={{ width: 56, height: 56, background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}><CheckIcon size={26} /></span>
            <h3 className="font-display font-bold text-xl text-white mb-2">
              {t('Solicitud recibida', 'Request received')}
            </h3>
            <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
              {t('Esto confirma tu solicitud, no la entrega de un correo.', 'This confirms your request, not email delivery.')}
            </p>
          </>
        ) : (
          <>
            <div className="mb-4">
              <span className="inline-flex items-center justify-center rounded-full mb-2" style={{ width: 56, height: 56, background: 'rgba(232,77,91,0.12)', color: 'var(--red)' }}><RocketIcon size={26} /></span>
            </div>

            <p className="font-mono-jb text-[12px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
              {t('ANTES DE IRTE', 'BEFORE YOU GO')}
            </p>

            <h3 className="font-display font-bold text-xl text-white mb-3 leading-tight">
              {t('Entra en la lista de lanzamiento', 'Join the launch list')}
            </h3>

            <p className="font-mono-jb text-[13px] leading-relaxed mb-5" style={{ color: 'var(--yv-text-3)' }}>
              {t(
                'Sé de los primeros en probarlo y consigue un descuento exclusivo de lanzamiento. Solo tu email — sin crear cuenta.',
                'Be among the first to try it and get an exclusive launch-day discount. Just your email — no account needed.'
              )}
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                aria-label={t('Correo electrónico', 'Email')}
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('tu@email.com', 'your@email.com')}
                required
                className="px-4 py-3 rounded-lg text-[15px] font-mono-jb"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', outline: 'none' }}
              />
              <button
                type="submit"
                disabled={state === 'loading'}
                className="btn-offset px-8 py-3.5 text-sm font-display font-bold disabled:opacity-50"
              >
                {state === 'loading'
                  ? t('Uniendo...', 'Joining...')
                  : t('Unirme a la lista →', 'Join the list →')}
              </button>
              {state === 'error' && (
                <p className="text-red-400 text-[13px]">
                  {t('Solicitud sin confirmar. Puede seguir pendiente.', 'Request unconfirmed. It may still be pending.')}
                </p>
              )}
            </form>

            <p className="mt-4 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-4)' }}>
              {t('Sin spam. ', 'No spam. ')}
              <a href="/signup" className="underline hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
                {t('O crea tu cuenta gratis →', 'Or create a free account →')}
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
