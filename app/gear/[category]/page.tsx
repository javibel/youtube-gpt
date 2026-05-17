import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  GEAR_ITEMS, GEAR_CATEGORIES, ACCESSIBILITY_SUBCATEGORIES,
  ALL_GEAR_SLUGS, getCategoryBySlug, getItemsForSlug,
  TIER_LABELS, TIER_COLORS, AMAZON_TAGS, type Lang,
} from '@/lib/gear-data';

export function generateStaticParams() {
  return ALL_GEAR_SLUGS.map(category => ({ category }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const cat = getCategoryBySlug(category);
  if (!cat) return {};

  const title = `${cat.name.es} para YouTubers — YTubViral`;
  const description = `Las mejores ${cat.name.es.toLowerCase()} recomendadas para creadores de contenido. Comparativas y enlaces a Amazon.`;

  return {
    title,
    description,
    alternates: { canonical: `https://ytubviral.com/gear/${category}` },
    openGraph: { title, description, url: `https://ytubviral.com/gear/${category}`, type: 'website' },
  };
}

function buildAffiliateUrl(baseUrl: string, tag: string): string {
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}tag=${tag}`;
}

export default async function GearCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = getCategoryBySlug(category);
  if (!cat) notFound();

  const cookieStore = await cookies();
  const lang: Lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const items = getItemsForSlug(category);
  const isAccessibilityParent = category === 'accessibility';

  // JSON-LD for SEO
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: cat.name[lang],
    description: `${cat.name[lang]} — ${t('equipo recomendado para creadores', 'recommended gear for creators')}`,
    url: `https://ytubviral.com/gear/${category}`,
    isPartOf: { '@type': 'WebSite', name: 'YTubViral', url: 'https://ytubviral.com' },
  };

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="7 7 18 18" fill="none"><circle cx="16" cy="16" r="8" fill="#ee4d5e"/></svg>
            <span className="font-display font-bold text-[17px] tracking-tight">
              YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/gear" className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-400 hover:text-white transition">
              {t('← Equipo', '← Gear')}
            </Link>
            <Link href="/signup" className="btn-offset px-4 py-2 text-[13px] font-display">
              {t('Empezar gratis', 'Get started free')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="border-b border-white/10 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 40% 0%, ${cat.color}1A, transparent 60%)` }} />
        <div className="relative max-w-7xl mx-auto px-6 py-16 md:py-20">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 mb-6 font-mono-jb text-[13px] text-zinc-500">
            <Link href="/gear" className="hover:text-white transition">{t('Equipo', 'Gear')}</Link>
            <span>/</span>
            <span style={{ color: cat.color }}>{cat.name[lang]}</span>
          </nav>
          <div className="flex items-center gap-4">
            <span className="text-4xl">{cat.icon}</span>
            <div>
              <h1 className="font-display font-bold text-3xl md:text-4xl text-white">{cat.name[lang]}</h1>
              <div className="w-12 h-0.5 mt-3" style={{ background: cat.color }} />
            </div>
          </div>
          <p className="text-zinc-400 text-lg mt-4 max-w-xl">
            {t(
              `${items.length} productos recomendados por nuestro equipo.`,
              `${items.length} products recommended by our team.`
            )}
          </p>
        </div>
      </section>

      {/* Subcategory links for accessibility parent */}
      {isAccessibilityParent && (
        <div className="max-w-7xl mx-auto px-6 pt-10">
          <h2 className="font-display font-bold text-xl mb-5 text-white">
            {t('Explora por tipo', 'Browse by type')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
            {ACCESSIBILITY_SUBCATEGORIES.map(sub => {
              const count = GEAR_ITEMS.filter(i => i.subcategory === sub.key).length;
              return (
                <Link
                  key={sub.key}
                  href={`/gear/${sub.key}`}
                  className="group border border-white/10 hover:border-white/20 rounded-xl p-4 text-center transition-all"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <span className="text-2xl block mb-2">{sub.icon}</span>
                  <span className="font-display font-bold text-sm text-white group-hover:text-zinc-100">
                    {sub.name[lang]}
                  </span>
                  <span className="block font-mono-jb text-[11px] text-zinc-500 mt-1">
                    {count} {t('productos', 'products')}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Affiliate disclosure */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <p className="text-zinc-600 text-[13px] font-mono-jb border border-white/5 rounded-lg px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
          {t(
            '* Esta página contiene enlaces de afiliados. Si compras a través de ellos, recibimos una pequeña comisión sin coste adicional para ti.',
            '* This page contains affiliate links. If you buy through them, we receive a small commission at no extra cost to you.'
          )}
        </p>
      </div>

      {/* Products grid */}
      <div className="max-w-7xl mx-auto px-6 py-10">
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
                {item.recommended && (
                  <div
                    className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-md font-mono-jb text-[13px] tracking-wider uppercase font-bold"
                    style={{ background: 'rgba(232,77,91,0.15)', color: '#e84d5b', border: '1px solid rgba(232,77,91,0.3)' }}
                  >
                    {t('Recomendado', 'Recommended')}
                  </div>
                )}

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
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="font-mono-jb text-[13px] tracking-wider uppercase px-2 py-0.5 rounded border"
                      style={{ color: tierColor, borderColor: tierColor + '44', background: tierColor + '11' }}
                    >
                      {tierLabel}
                    </span>
                    <span className="font-mono-jb text-sm text-zinc-400 font-medium">{item.priceRange}</span>
                  </div>
                  <h3 className="font-display font-bold text-lg text-white mb-2">{item.name[lang]}</h3>
                  <p className="text-zinc-500 text-sm font-mono-jb leading-relaxed mb-5">{item.description[lang]}</p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-2 font-mono-jb text-[13px] tracking-wider px-5 py-2.5 rounded-lg transition-all hover:scale-[1.02]"
                    style={{ background: `${cat.color}15`, color: cat.color, border: `1px solid ${cat.color}33` }}
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
      </div>

      {/* CTA */}
      <section className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <h2 className="font-display font-bold text-2xl md:text-3xl text-white mb-4">
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
