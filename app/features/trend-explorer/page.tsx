import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'YouTube Trend Explorer — Real-Time Trending Videos | YTubViral',
  description:
    'Explora vídeos en tendencia de YouTube en tiempo real en 12 países. Filtra por categoría, idioma, duración y engagement.',
  alternates: { canonical: 'https://ytubviral.com/features/trend-explorer' },
  openGraph: {
    title: 'YouTube Trend Explorer — Real-Time Trending | YTubViral',
    description: 'Discover what\'s trending on YouTube right now. 12 countries, real-time data, advanced filters.',
    url: 'https://ytubviral.com/features/trend-explorer',
    type: 'website',
  },
};

const FAQ_ES = [
  { q: '¿Qué países cubre el Trend Explorer?', a: 'Actualmente cubrimos 12 países: EE.UU., España, México, Reino Unido, Argentina, Colombia, Francia, Alemania, Brasil, Japón, India y Canadá. Los datos se actualizan en tiempo real.' },
  { q: '¿En qué se diferencia de la pestaña "Tendencias" de YouTube?', a: 'YouTube solo muestra 50 vídeos sin filtros. YTubViral muestra más resultados con filtros avanzados (idioma, duración, mínimo de likes, engagement), métricas de views/hora y la opción de generar contenido directamente.' },
  { q: '¿Qué son las alertas de tendencias?', a: 'Los usuarios Pro reciben alertas diarias personalizadas cuando se detecta una tendencia emergente en su nicho. Te avisamos antes de que el tema explote, para que seas de los primeros en crear contenido.' },
  { q: '¿Puedo filtrar por idioma y categoría?', a: 'Sí. Puedes filtrar por país, categoría (gaming, música, educación, etc.), idioma del vídeo, duración (corto, medio, largo) y mínimo de likes. También puedes ordenar por views/hora, total de views, likes o engagement.' },
  { q: '¿Cómo uso las tendencias para crecer?', a: 'Identifica temas con alta velocidad de views (views/hora alto), crea tu versión del contenido adaptada a tu nicho, y publícala mientras el tema sigue caliente. El botón "Crear vídeo sobre esto" te lleva directamente al generador.' },
];

const FAQ_EN = [
  { q: 'Which countries does the Trend Explorer cover?', a: 'We currently cover 12 countries: USA, Spain, Mexico, UK, Argentina, Colombia, France, Germany, Brazil, Japan, India, and Canada. Data updates in real time.' },
  { q: 'How is this different from YouTube\'s Trending tab?', a: 'YouTube only shows 50 videos with no filters. YTubViral shows more results with advanced filters (language, duration, min likes, engagement), views/hour metrics, and a direct "create video" action.' },
  { q: 'What are trend alerts?', a: 'Pro users receive personalized daily alerts when an emerging trend is detected in their niche. We notify you before the topic explodes, so you can be among the first to create content.' },
  { q: 'Can I filter by language and category?', a: 'Yes. Filter by country, category (gaming, music, education, etc.), video language, duration (short, medium, long), and minimum likes. Sort by views/hour, total views, likes, or engagement.' },
  { q: 'How do I use trends to grow?', a: 'Identify topics with high views/hour velocity, create your own version adapted to your niche, and publish while the topic is still hot. The "Create video about this" button takes you straight to the generator.' },
];

export default async function TrendExplorerFeature() {
  const cookieStore = await cookies();
  const lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const features = [
    { title: t('12 países en tiempo real', '12 countries in real time'), desc: t('Datos de tendencias de EE.UU., España, México, UK, Argentina, Colombia, Francia, Alemania, Brasil, Japón, India y Canadá actualizados constantemente.', 'Trending data from USA, Spain, Mexico, UK, Argentina, Colombia, France, Germany, Brazil, Japan, India, and Canada updated constantly.') },
    { title: t('Views por hora (VPH)', 'Views per hour (VPH)'), desc: t('Identifica los vídeos que más rápido crecen. Un VPH alto significa que el tema está explotando ahora mismo.', 'Identify the fastest-growing videos. A high VPH means the topic is exploding right now.') },
    { title: t('Filtros avanzados', 'Advanced filters'), desc: t('Filtra por categoría, idioma, duración, mínimo de likes y engagement. Encuentra exactamente lo que buscas.', 'Filter by category, language, duration, min likes, and engagement. Find exactly what you\'re looking for.') },
    { title: t('Tasa de engagement', 'Engagement rate'), desc: t('Ve qué vídeos generan más interacción (likes + comentarios / views). Alto engagement = audiencia activa.', 'See which videos generate the most interaction (likes + comments / views). High engagement = active audience.') },
    { title: t('Alertas personalizadas (Pro)', 'Personalized alerts (Pro)'), desc: t('Recibe alertas diarias cuando se detecta una tendencia emergente en tu nicho. Sé de los primeros en crear contenido.', 'Get daily alerts when an emerging trend is detected in your niche. Be among the first to create content.') },
    { title: t('Crear vídeo en un clic', 'Create video in one click'), desc: t('¿Ves un tema trending? Haz clic en "Crear vídeo" y genera título, descripción y script con IA al instante.', 'See a trending topic? Click "Create video" and generate a title, description, and script with AI instantly.') },
  ];

  const steps = [
    { step: '1', title: t('Elige un país', 'Choose a country'), desc: t('Selecciona la región que te interesa. Cada país muestra sus propias tendencias con datos locales.', 'Select the region you\'re interested in. Each country shows its own trends with local data.') },
    { step: '2', title: t('Filtra y ordena', 'Filter and sort'), desc: t('Usa los filtros de categoría, idioma, duración y likes. Ordena por views/hora para ver qué está explotando.', 'Use category, language, duration, and likes filters. Sort by views/hour to see what\'s exploding.') },
    { step: '3', title: t('Identifica oportunidades', 'Identify opportunities'), desc: t('Busca vídeos con alto VPH y engagement en tu nicho. Si el tema es relevante para tu audiencia, es tu momento.', 'Look for videos with high VPH and engagement in your niche. If the topic is relevant to your audience, it\'s your moment.') },
    { step: '4', title: t('Crea tu contenido', 'Create your content'), desc: t('Haz clic en "Crear vídeo sobre esto" y deja que la IA de YTubViral genere título, descripción y script optimizados.', 'Click "Create video about this" and let YTubViral\'s AI generate an optimized title, description, and script.') },
  ];

  const regions = [
    { flag: '🇺🇸', name: t('EE.UU.', 'USA') },
    { flag: '🇪🇸', name: t('España', 'Spain') },
    { flag: '🇲🇽', name: t('México', 'Mexico') },
    { flag: '🇬🇧', name: t('Reino Unido', 'UK') },
    { flag: '🇦🇷', name: 'Argentina' },
    { flag: '🇨🇴', name: 'Colombia' },
    { flag: '🇫🇷', name: t('Francia', 'France') },
    { flag: '🇩🇪', name: t('Alemania', 'Germany') },
    { flag: '🇧🇷', name: t('Brasil', 'Brazil') },
    { flag: '🇯🇵', name: t('Japón', 'Japan') },
    { flag: '🇮🇳', name: 'India' },
    { flag: '🇨🇦', name: t('Canadá', 'Canada') },
  ];

  const audiences = [
    { title: t('Creadores de contenido', 'Content creators'), desc: t('Descubre los temas más calientes en tu región y categoría. Crea vídeos sobre lo que la gente quiere ver ahora, no la semana pasada.', 'Discover the hottest topics in your region and category. Create videos about what people want to watch now, not last week.') },
    { title: t('Canales de noticias/actualidad', 'News/current events channels'), desc: t('Reacciona a tendencias en minutos. Monitoriza múltiples países y sé el primero en cubrir los temas virales.', 'React to trends in minutes. Monitor multiple countries and be first to cover viral topics.') },
    { title: t('Agencias de marketing', 'Marketing agencies'), desc: t('Monitoriza tendencias globales para tus clientes. Identifica oportunidades de contenido basadas en datos reales, no intuición.', 'Monitor global trends for your clients. Identify content opportunities based on real data, not intuition.') },
    { title: t('Marcas y empresas', 'Brands & businesses'), desc: t('Detecta cuándo tu industria está en tendencia y aprovecha el momento con contenido relevante y oportuno.', 'Detect when your industry is trending and capitalize with timely, relevant content.') },
  ];

  const comparison = [
    [t('Países disponibles', 'Countries available'), '12', '1', t('Limitado', 'Limited')],
    [t('Views por hora (VPH)', 'Views per hour (VPH)'), '✓', '✗', '✗'],
    [t('Filtro por idioma del vídeo', 'Video language filter'), '✓', '✗', '✗'],
    [t('Filtro por duración', 'Duration filter'), '✓', '✗', '✗'],
    [t('Filtro por engagement', 'Engagement filter'), '✓', '✗', '✗'],
    [t('Alertas personalizadas', 'Personalized alerts'), '✓ (Pro)', '✗', '✗'],
    [t('Crear vídeo directamente', 'Create video directly'), '✓', '✗', '✗'],
    [t('Precio', 'Price'), t('Gratis', 'Free'), t('Gratis', 'Free'), '$19/mo'],
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#eab308' }}>
          {t('EXPLORADOR DE TENDENCIAS', 'TREND EXPLORER')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Tendencias de YouTube', 'YouTube Trends')}<br />
          <span style={{ color: 'var(--red)' }}>{t('en tiempo real', 'in real time')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('Descubre qué se está viralizando ahora en 12 países. Filtra por categoría, idioma y engagement. Crea tu vídeo antes de que la tendencia muera.',
            'Discover what\'s going viral right now across 12 countries. Filter by category, language, and engagement. Create your video before the trend dies.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            {t('Explorar tendencias — gratis', 'Explore trends — free')}
          </Link>
          <Link href="/trends" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            {t('Ver tendencias ahora', 'View trends now')}
          </Link>
        </div>
      </section>

      {/* Country badges */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <div className="flex flex-wrap justify-center gap-3">
          {regions.map((r) => (
            <span key={r.name} className="font-mono-jb text-[13px] px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--yv-text-2)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {r.flag} {r.name}
            </span>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('Todo lo que necesitas para surfear tendencias', 'Everything you need to ride trends')}
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
          {t('YTubViral vs otras herramientas de tendencias', 'YTubViral vs other trend tools')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">{t('Característica', 'Feature')}</th>
                <th className="py-3 px-4 font-display font-bold text-center" style={{ color: 'var(--red)' }}>YTubViral</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">YouTube</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">VidIQ</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {comparison.map(([feat, ytub, yt, vidiq]) => (
                <tr key={feat} className="border-b border-white/5">
                  <td className="py-2.5 px-4">{feat}</td>
                  <td className="py-2.5 px-4 text-center text-white font-medium">{ytub}</td>
                  <td className="py-2.5 px-4 text-center">{yt}</td>
                  <td className="py-2.5 px-4 text-center">{vidiq}</td>
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
            name: 'YTubViral — Trend Explorer',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/trend-explorer',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">
          {t('¿Listo para descubrir la próxima tendencia viral?', 'Ready to discover the next viral trend?')}
        </h2>
        <p className="text-zinc-400 mb-8">{t('Gratis para siempre. Sin tarjeta. Empieza en 10 segundos.', 'Free forever. No credit card. Start in 10 seconds.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          {t('Explorar tendencias — gratis', 'Explore trends — free')}
        </Link>
      </section>
    </div>
  );
}
