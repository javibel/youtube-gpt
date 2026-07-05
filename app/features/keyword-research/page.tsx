import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerLang } from '@/lib/server-lang';
import RelatedTools from '@/components/RelatedTools';
import ComparisonCell from '@/components/ComparisonCell';


export const metadata: Metadata = {
  title: 'YouTube Keyword Research Tool — Free AI-Powered',
  description:
    'Find high-volume, low-competition YouTube keywords in seconds. Search volume, opportunity score, related terms, and trend data. Free, no credit card required.',
  alternates: { canonical: 'https://ytubviral.com/features/keyword-research' },
  openGraph: {
    title: 'YouTube Keyword Research Tool — Free AI-Powered',
    description: 'Find high-volume, low-competition YouTube keywords in seconds. Free, no credit card.',
    url: 'https://ytubviral.com/features/keyword-research',
    type: 'website',
    images: [{ url: '/og-keyword-research.webp', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube Keyword Research Tool — Free AI-Powered',
    description: 'Find high-volume, low-competition YouTube keywords in seconds. Search volume, opportunity score, related terms, and trend data. Free, no credit card required.',
    images: ['/og-keyword-research.webp'],
  },
};

const FAQ_ES = [
  { q: '¿La herramienta de keywords es realmente gratis?', a: 'Sí. Volumen de búsqueda, competencia, oportunidad y términos relacionados son 100% gratis sin tarjeta. Pro añade sugerencias de títulos con IA y analítica avanzada.' },
  { q: '¿Cómo se compara con otras herramientas de keywords?', a: 'YTubViral ofrece los mismos datos (volumen, competencia, oportunidad) más análisis con IA y clusters de keywords — todo en una interfaz web. Sin extensión, sin ralentizar el navegador. Y gratis frente a los $19+/mes habituales.' },
  { q: '¿Qué fuentes de datos usa?', a: 'Combinamos autocompletado de YouTube, estimaciones de volumen de búsqueda, análisis de competencia de vídeos existentes y señales de tendencias para calcular una puntuación de oportunidad.' },
  { q: '¿Funciona para YouTube Shorts?', a: 'Sí. La herramienta funciona para cualquier formato: vídeos largos, Shorts, podcasts y directos. Filtra por keywords en tendencia para encontrar temas ideales para Shorts.' },
  { q: '¿Cuántas búsquedas puedo hacer al día?', a: 'Las búsquedas de keywords son ilimitadas en el plan gratuito. Sin límites diarios.' },
];

const FAQ_EN = [
  { q: 'Is YTubViral keyword research really free?', a: 'Yes. Search volume, competition score, opportunity rating, and related terms are 100% free with no credit card. Pro adds AI title suggestions and deeper analytics.' },
  { q: 'How does it compare to other keyword tools?', a: 'YTubViral provides the same data (volume, competition, opportunity) plus AI analysis and keyword clusters — all in one web interface. No extension, no slowdowns. Free vs the usual $19+/month.' },
  { q: 'What data sources does it use?', a: 'We combine YouTube autocomplete, search volume estimates, competition analysis from existing videos, and trend signals to calculate an opportunity score for each keyword.' },
  { q: 'Can I use it for YouTube Shorts?', a: 'Absolutely. Works for any format — long-form, Shorts, podcasts, livestreams. Filter by trending keywords to find Shorts-friendly topics.' },
  { q: 'How many keywords can I research per day?', a: 'Free users get unlimited keyword searches. No daily caps on the core research tool.' },
];

export default async function KeywordResearchFeature() {
  const lang = getServerLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const features = [
    { title: t('Volumen de búsqueda', 'Search Volume'), desc: t('Búsquedas mensuales estimadas en YouTube. Conoce la demanda real antes de crear tu vídeo.', 'Estimated monthly searches on YouTube. Know exactly how much demand exists before you create.') },
    { title: t('Puntuación de competencia', 'Competition Score'), desc: t('Puntuación 0-100 de dificultad para posicionar. Baja competencia + alto volumen = tu mejor oportunidad.', 'A 0-100 score showing how hard it is to rank. Low competition + high volume = your best opportunities.') },
    { title: t('Rating de oportunidad', 'Opportunity Rating'), desc: t('Nuestra IA combina volumen, competencia y tendencias en una única puntuación: "¿debería hacer este vídeo?"', 'Our AI combines volume, competition, and trends into a single "should I make this video?" score.') },
    { title: t('Keywords relacionadas', 'Related Keywords'), desc: t('Descubre clusters de keywords y variaciones long-tail que no habías pensado. Expande tu estrategia.', 'Discover keyword clusters and long-tail variations. Expand your content strategy.') },
    { title: t('Dirección de tendencia', 'Trend Direction'), desc: t('Mira si una keyword sube, se mantiene o baja. No inviertas en temas que mueren.', 'See if a keyword is rising, stable, or declining. Don\'t invest in dying topics.') },
    { title: t('Vídeos mejor posicionados', 'Top Ranking Videos'), desc: t('Mira quién ya posiciona para esa keyword, sus vistas y contra qué compites.', 'See who ranks for this keyword, their view counts, and what you\'re up against.') },
  ];

  const steps = [
    { step: '1', title: t('Escribe una keyword o tema', 'Enter a keyword or topic'), desc: t('Cualquier palabra, frase o idea. Funciona en español, inglés y la mayoría de idiomas.', 'Any word, phrase, or topic idea. Works in English, Spanish, and most languages.') },
    { step: '2', title: t('Obtén datos al instante', 'Get instant data'), desc: t('En menos de 3 segundos: volumen, competencia, oportunidad y +10 keywords relacionadas.', 'In under 3 seconds: volume, competition, opportunity score, and 10+ related keywords.') },
    { step: '3', title: t('Encuentra tus mejores oportunidades', 'Find your best opportunities'), desc: t('Ordena por oportunidad para encontrar keywords con alta demanda y baja competencia — tu vía rápida a las vistas.', 'Sort by opportunity to find keywords where demand is high but competition is low — your fast lane to views.') },
  ];

  const comparison = [
    [t('Volumen de búsqueda', 'Search volume'), '✓', '✓', '✓'],
    [t('Puntuación de competencia', 'Competition score'), '✓', '✓', '✓'],
    [t('Rating de oportunidad (IA)', 'Opportunity rating (AI)'), '✓', '✗', '✗'],
    [t('Clusters de keywords', 'Related keyword clusters'), '✓', t('Limitado', 'Limited'), '✓'],
    [t('Dirección de tendencia', 'Trend direction'), '✓', '✓', '✗'],
    [t('Sin extensión necesaria', 'No extension required'), '✓', '✗', '✗'],
    [t('Sin ralentizar el navegador', 'No browser slowdown'), '✓', '✗', '✗'],
    [t('Tier gratuito', 'Free tier'), t('Ilimitado', 'Unlimited'), '3/day', '2/day'],
    [t('Precio (acceso completo)', 'Price (full access)'), '€9.99/mo', '$19/mo', '$9.99/mo'],
  ];

  const audiences = [
    { title: t('Nuevos creadores (0-1K subs)', 'New creators (0-1K subs)'), desc: t('Encuentra keywords de baja competencia donde puedas posicionar. Deja de competir con canales 10x más grandes.', 'Find low-competition keywords where you can actually rank. Stop competing with channels 10x your size.') },
    { title: t('Canales en crecimiento (1K-100K)', 'Growing channels (1K-100K)'), desc: t('Descubre huecos de contenido en tu nicho. Encuentra temas que tu competencia pasó por alto.', 'Discover content gaps in your niche. Find topics your competitors missed.') },
    { title: t('Canales faceless/automatización', 'Faceless/automation channels'), desc: t('Investiga keywords a escala para estrategias de alto volumen. Encuentra temas probados antes de invertir en producción.', 'Research keywords at scale. Find proven topics before investing in production.') },
    { title: t('Agencias y consultores', 'Agencies & consultants'), desc: t('Investiga keywords para múltiples clientes desde un dashboard. Exporta datos y crea calendarios basados en demanda real.', 'Research for multiple clients from one dashboard. Build content calendars based on real demand.') },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00D9FF' }}>
          {t('HERRAMIENTA GRATUITA', 'FREE TOOL')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Keyword Research para YouTube', 'YouTube Keyword Research')}<br />
          <span style={{ color: 'var(--red)' }}>{t('con inteligencia artificial', 'powered by AI')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('Encuentra las keywords que tu audiencia busca. Volumen, competencia, oportunidad y términos relacionados — todo en un sitio, completamente gratis.',
            'Find the keywords your audience is searching for. Volume, competition, opportunity, and related terms — all in one place, completely free.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            {t('Empieza gratis', 'Start researching — free')}
          </Link>
          <Link href="/research" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            {t('Probar la herramienta', 'Try the tool')}
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('Qué obtienes con cada búsqueda', 'What you get with every search')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{f.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('Cómo funciona', 'How it works')}
        </h2>
        <div className="space-y-8">
          {steps.map((s) => (
            <div key={s.step} className="flex gap-5 items-start">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-lg" style={{ background: 'var(--red)', color: 'white' }}>{s.step}</div>
              <div>
                <h3 className="font-display font-bold text-lg mb-1">{s.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          {t('YTubViral vs otras herramientas de keywords', 'YTubViral vs other keyword tools')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">{t('Característica', 'Feature')}</th>
                <th className="py-3 px-4 font-display font-bold text-center" style={{ color: 'var(--red)' }}>YTubViral</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">{t('Alternativa A', 'Alternative A')}</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">{t('Alternativa B', 'Alternative B')}</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {comparison.map(([feat, ytub, vidiq, tube]) => (
                <tr key={feat} className="border-b border-white/5">
                  <td className="py-2.5 px-4">{feat}</td>
                  <td className="py-2.5 px-4 text-center text-white font-medium"><ComparisonCell value={ytub} /></td>
                  <td className="py-2.5 px-4 text-center"><ComparisonCell value={vidiq} /></td>
                  <td className="py-2.5 px-4 text-center"><ComparisonCell value={tube} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          {t('¿Para quién es?', 'Who is this for?')}
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {audiences.map((u) => (
            <div key={u.title} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{u.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{u.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          {t('Preguntas frecuentes', 'Frequently asked questions')}
        </h2>
        <div className="space-y-6">
          {FAQ.map((item) => (
            <div key={item.q} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{item.q}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <RelatedTools slug="keyword-research" lang={lang} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ_ES.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'YTubViral — Keyword Research',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/keyword-research',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">
          {t('¿Listo para encontrar tu próximo tema viral?', 'Ready to find your next viral topic?')}
        </h2>
        <p className="text-zinc-400 mb-8">{t('Gratis para siempre. Sin tarjeta. Empieza en 10 segundos.', 'Free forever. No credit card. Start in 10 seconds.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          {t('Empezar keyword research — gratis', 'Start keyword research — free')}
        </Link>
      </section>
    </div>
  );
}
