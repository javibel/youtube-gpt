import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { GEAR_ITEMS, GEAR_CATEGORIES, TIER_LABELS, TIER_COLORS, AMAZON_TAGS, type Lang } from '@/lib/gear-data';

export const metadata: Metadata = {
  title: 'Equipo para YouTubers — YTubViral | Las mejores herramientas para crear contenido',
  description:
    'Guía completa del mejor equipo para YouTube: cámaras, micrófonos, iluminación, accesorios y software. Recomendaciones reales por nivel y presupuesto.',
  alternates: { canonical: 'https://ytubviral.com/gear' },
  openGraph: {
    title: 'Equipo para YouTubers — YTubViral',
    description: 'Cámaras, micrófonos, luces y más. Recomendaciones por nivel.',
    url: 'https://ytubviral.com/gear',
    type: 'website',
  },
};

function buildAffiliateUrl(baseUrl: string, tag: string): string {
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}tag=${tag}`;
}

export default async function GearPage() {
  const cookieStore = await cookies();
  const lang: Lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2" />
              <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020" />
            </svg>
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

      {/* ── Hero ── */}
      <section className="border-b border-white/10 relative overflow-hidden">
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

          {/* Category pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            {GEAR_CATEGORIES.map(cat => (
              <a
                key={cat.key}
                href={`#${cat.key}`}
                className="soft-chip px-4 py-1.5 font-mono-jb text-[13px] tracking-wider uppercase text-zinc-400 hover:text-white transition"
                style={{ borderColor: cat.color + '33' }}
              >
                <span className="mr-1.5">{cat.icon}</span>
                {cat.name[lang]}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Affiliate disclosure ── */}
      <div className="max-w-7xl mx-auto px-6 pt-8">
        <p className="text-zinc-600 text-[13px] font-mono-jb border border-white/5 rounded-lg px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
          {t(
            '* Esta página contiene enlaces de afiliados. Si compras a través de ellos, recibimos una pequeña comisión sin coste adicional para ti. Esto nos ayuda a mantener YTubViral gratuito.',
            '* This page contains affiliate links. If you buy through them, we receive a small commission at no extra cost to you. This helps us keep YTubViral free.'
          )}
        </p>
      </div>

      {/* ── Categories & Products ── */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {GEAR_CATEGORIES.map(cat => {
          const items = GEAR_ITEMS.filter(item => item.category === cat.key);
          if (items.length === 0) return null;

          return (
            <section key={cat.key} id={cat.key} className="mb-16 scroll-mt-24">
              {/* Category header */}
              <div className="flex items-center gap-3 mb-8">
                <span className="text-3xl">{cat.icon}</span>
                <div>
                  <h2 className="font-display font-bold text-2xl md:text-3xl text-white">
                    {cat.name[lang]}
                  </h2>
                  <div className="w-12 h-0.5 mt-2" style={{ background: cat.color }} />
                </div>
              </div>

              {/* Product grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {items.map(item => {
                  const tierLabel = TIER_LABELS[item.tier]?.[lang] ?? item.tier;
                  const tierColor = TIER_COLORS[item.tier] ?? '#888';
                  const url = buildAffiliateUrl(item.amazonUrl[lang], AMAZON_TAGS[lang]);

                  return (
                    <div
                      key={item.id}
                      className="group relative rounded-xl border border-white/10 hover:border-white/20 transition-all overflow-hidden"
                      style={{ background: 'rgba(255,255,255,0.02)' }}
                    >
                      {/* Recommended badge */}
                      {item.recommended && (
                        <div
                          className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-md font-mono-jb text-[13px] tracking-wider uppercase font-bold"
                          style={{ background: 'rgba(232,77,91,0.15)', color: '#e84d5b', border: '1px solid rgba(232,77,91,0.3)' }}
                        >
                          {t('Recomendado', 'Recommended')}
                        </div>
                      )}

                      {/* Product image */}
                      {item.image && (
                        <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="block">
                          <div className="h-48 relative p-6 overflow-hidden rounded-t-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <Image
                              src={item.image}
                              alt={item.name[lang]}
                              fill
                              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                              className="object-contain group-hover:scale-105 transition-transform duration-300 p-4"
                            />
                          </div>
                        </a>
                      )}

                      <div className="p-6">
                        {/* Tier + Price */}
                        <div className="flex items-center justify-between mb-3">
                          <span
                            className="font-mono-jb text-[13px] tracking-wider uppercase px-2 py-0.5 rounded border"
                            style={{ color: tierColor, borderColor: tierColor + '44', background: tierColor + '11' }}
                          >
                            {tierLabel}
                          </span>
                          <span className="font-mono-jb text-sm text-zinc-400 font-medium">
                            {item.priceRange}
                          </span>
                        </div>

                        {/* Name */}
                        <h3 className="font-display font-bold text-lg text-white mb-2">
                          {item.name[lang]}
                        </h3>

                        {/* Description */}
                        <p className="text-zinc-500 text-sm font-mono-jb leading-relaxed mb-5">
                          {item.description[lang]}
                        </p>

                        {/* CTA */}
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-center gap-2 font-mono-jb text-[13px] tracking-wider px-5 py-2.5 rounded-lg transition-all hover:scale-[1.02]"
                          style={{
                            background: `${cat.color}15`,
                            color: cat.color,
                            border: `1px solid ${cat.color}33`,
                          }}
                        >
                          {t('Ver en Amazon', 'View on Amazon')}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M7 17L17 7M17 7H7M17 7v10" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── CTA section ── */}
      <section className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-20 text-center">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--red)' }}>
            {t('CREA CONTENIDO PROFESIONAL', 'CREATE PROFESSIONAL CONTENT')}
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-white mb-4">
            {t(
              'El equipo importa, pero el contenido importa más.',
              'Gear matters, but content matters more.'
            )}
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

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 py-8">
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
