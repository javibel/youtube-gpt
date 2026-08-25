import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerLang } from '@/lib/server-lang';
import RelatedTools from '@/components/RelatedTools';
import ComparisonCell from '@/components/ComparisonCell';


export const metadata: Metadata = {
  title: 'YouTube SEO Score Checker — Analyze Any Video Free',
  description:
    'Get a 0-100 SEO score for any YouTube video in seconds. Actionable checklist for title, tags, description, and thumbnail optimization. Free tool.',
  alternates: { canonical: 'https://ytubviral.com/features/seo-score' },
  openGraph: {
    title: 'YouTube SEO Score Checker — Analyze Any Video Free',
    description: 'Get a 0-100 SEO score for any YouTube video. Free actionable optimization checklist.',
    url: 'https://ytubviral.com/features/seo-score',
    type: 'website',
    images: [{ url: '/og-seo-score.webp', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube SEO Score Checker — Analyze Any Video Free',
    description: 'Get a 0-100 SEO score for any YouTube video in seconds. Actionable checklist for title, tags, description, and thumbnail optimization. Free tool.',
    images: ['/og-seo-score.webp'],
  },
};

const FAQ_ES = [
  { q: '¿Cómo se calcula la puntuación SEO?', a: 'Analizamos más de 16 factores: keywords en título y descripción, coherencia keyword título-descripción, longitud, timestamps, tags, análisis visual del thumbnail con IA, engagement ajustado por categoría y más. Cada factor se pondera según su impacto demostrado en el ranking de YouTube.' },
  { q: '¿Puedo analizar cualquier vídeo o solo los míos?', a: 'Puedes analizar cualquier vídeo público de YouTube, tuyo o de la competencia. Solo pega la URL y obtendrás resultados al instante. Genial para hacer ingeniería inversa de lo que hacen bien los top creadores.' },
  { q: '¿En qué se diferencia de otros SEO scores?', a: 'La mayoría de herramientas necesitan una extensión de navegador y solo muestran puntuaciones mientras navegas por YouTube. YTubViral funciona desde cualquier dispositivo vía web, da un checklist más detallado con correcciones específicas e incluye sugerencias de mejora con IA.' },
  { q: '¿Una puntuación SEO alta garantiza más vistas?', a: 'La puntuación SEO mide lo bien optimizado que está tu vídeo para la búsqueda de YouTube. Mejora tus probabilidades de posicionar, pero las vistas también dependen del CTR, retención y demanda del tema. Recomendamos combinar SEO Score con nuestro Keyword Research.' },
  { q: '¿El checker de SEO es gratis?', a: 'Sí. El análisis de puntuación SEO es gratis sin límites. Los usuarios Pro obtienen sugerencias de mejora con IA y la posibilidad de guardar puntuaciones para seguir tu progreso de optimización.' },
];

const FAQ_EN = [
  { q: 'How is the SEO score calculated?', a: 'We analyze 16+ factors: title keywords, title-description keyword consistency, description front-loading, timestamps, tag relevance, AI-powered thumbnail visual analysis, category-adjusted engagement benchmarks, and more. Each factor is weighted by its proven impact on YouTube rankings.' },
  { q: 'Can I check any video or only my own?', a: 'You can analyze any public YouTube video — yours or your competitors\'. Just paste the URL and get instant results. Great for reverse-engineering what top creators do right.' },
  { q: 'What makes this different from other SEO scores?', a: 'Most tools require a browser extension and only show scores while browsing YouTube. YTubViral works from any device via web, gives a more detailed checklist with specific fixes, and includes AI-powered improvement suggestions.' },
  { q: 'Does a higher SEO score guarantee more views?', a: 'SEO score measures how well-optimized your video is for YouTube search. It improves your chances of ranking, but views also depend on CTR, retention, and topic demand. We recommend combining SEO Score with our Keyword Research tool.' },
  { q: 'Is the SEO checker free?', a: 'Yes. The SEO score analysis is free with no limits. Pro users get AI-powered improvement suggestions and the ability to save scores over time to track optimization progress.' },
];

export default async function SeoScoreFeature() {
  const lang = getServerLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const features = [
    { title: t('Optimización del título', 'Title optimization'), desc: t('Presencia de keywords, longitud, power words, gatillos emocionales y potencial de CTR de tu título.', 'Keyword presence, length, power words, emotional triggers, and CTR potential of your title.') },
    { title: t('Calidad de la descripción', 'Description quality'), desc: t('Primeros 200 caracteres, densidad de keywords, timestamps, enlaces, presencia de CTA y completitud general.', 'First 200 characters, keyword density, timestamps, links, CTA presence, and overall completeness.') },
    { title: t('Etiquetas y keywords', 'Tags & keywords'), desc: t('Número de etiquetas, relevancia con título/descripción, mix de keywords amplias y long-tail.', 'Number of tags, relevance to title/description, mix of broad and long-tail keywords.') },
    { title: t('Análisis visual del thumbnail (IA)', 'AI thumbnail analysis'), desc: t('Analizamos tu miniatura con IA: legibilidad del texto en móvil, contraste, presencia de caras/emociones y potencial de clic.', 'We analyze your thumbnail with AI: text readability on mobile, contrast, face/emotion presence, and click potential.') },
    { title: t('Métricas de engagement', 'Engagement metrics'), desc: t('Ratio de likes, tasa de comentarios y cómo se comparan con la media de vídeos en tu nicho.', 'Like ratio, comment rate, and how they compare to average videos in the same niche.') },
    { title: t('Autoridad del canal', 'Channel authority'), desc: t('Suscriptores, consistencia de subida y relevancia de nicho — factores que afectan tu poder de posicionamiento.', 'Subscriber count, upload consistency, and niche relevance — factors that affect ranking power.') },
  ];

  const steps = [
    { step: '1', title: t('Pega la URL de tu vídeo', 'Paste your video URL'), desc: t('Copia cualquier enlace de vídeo de YouTube y pégalo en la herramienta. Resultados en menos de 5 segundos.', 'Copy any YouTube video link and paste it into the tool. Results appear in under 5 seconds.') },
    { step: '2', title: t('Revisa tu puntuación y checklist', 'Review your score & checklist'), desc: t('Mira tu puntuación global (0-100) y un desglose detallado de qué funciona y qué necesita mejora.', 'See your overall score (0-100) and a detailed breakdown of what\'s working and what needs improvement.') },
    { step: '3', title: t('Corrige primero los items en rojo', 'Fix the red items first'), desc: t('Cada item del checklist tiene un código de color según su impacto. Corrige los rojos primero para máximo mejora con mínimo esfuerzo.', 'Each checklist item is color-coded by impact. Fix the red items first for maximum ranking improvement with minimum effort.') },
  ];

  const comparison = [
    [t('Puntuación SEO global', 'Overall SEO score'), t('✓ (0-100)', '✓ (0-100)'), t('✓ (0-100)', '✓ (0-100)'), '✗'],
    [t('Checklist detallado', 'Detailed checklist'), t('✓ (12 items)', '✓ (12 items)'), t('Básico', 'Basic'), '✗'],
    [t('Analizar cualquier vídeo', 'Analyze any video'), '✓', '✓', '✓'],
    [t('Sugerencias con IA', 'AI improvement tips'), t('✓ (Pro)', '✓ (Pro)'), '✗', '✗'],
    [t('Sin extensión necesaria', 'Works without extension'), '✓', '✗', '✗'],
    [t('Seguimiento de puntuación', 'Track score over time'), t('✓ (Pro)', '✓ (Pro)'), '✗', '✗'],
    [t('Análisis de competencia', 'Competitor video analysis'), '✓', '✓', t('Limitado', 'Limited')],
    [t('Tier gratuito', 'Free tier'), t('Ilimitado', 'Unlimited'), '3/day', 'N/A'],
    [t('Precio', 'Price'), '€9.99/mo', '$19/mo', '$9.99/mo'],
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00D9FF' }}>
          {t('HERRAMIENTA GRATUITA', 'FREE TOOL')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Checker de SEO para', 'YouTube Video SEO')}<br />
          <span style={{ color: 'var(--red)' }}>{t('videos de YouTube', 'Score Checker')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('Pega cualquier URL de YouTube y obtendrás una puntuación SEO de 0 a 100 al instante con un checklist detallado de qué corregir. Deja de adivinar — sabe exactamente cómo de optimizados están tus vídeos.',
            'Paste any YouTube video URL and get an instant 0-100 SEO score with a detailed checklist of what to fix. Stop guessing — know exactly how optimized your videos are.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            {t('Analiza tu video — gratis', 'Check your video — free')}
          </Link>
          <Link href="/seo-score" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            {t('Probar la herramienta', 'Try the tool')}
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('Qué analizamos en cada vídeo', 'What we analyze in every video')}
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
          {t('Mejora tu SEO de YouTube en 3 pasos', 'How to improve your YouTube SEO in 3 steps')}
        </h2>
        <div className="space-y-8">
          {steps.map((s) => (
            <div key={s.step} className="flex gap-5 items-start">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-lg" style={{ background: 'var(--red)', color: 'white' }}>
                {s.step}
              </div>
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
          {t('YTubViral SEO Score vs alternativas', 'YTubViral SEO Score vs alternatives')}
        </h2>
        <div className="overflow-x-auto">
          <table className="yv-table">
            <thead>
              <tr>
                <th className="py-3 px-4 font-display font-bold">{t('Característica', 'Feature')}</th>
                <th className="py-3 px-4 font-display font-bold text-center" style={{ color: 'var(--red)' }}>YTubViral</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">{t('Alternativa A', 'Alternative A')}</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">{t('Alternativa B', 'Alternative B')}</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {comparison.map(([feat, ytub, vidiq, tube]) => (
                <tr key={feat}>
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

      <RelatedTools slug="seo-score" lang={lang} />

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
            name: 'YTubViral — SEO Score',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/seo-score',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">
          {t('¿Cómo de optimizado está tu último vídeo?', 'How optimized is your latest video?')}
        </h2>
        <p className="text-zinc-400 mb-8">{t('Descúbrelo en 5 segundos. Gratis, sin registro para probar.', 'Find out in 5 seconds. Free, no signup required to try.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          {t('Analiza tu SEO — gratis', 'Check your SEO score — free')}
        </Link>
      </section>
    </div>
  );
}
