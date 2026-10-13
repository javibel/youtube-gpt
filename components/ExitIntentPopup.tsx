'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import WaitlistRequestForm from '@/components/WaitlistRequestForm';
import { RocketIcon } from '@/components/icons';

export default function ExitIntentPopup({ lang }: { lang: 'es' | 'en' }) {
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const [show, setShow] = useState(false), [dismissed, setDismissed] = useState(false);
  const visible = useRef(false);
  const shown = () => { try { return !!sessionStorage.getItem('ytv_exit_shown'); } catch { return false; } };
  const handleMouseLeave = useCallback((e: MouseEvent) => {
    if (e.clientY > 5 || dismissed || shown()) return;
    // Session storage only suppresses this popup; it never recovers a request.
    try { sessionStorage.setItem('ytv_exit_shown', '1'); } catch { /* Optional display preference. */ }
    visible.current = true; setShow(true);
  }, [dismissed]);
  useEffect(() => {
    if (shown()) return;
    const timer = setTimeout(() => document.addEventListener('mouseleave', handleMouseLeave), 5000);
    return () => { clearTimeout(timer); document.removeEventListener('mouseleave', handleMouseLeave); };
  }, [handleMouseLeave]);
  const handleDismiss = () => { visible.current = false; setShow(false); setDismissed(true); };
  if (!show) return null;
  return <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} onClick={handleDismiss}>
    <div role="dialog" aria-modal="true" aria-label={t('Lista de lanzamiento', 'Launch list')}
      className="relative w-full max-w-md rounded-2xl p-8 text-center"
      style={{ background: '#111', border: '1px solid rgba(232,77,91,0.3)', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}
      onClick={e => e.stopPropagation()}>
      <button type="button" onClick={handleDismiss} className="absolute top-4 right-4 text-zinc-500 hover:text-white"
        aria-label={t('Cerrar', 'Close')}>×</button>
      <span className="inline-flex items-center justify-center rounded-full mb-2"
        style={{ width: 56, height: 56, background: 'rgba(232,77,91,0.12)', color: 'var(--red)' }}><RocketIcon size={26} /></span>
      <p className="font-mono-jb text-[12px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
        {t('ANTES DE IRTE', 'BEFORE YOU GO')}</p>
      <h3 className="font-display font-bold text-xl text-white mb-3">{t('Entra en la lista de lanzamiento', 'Join the launch list')}</h3>
      <p className="font-mono-jb text-[13px] leading-relaxed mb-5" style={{ color: 'var(--yv-text-3)' }}>
        {t('Solicita información del lanzamiento. Solo tu email — sin crear cuenta.', 'Request launch information. Just your email — no account needed.')}
      </p>
      <WaitlistRequestForm lang={lang} variant="popup" isActive={() => visible.current} />
      <p className="mt-4 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-4)' }}>
        <a href="/signup" className="underline hover:text-white">{t('O crea tu cuenta gratis →', 'Or create a free account →')}</a>
      </p>
    </div>
  </div>;
}
