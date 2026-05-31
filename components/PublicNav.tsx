'use client';

import { useLang } from '@/components/LangProvider';

export default function PublicNav() {
  const lang = useLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--yv-border)' }}>
      <div className="flex items-center gap-6">
        <a href="/" className="font-display font-bold text-lg text-white">YTubViral</a>
        <div className="hidden sm:flex items-center gap-4">
          <a href="/tools" className="font-mono-jb text-[13px] transition" style={{ color: 'var(--yv-text-3)' }}>
            {t('Herramientas', 'Tools')}
          </a>
          <a href="/trends" className="font-mono-jb text-[13px] transition" style={{ color: 'var(--yv-text-3)' }}>
            Trending
          </a>
          <a href="/seo-score" className="font-mono-jb text-[13px] transition" style={{ color: 'var(--yv-text-3)' }}>
            SEO Score
          </a>
          <a href="/blog" className="font-mono-jb text-[13px] transition" style={{ color: 'var(--yv-text-3)' }}>
            Blog
          </a>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <a href="/login" className="font-mono-jb text-[13px] px-3 py-1.5 transition" style={{ color: 'var(--yv-text-2)' }}>
          {t('Entrar', 'Sign in')}
        </a>
        <a href="/signup" className="font-mono-jb text-[13px] px-4 py-1.5 rounded-lg transition font-medium" style={{ background: '#e84d5b', color: '#fff' }}>
          {t('Gratis', 'Free')}
        </a>
      </div>
    </nav>
  );
}
