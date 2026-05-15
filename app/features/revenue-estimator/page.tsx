import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'YouTube Money Calculator — Revenue Estimator by Country | YTubViral',
  description:
    'Estimate YouTube earnings for any channel. Real CPM data for 40+ countries, revenue projections, and AI monetization tips. Free YouTube money calculator.',
  alternates: { canonical: 'https://ytubviral.com/features/revenue-estimator' },
  openGraph: {
    title: 'YouTube Money Calculator — Revenue Estimator | YTubViral',
    description: 'Estimate YouTube earnings with real CPM data for 40+ countries. Free calculator.',
    url: 'https://ytubviral.com/features/revenue-estimator',
    type: 'website',
  },
};

const FAQ_ES = [
  { q: '¿Cómo de precisas son las estimaciones de ingresos?', a: 'Nuestras estimaciones usan datos reales de CPM de YouTube Analytics (canales autenticados) y benchmarks del sector por país y nicho. La precisión suele estar en un margen del 15-25% de los ingresos reales — mucho mejor que herramientas que usan rangos genéricos de $1-$5 CPM.' },
  { q: '¿Qué datos de CPM tenéis?', a: 'Rangos reales de CPM para más de 40 países incluyendo EEUU, Reino Unido, Alemania, Canadá, Australia, España, México, Brasil, India, Japón y más. Los datos están segmentados por nicho (tech, gaming, finanzas, belleza, etc.) ya que el CPM varía drásticamente por categoría.' },
  { q: '¿Puedo estimar ingresos de cualquier canal?', a: 'Sí. Introduce cualquier URL de canal de YouTube y estimaremos los ingresos mensuales y anuales basándonos en su número de vistas, geografía de la audiencia (cuando está disponible) y nicho. Funciona para canales de cualquier tamaño.' },
  { q: '¿En qué se diferencia de las estimaciones de Social Blade?', a: 'Social Blade muestra rangos extremadamente amplios (ej. "$500 - $8.000/mes") que no son útiles. YTubViral usa datos de CPM específicos por nicho y geografía de la audiencia para dar estimaciones mucho más ajustadas y accionables. Además incluimos consejos de monetización con IA.' },
  { q: '¿Incluye ingresos por patrocinios?', a: 'La calculadora se centra en ingresos por AdSense/publicidad de YouTube. Los ingresos por patrocinios varían demasiado para estimarlos con fiabilidad. Sin embargo, nuestros consejos de monetización con IA incluyen orientación sobre precios de patrocinios basados en tus métricas.' },
];

const FAQ_EN = [
  { q: 'How accurate are the revenue estimates?', a: 'Our estimates use real CPM data from YouTube Analytics (authenticated channels) and industry benchmarks by country and niche. Accuracy is typically within 15-25% of actual earnings — significantly better than tools that use generic $1-$5 CPM ranges.' },
  { q: 'What CPM data do you have?', a: 'Real CPM ranges for 40+ countries including US, UK, Germany, Canada, Australia, Spain, Mexico, Brazil, India, Japan, and more. Data is segmented by niche (tech, gaming, finance, beauty, etc.) since CPM varies dramatically by category.' },
  { q: 'Can I estimate earnings for any channel?', a: 'Yes. Enter any YouTube channel URL and we\'ll estimate monthly and yearly revenue based on their view count, audience geography (when available), and niche. Works for channels of any size.' },
  { q: 'How is this different from Social Blade earnings estimates?', a: 'Social Blade shows extremely wide ranges (e.g., "$500 - $8,000/month") that aren\'t useful. YTubViral uses niche-specific CPM data and audience geography to give much tighter, actionable estimates. Plus we include AI-powered monetization tips.' },
  { q: 'Does this include sponsorship income?', a: 'The calculator focuses on AdSense/YouTube ad revenue. Sponsorship income varies too much to estimate reliably. However, our AI monetization tips include advice on sponsorship pricing based on your channel metrics.' },
];

export default async function RevenueEstimatorFeature() {
  const cookieStore = await cookies();
  const lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const features = [
    { title: t('CPM por país', 'CPM by country'), desc: t('Datos reales de CPM para más de 40 países. Mira exactamente cuánto pagan los anunciantes por 1.000 vistas en cada mercado — desde $30+ (finanzas EEUU) hasta $0,50 (gaming India).', 'Real CPM data for 40+ countries. See exactly how much advertisers pay per 1,000 views in each market — from $30+ (US finance) to $0.50 (India gaming).') },
    { title: t('Estimación de ingresos mensuales', 'Monthly revenue estimate'), desc: t('Basado en vistas recientes, geografía de la audiencia y CPM del nicho. Rangos más ajustados que cualquier otra herramienta gratuita.', 'Based on recent view counts, audience geography, and niche CPM. Tighter ranges than any other free tool.') },
    { title: t('Proyección anual', 'Yearly projection'), desc: t('Estimación de ingresos anualizada con tendencia de crecimiento incluida. Mira hacia dónde se dirige el canal financieramente.', 'Annualized revenue estimate with growth trend factored in. See where the channel is heading financially.') },
    { title: t('Ingresos por vídeo', 'Revenue per video'), desc: t('Ganancia media por vídeo basada en vistas típicas. Conoce tu ROI por vídeo antes de invertir en producción.', 'Average earnings per video based on typical views. Know your per-video ROI before investing in production.') },
    { title: t('Comparativa de CPM por nicho', 'Niche CPM comparison'), desc: t('¿Cómo se compara tu nicho? Finanzas y tech pagan 5-10x más que entretenimiento. Mira los datos.', 'How does your niche compare? Finance and tech pay 5-10x more than entertainment. See the data.') },
    { title: t('Consejos de monetización con IA', 'AI monetization tips'), desc: t('Recomendaciones personalizadas para aumentar ingresos: mejor segmentación de audiencia, cambios de formato, orientación de precios para patrocinios.', 'Personalized advice on how to increase revenue: better audience targeting, content format changes, sponsorship pricing guidance.') },
  ];

  const cpmData = [
    [t('Estados Unidos', 'United States'), '$7-15', t('Finanzas ($25+), Tech ($12+)', 'Finance ($25+), Tech ($12+)')],
    [t('Reino Unido', 'United Kingdom'), '$6-12', t('Finanzas, Negocios, SaaS', 'Finance, Business, SaaS')],
    [t('Alemania', 'Germany'), '$6-11', t('Auto, Finanzas, Tech', 'Auto, Finance, Tech')],
    [t('Canadá', 'Canada'), '$5-10', t('Finanzas, Inmobiliaria', 'Finance, Real Estate')],
    ['Australia', '$5-10', t('Finanzas, Salud', 'Finance, Health')],
    [t('España', 'Spain'), '$2-5', t('Finanzas, Marketing', 'Finance, Marketing')],
    [t('México', 'Mexico'), '$1-3', t('Negocios, Tech', 'Business, Tech')],
    ['Brasil', '$0.80-2', t('Finanzas, Gaming', 'Finance, Gaming')],
    ['India', '$0.30-1.50', t('Tech, Educación', 'Tech, Education')],
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00D9FF' }}>
          {t('HERRAMIENTA PRO', 'PRO TOOL')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Calculadora de ingresos', 'YouTube Money')}<br />
          <span style={{ color: 'var(--red)' }}>{t('de YouTube', 'Calculator')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('¿Cuánto gana realmente un YouTuber? Obtendrás estimaciones precisas basadas en datos reales de CPM de más de 40 países. No rangos genéricos — números específicos por nicho.',
            'How much does a YouTuber really earn? Get accurate revenue estimates based on real CPM data for 40+ countries. Not generic ranges — actual niche-specific numbers.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            {t('Estima tus ingresos — prueba gratis', 'Estimate earnings — free trial')}
          </Link>
          <Link href="/revenue" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            {t('Probar la calculadora', 'Try the calculator')}
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('Qué te muestra el estimador de ingresos', 'What the revenue estimator shows you')}
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
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          {t('CPM medio de YouTube por país (2026)', 'Average YouTube CPM by country (2026)')}
        </h2>
        <p className="text-zinc-400 text-center mb-8 text-sm">
          {t('CPM = coste por 1.000 vistas monetizadas. Estas son medias reales entre nichos.', 'CPM = cost per 1,000 monetized views. These are real averages across niches.')}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">{t('País', 'Country')}</th>
                <th className="py-3 px-4 font-display font-bold text-center">{t('CPM medio', 'Avg CPM')}</th>
                <th className="py-3 px-4 font-display font-bold text-center">{t('Nichos alto CPM', 'High-CPM niches')}</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {cpmData.map(([country, cpm, niches]) => (
                <tr key={country} className="border-b border-white/5">
                  <td className="py-2.5 px-4 text-white">{country}</td>
                  <td className="py-2.5 px-4 text-center">{cpm}</td>
                  <td className="py-2.5 px-4 text-center text-xs">{niches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-zinc-500 text-xs text-center mt-4">
          {t('Datos de canales autenticados de YTubViral, actualizados trimestralmente. Tu CPM real depende del nicho, demografía de la audiencia y formato de anuncio.',
            'Data from YTubViral authenticated channels, updated quarterly. Your actual CPM depends on niche, audience demographics, and ad format.')}
        </p>
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
            mainEntity: FAQ_ES.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">
          {t('¿Cuánto vale realmente tu canal?', 'How much is your channel really worth?')}
        </h2>
        <p className="text-zinc-400 mb-8">{t('Obtendrás una estimación real, no un rango inútil de $500-$8.000.', 'Get a real estimate, not a useless $500-$8,000 range.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          {t('Calcula tus ingresos', 'Calculate your revenue')}
        </Link>
      </section>
    </div>
  );
}
