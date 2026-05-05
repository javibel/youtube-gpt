import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'YouTube SEO Score Checker — Analyze Any Video Free | YTubViral',
  description:
    'Get a 0-100 SEO score for any YouTube video in seconds. Actionable checklist for title, tags, description, and thumbnail optimization. Free tool.',
  alternates: { canonical: 'https://ytubviral.com/features/seo-score' },
  openGraph: {
    title: 'YouTube SEO Score Checker — Analyze Any Video Free | YTubViral',
    description: 'Get a 0-100 SEO score for any YouTube video. Free actionable optimization checklist.',
    url: 'https://ytubviral.com/features/seo-score',
    type: 'website',
  },
};

const FAQ_ES = [
  { q: '¿Como se calcula la puntuacion SEO?', a: 'Analizamos mas de 12 factores: presencia de keywords en el titulo, longitud, descripcion, relevancia de etiquetas, senales de calidad del thumbnail, metricas de engagement y mas. Cada factor se pondera segun su impacto demostrado en el ranking de YouTube.' },
  { q: '¿Puedo analizar cualquier video o solo los mios?', a: 'Puedes analizar cualquier video publico de YouTube, tuyo o de la competencia. Solo pega la URL y obtendras resultados al instante. Genial para hacer ingenieria inversa de lo que hacen bien los top creadores.' },
  { q: '¿En que se diferencia del SEO score de VidIQ?', a: 'VidIQ necesita una extension de navegador y solo muestra puntuaciones mientras navegas por YouTube. YTubViral funciona desde cualquier dispositivo via web, da un checklist mas detallado con correcciones especificas e incluye sugerencias de mejora con IA.' },
  { q: '¿Una puntuacion SEO alta garantiza mas vistas?', a: 'La puntuacion SEO mide lo bien optimizado que esta tu video para la busqueda de YouTube. Mejora tus probabilidades de posicionar, pero las vistas tambien dependen del CTR, retencion y demanda del tema. Recomendamos combinar SEO Score con nuestro Keyword Research.' },
  { q: '¿El checker de SEO es gratis?', a: 'Si. El analisis de puntuacion SEO es gratis sin limites. Los usuarios Pro obtienen sugerencias de mejora con IA y la posibilidad de guardar puntuaciones para seguir tu progreso de optimizacion.' },
];

const FAQ_EN = [
  { q: 'How is the SEO score calculated?', a: 'We analyze 12+ factors: title keyword presence, title length, description completeness, tag relevance, thumbnail quality signals, engagement metrics, and more. Each factor is weighted by its proven impact on YouTube rankings.' },
  { q: 'Can I check any video or only my own?', a: 'You can analyze any public YouTube video — yours or your competitors\'. Just paste the URL and get instant results. Great for reverse-engineering what top creators do right.' },
  { q: 'What makes this different from VidIQ SEO score?', a: 'VidIQ requires a browser extension and only shows scores while browsing YouTube. YTubViral works from any device via web, gives a more detailed checklist with specific fixes, and includes AI-powered improvement suggestions.' },
  { q: 'Does a higher SEO score guarantee more views?', a: 'SEO score measures how well-optimized your video is for YouTube search. It improves your chances of ranking, but views also depend on CTR, retention, and topic demand. We recommend combining SEO Score with our Keyword Research tool.' },
  { q: 'Is the SEO checker free?', a: 'Yes. The SEO score analysis is free with no limits. Pro users get AI-powered improvement suggestions and the ability to save scores over time to track optimization progress.' },
];

export default async function SeoScoreFeature() {
  const cookieStore = await cookies();
  const lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const features = [
    { title: t('Optimizacion del titulo', 'Title optimization'), desc: t('Presencia de keywords, longitud, power words, gatillos emocionales y potencial de CTR de tu titulo.', 'Keyword presence, length, power words, emotional triggers, and CTR potential of your title.') },
    { title: t('Calidad de la descripcion', 'Description quality'), desc: t('Primeros 200 caracteres, densidad de keywords, timestamps, enlaces, presencia de CTA y completitud general.', 'First 200 characters, keyword density, timestamps, links, CTA presence, and overall completeness.') },
    { title: t('Etiquetas y keywords', 'Tags & keywords'), desc: t('Numero de etiquetas, relevancia con titulo/descripcion, mix de keywords amplias y long-tail.', 'Number of tags, relevance to title/description, mix of broad and long-tail keywords.') },
    { title: t('Senales del thumbnail', 'Thumbnail signals'), desc: t('Resolucion, ratio de aspecto, deteccion de texto superpuesto, presencia de caras y analisis de contraste.', 'Resolution, aspect ratio, text overlay detection, face presence, and contrast analysis.') },
    { title: t('Metricas de engagement', 'Engagement metrics'), desc: t('Ratio de likes, tasa de comentarios y como se comparan con la media de videos en tu nicho.', 'Like ratio, comment rate, and how they compare to average videos in the same niche.') },
    { title: t('Autoridad del canal', 'Channel authority'), desc: t('Suscriptores, consistencia de subida y relevancia de nicho — factores que afectan tu poder de posicionamiento.', 'Subscriber count, upload consistency, and niche relevance — factors that affect ranking power.') },
  ];

  const steps = [
    { step: '1', title: t('Pega la URL de tu video', 'Paste your video URL'), desc: t('Copia cualquier enlace de video de YouTube y pegalo en la herramienta. Resultados en menos de 5 segundos.', 'Copy any YouTube video link and paste it into the tool. Results appear in under 5 seconds.') },
    { step: '2', title: t('Revisa tu puntuacion y checklist', 'Review your score & checklist'), desc: t('Mira tu puntuacion global (0-100) y un desglose detallado de que funciona y que necesita mejora.', 'See your overall score (0-100) and a detailed breakdown of what\'s working and what needs improvement.') },
    { step: '3', title: t('Corrige primero los items en rojo', 'Fix the red items first'), desc: t('Cada item del checklist tiene un codigo de color segun su impacto. Corrige los rojos primero para maximo mejora con minimo esfuerzo.', 'Each checklist item is color-coded by impact. Fix the red items first for maximum ranking improvement with minimum effort.') },
  ];

  const comparison = [
    [t('Puntuacion SEO global', 'Overall SEO score'), t('✓ (0-100)', '✓ (0-100)'), t('✓ (0-100)', '✓ (0-100)'), '✗'],
    [t('Checklist detallado', 'Detailed checklist'), t('✓ (12 items)', '✓ (12 items)'), t('Basico', 'Basic'), '✗'],
    [t('Analizar cualquier video', 'Analyze any video'), '✓', '✓', '✓'],
    [t('Sugerencias con IA', 'AI improvement tips'), t('✓ (Pro)', '✓ (Pro)'), '✗', '✗'],
    [t('Sin extension necesaria', 'Works without extension'), '✓', '✗', '✗'],
    [t('Seguimiento de puntuacion', 'Track score over time'), t('✓ (Pro)', '✓ (Pro)'), '✗', '✗'],
    [t('Analisis de competencia', 'Competitor video analysis'), '✓', '✓', t('Limitado', 'Limited')],
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
          {t('Pega cualquier URL de YouTube y obtendras una puntuacion SEO de 0 a 100 al instante con un checklist detallado de que corregir. Deja de adivinar — sabe exactamente como de optimizados estan tus videos.',
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
          {t('Que analizamos en cada video', 'What we analyze in every video')}
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
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">{t('Caracteristica', 'Feature')}</th>
                <th className="py-3 px-4 font-display font-bold text-center" style={{ color: 'var(--red)' }}>YTubViral</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">VidIQ</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">TubeBuddy</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {comparison.map(([feat, ytub, vidiq, tube]) => (
                <tr key={feat} className="border-b border-white/5">
                  <td className="py-2.5 px-4">{feat}</td>
                  <td className="py-2.5 px-4 text-center text-white font-medium">{ytub}</td>
                  <td className="py-2.5 px-4 text-center">{vidiq}</td>
                  <td className="py-2.5 px-4 text-center">{tube}</td>
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [...FAQ_ES, ...FAQ_EN].map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">
          {t('¿Como de optimizado esta tu ultimo video?', 'How optimized is your latest video?')}
        </h2>
        <p className="text-zinc-400 mb-8">{t('Descubrelo en 5 segundos. Gratis, sin registro para probar.', 'Find out in 5 seconds. Free, no signup required to try.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          {t('Analiza tu SEO — gratis', 'Check your SEO score — free')}
        </Link>
      </section>
    </div>
  );
}
