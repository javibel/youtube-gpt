'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RocketIcon } from '@/components/icons';

// Secondary, dismissible launch-waitlist announcement (J2). Normal-flow strip at the top of the
// landing — promotes the Product Hunt launch list without competing with the hero's signup CTA.
// Links to /launch (full capture form). Dismissal persists in localStorage.
export default function LaunchBanner({ lang }: { lang: 'es' | 'en' }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('ytv_launch_banner_off') !== '1') setShow(true);
    } catch { setShow(true); }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem('ytv_launch_banner_off', '1'); } catch { /* noop */ }
    setShow(false);
  };

  return (
    <div
      className="relative flex items-center justify-center gap-3 px-10 py-2 text-center"
      style={{ background: 'rgba(232,77,91,0.12)', borderBottom: '1px solid rgba(232,77,91,0.25)' }}
    >
      <p className="font-mono-jb text-[12px] sm:text-[13px] inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
        <span aria-hidden><RocketIcon size={13} /></span>
        {lang === 'en'
          ? 'Launching soon on Product Hunt — join the list for an early-bird perk on launch day'
          : 'Lanzamos pronto en Product Hunt — apúntate y consigue una ventaja early-bird el día del lanzamiento'}{' '}
        <Link href="/launch?ref=landing-banner" className="font-bold underline whitespace-nowrap" style={{ color: 'var(--red)' }}>
          {lang === 'en' ? 'Join →' : 'Apuntarme →'}
        </Link>
      </p>
      <button
        onClick={dismiss}
        aria-label={lang === 'en' ? 'Dismiss' : 'Cerrar'}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition"
        style={{ color: 'var(--yv-text-3)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  );
}
