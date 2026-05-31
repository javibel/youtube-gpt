'use client';

import { useState, useEffect, useCallback } from 'react';

export default function ExitIntentPopup({ lang }: { lang: 'es' | 'en' }) {
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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

        <div className="mb-4">
          <span className="inline-block text-4xl mb-2">🎯</span>
        </div>

        <p className="font-mono-jb text-[12px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
          {t('ANTES DE IRTE', 'BEFORE YOU GO')}
        </p>

        <h3 className="font-display font-bold text-xl text-white mb-3 leading-tight">
          {t(
            '¿Quieres generar títulos virales para ese vídeo?',
            'Want to generate viral titles for that video?'
          )}
        </h3>

        <p className="font-mono-jb text-[13px] leading-relaxed mb-6" style={{ color: 'var(--yv-text-3)' }}>
          {t(
            'Crea una cuenta gratis y genera títulos, descripciones y scripts optimizados con IA. 10 generaciones al mes, sin tarjeta.',
            'Create a free account and generate AI-optimized titles, descriptions, and scripts. 10 generations/month, no card needed.'
          )}
        </p>

        <a
          href="/signup"
          className="btn-offset inline-flex px-8 py-3.5 text-sm font-display font-bold"
        >
          {t('Crear cuenta gratis →', 'Create free account →')}
        </a>

        <p className="mt-4 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-4)' }}>
          {t('30 segundos. Sin spam.', '30 seconds. No spam.')}
        </p>
      </div>
    </div>
  );
}
