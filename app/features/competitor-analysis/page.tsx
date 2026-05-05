import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'YouTube Competitor Analysis Tool — Free Channel Spy | YTubViral',
  description:
    'Analyze any YouTube channel: upload frequency, average views, top keywords, trending videos, and growth patterns. Free competitor intelligence for creators.',
  alternates: { canonical: 'https://ytubviral.com/features/competitor-analysis' },
  openGraph: {
    title: 'YouTube Competitor Analysis Tool — Free | YTubViral',
    description: 'Spy on any YouTube channel: views, keywords, upload patterns, trending videos. Free.',
    url: 'https://ytubviral.com/features/competitor-analysis',
    type: 'website',
  },
};

const FAQ_ES = [
  { q: '¿Puedo analizar cualquier canal de YouTube?', a: 'Si. Introduce cualquier URL o nombre de canal y obtendras datos al instante: suscriptores, vistas, frecuencia de subida, keywords principales, videos con mejor rendimiento y mas. Funciona con cualquier canal publico sin importar su tamano.' },
  { q: '¿Que datos de la competencia puedo ver?', a: 'Frecuencia y horario de subida, media de vistas por video, tendencias de crecimiento de suscriptores, keywords y etiquetas mas usadas, videos top (outliers), rango estimado de ingresos y huecos de contenido que puedes aprovechar.' },
  { q: '¿En que se diferencia de Social Blade?', a: 'Social Blade muestra estadisticas pasivas (numero de suscriptores, nota). YTubViral va mas alla: mostramos su estrategia de keywords, identificamos sus videos outlier, detectamos patrones de contenido y sugerimos oportunidades que no estan cubriendo y tu puedes atacar.' },
  { q: '¿Puedo hacer seguimiento de competidores a lo largo del tiempo?', a: 'Si. Los usuarios Pro pueden guardar competidores y recibir informes semanales sobre su actividad de subida, videos en tendencia y cambios de keywords. Sabe que hacen antes de que sus videos se vuelvan virales.' },
  { q: '¿Cuantos competidores puedo analizar?', a: 'Tier gratuito: analisis puntuales ilimitados. Tier Pro: guarda y sigue hasta 20 competidores con informes semanales automatizados y alertas.' },
];

const FAQ_EN = [
  { q: 'Can I analyze any YouTube channel?', a: 'Yes. Enter any channel URL or name and get instant data — subscribers, views, upload frequency, top keywords, best-performing videos, and more. Works for any public channel regardless of size.' },
  { q: 'What competitor data can I see?', a: 'Upload frequency and schedule, average views per video, subscriber growth trends, most-used keywords and tags, top performing videos (outliers), estimated revenue range, and content gaps you can exploit.' },
  { q: 'How is this different from Social Blade?', a: 'Social Blade shows passive stats (subscriber count, grade). YTubViral goes deeper: we show their keyword strategy, identify their outlier videos, detect content patterns, and suggest opportunities they\'re missing that you can target.' },
  { q: 'Can I track competitors over time?', a: 'Yes. Pro users can save competitors and get weekly reports on their upload activity, trending videos, and keyword changes. Know what they\'re doing before their videos even go viral.' },
  { q: 'How many competitors can I analyze?', a: 'Free tier: unlimited one-time analyses. Pro tier: save and track up to 20 competitors with weekly automated reports and alerts.' },
];

export default async function CompetitorAnalysisFeature() {
  const cookieStore = await cookies();
  const lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const features = [
    { title: t('Frecuencia y horario de subida', 'Upload frequency & schedule'), desc: t('Mira cuando y con que frecuencia publican. Encuentra patrones: ¿suben a horas concretas? ¿La consistencia impulsa su crecimiento?', 'See when and how often they post. Find patterns: do they upload at specific times? Is consistency driving their growth?') },
    { title: t('Media de vistas y engagement', 'Average views & engagement'), desc: t('Vistas por video, ratio de likes, tasa de comentarios — y como han cambiado estas metricas en los ultimos 30/90 dias.', 'Views per video, like ratio, comment rate — and how these metrics have changed over the last 30/90 days.') },
    { title: t('Keywords y etiquetas top', 'Top keywords & tags'), desc: t('Las keywords y etiquetas exactas que mas usan. Descubre que terminos les traen trafico y cuales no estas atacando tu.', 'The exact keywords and tags they use most. See which terms drive their traffic and find ones you\'re not targeting.') },
    { title: t('Videos outlier (rendimiento 10x)', 'Outlier videos (10x performers)'), desc: t('Videos que obtuvieron 5-10x mas vistas que su media. Revelan que formato de contenido y temas resuenan mas.', 'Videos that got 5-10x more views than their average. These reveal what content format and topics resonate most.') },
    { title: t('Huecos de contenido y oportunidades', 'Content gaps & opportunities'), desc: t('La IA identifica temas que su audiencia busca pero no han cubierto. Tu oportunidad de llenar ese hueco primero.', 'AI identifies topics their audience searches for but they haven\'t covered yet. Your chance to fill the gap first.') },
    { title: t('Trayectoria de crecimiento', 'Growth trajectory'), desc: t('Tasa de crecimiento de suscriptores, tendencia de vistas e indicadores de momentum. ¿Esta canal acelerando, estancado o cayendo?', 'Subscriber growth rate, views trend, and momentum indicators. Is this channel accelerating, plateauing, or declining?') },
  ];

  const steps = [
    { step: '1', title: t('Descubre que temas funcionan en tu nicho', 'Find what topics work in your niche'), desc: t('Analiza 3-5 canales de tu nicho. Mira sus videos outlier. Esos temas tienen demanda demostrada — ahora haz tu version.', 'Analyze 3-5 channels in your niche. Look at their outlier videos. Those topics have proven demand — now make your version.') },
    { step: '2', title: t('Roba su estrategia de keywords', 'Steal their keyword strategy'), desc: t('Mira exactamente para que keywords posicionan. Filtra las que puedes atacar segun el tamano y autoridad de tu canal.', 'See exactly which keywords they rank for. Filter for ones where you could compete based on your channel size and authority.') },
    { step: '3', title: t('Identifica huecos de contenido', 'Identify content gaps'), desc: t('Nuestra IA cruza su contenido con datos de busqueda de la audiencia. Encuentra temas que la gente quiere y nadie en tu nicho ha cubierto bien.', 'Our AI cross-references their content with audience search data. Find topics people want that nobody in your niche has covered well.') },
    { step: '4', title: t('Compara tu rendimiento', 'Benchmark your performance'), desc: t('Compara tu frecuencia de subida, media de vistas y tasa de crecimiento con la competencia. Sabe si vas por delante o por detras — y exactamente donde.', 'Compare your upload frequency, avg views, and growth rate against competitors. Know if you\'re ahead or behind — and exactly where.') },
  ];

  const comparison = [
    [t('Estadisticas del canal', 'Channel overview stats'), '✓', '✓', '✓'],
    [t('Keywords mas usadas', 'Top keywords used'), '✓', '✗', '✓'],
    [t('Deteccion de videos outlier', 'Outlier video detection'), '✓', '✗', '✗'],
    [t('Analisis de huecos con IA', 'Content gap analysis (AI)'), '✓', '✗', '✗'],
    [t('Patrones de horario de subida', 'Upload schedule patterns'), '✓', t('Basico', 'Basic'), '✓'],
    [t('Seguimiento de competidores', 'Competitor tracking'), t('✓ (Pro)', '✓ (Pro)'), '✓', '✓'],
    [t('Estimacion de ingresos', 'Revenue estimates'), '✓', t('✓ (rangos)', '✓ (ranges)'), '✓'],
    [t('Sin extension necesaria', 'No extension needed'), '✓', '✓', '✗'],
    [t('Tier gratuito', 'Free tier'), t('Ilimitado', 'Unlimited'), '✓', '3/day'],
    [t('Precio', 'Price'), '€9.99/mo', t('Gratis', 'Free'), '$19/mo'],
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00D9FF' }}>
          {t('HERRAMIENTA GRATUITA', 'FREE TOOL')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Analisis de competencia', 'YouTube Competitor')}<br />
          <span style={{ color: 'var(--red)' }}>{t('en YouTube', 'Analysis Tool')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('Introduce la URL de cualquier canal y descubre exactamente que les funciona — keywords, patrones de subida, videos outlier y huecos de contenido que puedes explotar. Conoce a tu competencia por dentro.',
            'Enter any channel URL and see exactly what\'s working for them — keywords, upload patterns, outlier videos, and content gaps you can exploit. Know your competition inside out.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            {t('Analiza un competidor — gratis', 'Analyze a competitor — free')}
          </Link>
          <Link href="/competitors" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            {t('Probar la herramienta', 'Try the tool')}
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('Que descubriras de cualquier canal', 'What you\'ll discover about any channel')}
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
          {t('Como usan los creadores el analisis de competencia', 'How creators use competitor analysis')}
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
          {t('YTubViral vs otras herramientas de competencia', 'YTubViral vs other competitor tools')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">{t('Caracteristica', 'Feature')}</th>
                <th className="py-3 px-4 font-display font-bold text-center" style={{ color: 'var(--red)' }}>YTubViral</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">Social Blade</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">VidIQ</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {comparison.map(([feat, ytub, blade, vidiq]) => (
                <tr key={feat} className="border-b border-white/5">
                  <td className="py-2.5 px-4">{feat}</td>
                  <td className="py-2.5 px-4 text-center text-white font-medium">{ytub}</td>
                  <td className="py-2.5 px-4 text-center">{blade}</td>
                  <td className="py-2.5 px-4 text-center">{vidiq}</td>
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
          {t('Sabe exactamente que hace tu competencia', 'Know exactly what your competitors are doing')}
        </h2>
        <p className="text-zinc-400 mb-8">{t('Analiza cualquier canal en segundos. Gratis, sin registro para probar.', 'Analyze any channel in seconds. Free, no signup required to try.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          {t('Analiza tu primer competidor — gratis', 'Analyze your first competitor — free')}
        </Link>
      </section>
    </div>
  );
}
