import type { Metadata } from 'next';
import Link from 'next/link';
import { GEAR_ITEMS, GEAR_CATEGORIES, ACCESSIBILITY_SUBCATEGORIES, type Lang } from '@/lib/gear-data';
import { getServerLang } from '@/lib/server-lang';

export const metadata: Metadata = {
  title: 'Equipo Recomendado para YouTubers',
  description:
    'Guía completa del mejor equipo para YouTube: cámaras, micrófonos, iluminación, accesorios, software y herramientas de accesibilidad recomendadas por nivel.',
  alternates: { canonical: 'https://ytubviral.com/gear' },
  openGraph: {
    title: 'Equipo Recomendado para YouTubers',
    description: 'Cámaras, micrófonos, luces y más. Recomendaciones por nivel.',
    url: 'https://ytubviral.com/gear',
    type: 'website',
    images: [{ url: '/og-gear.webp', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Equipo Recomendado para YouTubers',
    description: 'Guía completa del mejor equipo para YouTube: cámaras, micrófonos, iluminación, accesorios, software y herramientas de accesibilidad recomendadas por nivel.',
    images: ['/og-gear.webp'],
  },
};

export default async function GearPage() {
  const lang = getServerLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('Equipo para YouTubers', 'Gear for YouTubers'),
    description: t('Guía completa del mejor equipo para YouTube', 'Complete guide to the best gear for YouTube'),
    url: 'https://ytubviral.com/gear',
    isPartOf: { '@type': 'WebSite', name: 'YTubViral', url: 'https://ytubviral.com' },
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl" style={{ background: 'rgba(12,10,15,0.72)', boxShadow: 'inset 0 -1px 0 rgba(255,255,255,.08)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="7 7 18 18" fill="none"><circle cx="16" cy="16" r="8" fill="#e84d5b"/></svg>
            <span className="font-display font-bold text-[17px] tracking-tight">
              YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/blog" className="hidden md:block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-400 hover:text-white transition">
              Blog
            </Link>
            <Link href="/" className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-400 hover:text-white transition">
              {t('Inicio', 'Home')}
            </Link>
            <Link href="/signup" className="btn-offset px-4 py-2 text-[13px] font-display">
              {t('Empezar gratis', 'Get started free')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 40% 0%, rgba(232,77,91,0.12), transparent 60%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--red)' }}>
            {t('EQUIPO RECOMENDADO', 'RECOMMENDED GEAR')}
          </p>
          <h1 className="font-display font-bold leading-[0.95] max-w-3xl" style={{ fontSize: 'clamp(36px,6vw,72px)' }}>
            {lang === 'en'
              ? <>The gear you need<br />to <span style={{ color: 'var(--red)' }}>create better.</span></>
              : <>El equipo que necesitas<br />para <span style={{ color: 'var(--red)' }}>crear mejor.</span></>}
          </h1>
          <p className="text-zinc-400 text-lg mt-6 max-w-xl">
            {t(
              'Recomendaciones honestas por nivel y presupuesto. Sin relleno, solo lo que realmente merece la pena.',
              'Honest recommendations by level and budget. No fluff, only what\'s truly worth it.'
            )}
          </p>
        </div>
      </section>

      {/* Affiliate disclosure */}
      <div className="max-w-7xl mx-auto px-6 pt-8">
        <p className="yv-glass text-zinc-600 text-[13px] font-mono-jb px-4 py-3">
          {t(
            '* Esta página contiene enlaces de afiliados. Si compras a través de ellos, recibimos una pequeña comisión sin coste adicional para ti. Esto nos ayuda a mantener YTubViral gratuito.',
            '* This page contains affiliate links. If you buy through them, we receive a small commission at no extra cost to you. This helps us keep YTubViral free.'
          )}
        </p>
      </div>

      {/* Category grid */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h2 className="font-display font-bold text-2xl mb-8 text-white">
          {t('Categorías', 'Categories')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {GEAR_CATEGORIES.map(cat => {
            const count = cat.key === 'accessibility'
              ? GEAR_ITEMS.filter(i => i.category === 'accessibility').length
              : GEAR_ITEMS.filter(i => i.category === cat.key).length;

            return (
              <Link
                key={cat.key}
                href={`/gear/${cat.key}`}
                className="yv-glass yv-glass--hover group relative p-8 transition-all overflow-hidden"
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `radial-gradient(ellipse at 50% 100%, ${cat.color}12, transparent 70%)` }} />
                <div className="relative">
                  <span className="text-4xl block mb-4">{cat.icon}</span>
                  <h3 className="font-display font-bold text-xl text-white mb-2">{cat.name[lang]}</h3>
                  <p className="font-mono-jb text-[13px] text-zinc-500">
                    {count} {t('productos', 'products')}
                  </p>
                  <div className="w-8 h-0.5 mt-4" style={{ background: cat.color }} />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Accessibility subcategories */}
        <h2 className="font-display font-bold text-2xl mt-16 mb-4 text-white">
          {t('Accesibilidad y Confort', 'Accessibility & Comfort')}
        </h2>
        <p className="text-zinc-400 mb-8 max-w-2xl">
          {t(
            'Herramientas diseñadas para creadores neurodivergentes y cualquier persona que busque optimizar su confort durante sesiones creativas.',
            'Tools designed for neurodivergent creators and anyone looking to optimize comfort during creative sessions.'
          )}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {ACCESSIBILITY_SUBCATEGORIES.map(sub => {
            const count = GEAR_ITEMS.filter(i => i.subcategory === sub.key).length;
            return (
              <Link
                key={sub.key}
                href={`/gear/${sub.key}`}
                className="yv-glass yv-glass--hover group p-5 text-center transition-all"
              >
                <span className="text-3xl block mb-3">{sub.icon}</span>
                <span className="font-display font-bold text-sm text-white block">{sub.name[lang]}</span>
                <span className="font-mono-jb text-[11px] text-zinc-500 mt-1 block">
                  {count} {t('productos', 'products')}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <section>
        <div className="max-w-7xl mx-auto px-6 py-20 text-center">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--red)' }}>
            {t('CREA CONTENIDO PROFESIONAL', 'CREATE PROFESSIONAL CONTENT')}
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-white mb-4">
            {t('El equipo importa, pero el contenido importa más.', 'Gear matters, but content matters more.')}
          </h2>
          <p className="text-zinc-500 max-w-lg mx-auto mb-8">
            {t(
              'Genera títulos, descripciones y scripts optimizados con IA. Empieza gratis.',
              'Generate optimized titles, descriptions and scripts with AI. Start free.'
            )}
          </p>
          <Link href="/signup" className="btn-offset inline-flex px-8 py-3 text-sm font-display">
            {t('Empezar gratis', 'Get started free')}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }}>
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-zinc-600 font-mono-jb text-[13px]">
          <span>&copy; {new Date().getFullYear()} YTubViral.com</span>
          <div className="flex gap-4">
            <Link href="/blog" className="hover:text-white transition">Blog</Link>
            <Link href="/terms" className="hover:text-white transition">{t('Términos', 'Terms')}</Link>
            <Link href="/privacy" className="hover:text-white transition">{t('Privacidad', 'Privacy')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
