import type { Metadata } from 'next';
import PublicNav from '@/components/PublicNav';
import { NICHES } from '@/lib/niches-data';
import { getServerLang } from '@/lib/server-lang';

export const metadata: Metadata = {
  title: 'Ideas de títulos virales para YouTube por nicho | YTubViral',
  description:
    'Cientos de ideas de títulos virales para YouTube organizadas por nicho: gaming, cocina, fitness, finanzas y más. Gratis, sin registro.',
  alternates: { canonical: 'https://ytubviral.com/youtube-title-ideas' },
  openGraph: {
    title: 'Ideas de títulos virales para YouTube por nicho',
    description: 'Ideas de títulos listas para usar, organizadas por nicho. Gratis, sin registro.',
    url: 'https://ytubviral.com/youtube-title-ideas',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

const itemListLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Ideas de títulos de YouTube por nicho',
  itemListElement: NICHES.map((n, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: `Ideas de títulos para canales de ${n.name.es}`,
    url: `https://ytubviral.com/youtube-title-ideas/${n.slug}`,
  })),
};

export default function TitleIdeasHubPage() {
  const lang = getServerLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <PublicNav />

      <div className="max-w-4xl mx-auto px-6 py-16">
        <header className="text-center mb-14">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('IDEAS GRATIS', 'FREE IDEAS')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4">
            {t('Ideas de títulos virales para YouTube', 'Viral YouTube title ideas')}
          </h1>
          <p className="font-mono-jb text-sm max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Elige tu nicho y obtén decenas de ideas de títulos listas para usar, basadas en frameworks que funcionan. Gratis y sin registro.',
              'Pick your niche and get dozens of ready-to-use title ideas based on proven frameworks. Free and no signup.'
            )}
          </p>
        </header>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {NICHES.map(n => (
            <a
              key={n.slug}
              href={`/youtube-title-ideas/${n.slug}`}
              className="block p-4 rounded-xl transition hover:bg-white/[0.03]"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--yv-border)' }}
            >
              <span className="text-white text-sm font-display font-semibold capitalize">{lang === 'en' ? n.name.en : n.name.es}</span>
              <p className="font-mono-jb text-[12px] mt-1" style={{ color: 'var(--yv-text-4)' }}>
                {t('Ver ideas de títulos →', 'See title ideas →')}
              </p>
            </a>
          ))}
        </div>

        <div className="mt-14 text-center">
          <p className="font-mono-jb text-sm mb-4" style={{ color: 'var(--yv-text-3)' }}>
            {t('¿Quieres títulos a medida de tu vídeo, generados con IA?', 'Want titles tailored to your video, generated with AI?')}
          </p>
          <a href="/signup" className="btn-offset inline-flex px-8 py-3.5 text-sm font-display font-bold">
            {t('Crear cuenta gratis →', 'Create free account →')}
          </a>
        </div>
      </div>
    </div>
  );
}
