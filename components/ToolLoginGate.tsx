'use client';

import { useLang } from '@/components/LangProvider';

/**
 * Shared "soft gate" for logged-out visitors on protected tool pages (2026-07-04, audit E2).
 *
 * Before this, most of these pages (coach, analytics, calendar, best-time, retention,
 * predictor, subscribers) just showed a one-line "Sign in to use this" message — a dead end
 * that gave a cold visitor no reason to actually sign up. /research and /competitors already
 * had a richer pattern (hero + 3 value bullets + CTA); this component generalizes that pattern
 * so every tool page sells itself before asking for an account, instead of just gatekeeping.
 */

interface Bullet {
  /** Path under /public/icons/*.webp — never an emoji (see project_tool_icons_webp memory). */
  icon: string;
  title: { es: string; en: string };
  desc: { es: string; en: string };
}

interface ToolLoginGateProps {
  eyebrow: { es: string; en: string };
  title: { es: string; en: string };
  highlight: { es: string; en: string };
  description: { es: string; en: string };
  bullets: Bullet[];
  /** Link to the matching /features/* marketing page, which has deeper detail + screenshots. */
  featuresHref?: string;
  /** Accent color matching the tool's theme on its /features/* page. */
  color?: string;
}

export default function ToolLoginGate({ eyebrow, title, highlight, description, bullets, featuresHref, color = 'var(--yv-brand)' }: ToolLoginGateProps) {
  const lang = useLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <header className="border-b" style={{ borderColor: 'var(--line)', background: 'rgba(10,10,10,0.92)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="7 7 18 18" fill="none">
              <circle cx="16" cy="16" r="8" fill="#ee4d5e" />
            </svg>
            <span className="font-display font-bold text-[16px] tracking-tight">
              YTubViral<span style={{ color: 'var(--yv-brand)' }}>.</span>com
            </span>
          </a>
          <div className="flex items-center gap-3">
            <a href="/login" className="font-mono-jb text-[13px] tracking-wider hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
              {t('Iniciar sesión', 'Sign in')}
            </a>
            <a href="/signup" className="btn-offset px-4 py-1.5 text-[13px] font-display">
              {t('Crear cuenta gratis', 'Sign up free')}
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-6" style={{ color }}>
          {t(eyebrow.es, eyebrow.en)}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-5xl mb-6 leading-tight">
          {t(title.es, title.en)}
          <br />
          <span style={{ color: 'var(--yv-brand)' }}>{t(highlight.es, highlight.en)}</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
          {t(description.es, description.en)}
        </p>

        <div className="grid md:grid-cols-3 gap-5 mb-14 text-left">
          {bullets.map((b) => (
            <div key={b.title.es} className="yv-card p-5">
              <img src={b.icon} alt="" width={32} height={32} className="object-contain mb-3" />
              <h3 className="font-display font-bold text-sm mb-1">{t(b.title.es, b.title.en)}</h3>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>{t(b.desc.es, b.desc.en)}</p>
            </div>
          ))}
        </div>

        <a href="/signup" className="btn-offset inline-flex px-8 py-3 text-sm font-display">
          {t('Empieza gratis →', 'Start free →')}
        </a>
        <p className="text-[13px] mt-4" style={{ color: 'var(--yv-text-4)' }}>
          {t('Sin tarjeta de crédito. 10 generaciones/mes gratis.', 'No credit card. 10 generations/month free.')}
        </p>
        {featuresHref && (
          <p className="text-[13px] mt-6">
            <a href={featuresHref} className="underline hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
              {t('Ver todo lo que hace esta herramienta →', 'See everything this tool does →')}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
