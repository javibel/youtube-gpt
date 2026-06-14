'use client';

import { useState, useEffect } from 'react';

// Chrome Web Store listing for the YTubViral extension
const CWS_URL = 'https://chromewebstore.google.com/detail/ytubviral-para-youtube/gkjecjfhdmfbhhcemcjdkjkcdbljkcfh';

// Install CTA for high-intent public pages (free tools, blog). Renders NOTHING if the extension
// is already installed (detect.js sets data-ytv-ext on <html>) — no clutter for existing users.
// (G2 quick win: the install CTA used to live only in the dashboard/login area.)
export default function ExtensionInstallBanner({ lang }: { lang: 'es' | 'en' }) {
  const [installed, setInstalled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const check = () => document.documentElement.getAttribute('data-ytv-ext') === '1';
    if (check()) { setInstalled(true); setReady(true); return; }
    const timer = setTimeout(() => { setInstalled(check()); setReady(true); }, 600);
    return () => clearTimeout(timer);
  }, []);

  if (!ready || installed) return null;

  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  return (
    <div
      className="flex flex-col sm:flex-row items-center gap-4 rounded-xl px-5 py-4 my-8 max-w-3xl mx-auto"
      style={{ background: 'rgba(232,77,91,0.06)', border: '1px solid rgba(232,77,91,0.22)' }}
    >
      <div className="flex-1 text-center sm:text-left">
        <p className="font-display font-bold text-white text-[15px] mb-0.5">
          {t('Consíguelo en CADA vídeo de YouTube', 'Get this on EVERY YouTube video')}
        </p>
        <p className="font-mono-jb text-[12.5px]" style={{ color: 'var(--yv-text-3)' }}>
          {t('Extensión gratis de Chrome: SEO Score, VPH, keywords y análisis de competidores mientras navegas YouTube y Studio.',
             'Free Chrome extension: SEO Score, VPH, keywords and competitor analysis while you browse YouTube and Studio.')}
        </p>
      </div>
      <a
        href={CWS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-offset shrink-0 inline-flex items-center gap-2 px-6 py-3 text-sm font-display font-bold whitespace-nowrap"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
        </svg>
        {t('Añadir a Chrome', 'Add to Chrome')}
      </a>
    </div>
  );
}
