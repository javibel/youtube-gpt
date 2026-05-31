import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerLang } from '@/lib/server-lang';
import RelatedTools from '@/components/RelatedTools';


export const metadata: Metadata = {
  title: 'YouTube Channel Analytics Dashboard — Views, Traffic & Growth',
  description:
    'Dashboard de analytics avanzado para tu canal de YouTube: vistas diarias, watch time, fuentes de tráfico, top vídeos y suscriptores.',
  alternates: { canonical: 'https://ytubviral.com/features/channel-analytics' },
  openGraph: {
    title: 'YouTube Channel Analytics Dashboard',
    description: 'Daily views, watch time, traffic sources, top videos, and subscriber growth. Free.',
    url: 'https://ytubviral.com/features/channel-analytics',
    type: 'website',
    images: [{ url: '/og-channel-analytics.webp', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube Channel Analytics Dashboard — Views, Traffic & Growth',
    description: 'Dashboard de analytics avanzado para tu canal de YouTube: vistas diarias, watch time, fuentes de tráfico, top vídeos y suscriptores.',
    images: ['/og-channel-analytics.webp'],
  },
};

const FAQ_ES = [
  { q: '¿En qué se diferencia de YouTube Studio?', a: 'YTubViral presenta tus datos de una forma más visual y accionable: gráficas interactivas con hover, desglose claro de tráfico por fuente y país, y top vídeos con métricas clave en una sola vista. Sin navegar por 10 pantallas.' },
  { q: '¿Qué datos puedo ver?', a: 'Vistas diarias, minutos de watch time, suscriptores ganados/perdidos, fuentes de tráfico (búsqueda, sugeridos, externos, notificaciones, Shorts), países top y los vídeos con mejor rendimiento del periodo.' },
  { q: '¿Con qué frecuencia se actualizan los datos?', a: 'Los datos se sincronizan con la API de YouTube cada vez que accedes al dashboard. Hay un retraso natural de ~48h en algunos datos de YouTube (como ingresos y retención detallada).' },
  { q: '¿Es seguro conectar mi canal?', a: 'Usamos Google OAuth oficial. Solo pedimos permisos de lectura (yt-analytics.readonly). Nunca podemos publicar, editar o eliminar nada de tu canal. Puedes revocar el acceso en cualquier momento.' },
  { q: '¿Puedo cambiar el periodo de análisis?', a: 'Sí. Puedes ver datos de los últimos 7, 28 o 90 días. El periodo se puede cambiar desde el dashboard.' },
];

const FAQ_EN = [
  { q: 'How is this different from YouTube Studio?', a: 'YTubViral presents your data in a more visual, actionable way: interactive hover charts, clear traffic source and country breakdowns, and top videos with key metrics in a single view. No navigating through 10 screens.' },
  { q: 'What data can I see?', a: 'Daily views, watch time minutes, subscribers gained/lost, traffic sources (search, suggested, external, notifications, Shorts), top countries, and best-performing videos for the period.' },
  { q: 'How often is data updated?', a: 'Data syncs with YouTube\'s API each time you access the dashboard. There\'s a natural ~48h delay on some YouTube data (like revenue and detailed retention).' },
  { q: 'Is it safe to connect my channel?', a: 'We use official Google OAuth. We only request read permissions (yt-analytics.readonly). We can never post, edit, or delete anything from your channel. You can revoke access anytime.' },
  { q: 'Can I change the analysis period?', a: 'Yes. You can view data for the last 7, 28, or 90 days. The period is adjustable from the dashboard.' },
];

export default async function ChannelAnalyticsFeature() {
  const lang = getServerLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const features = [
    { title: t('Gráfica de vistas diarias', 'Daily Views Chart'), desc: t('Gráfica interactiva con hover que muestra vistas, watch time y suscriptores ganados día a día.', 'Interactive hover chart showing views, watch time, and subscribers gained day by day.') },
    { title: t('Fuentes de tráfico', 'Traffic Sources'), desc: t('Desglose visual de dónde vienen tus vistas: búsqueda de YouTube, sugeridos, enlaces externos, notificaciones, Shorts y más.', 'Visual breakdown of where your views come from: YouTube search, suggested, external links, notifications, Shorts, and more.') },
    { title: t('Top vídeos del periodo', 'Top Videos'), desc: t('Tus vídeos con mejor rendimiento ordenados por vistas, con watch time, likes y suscriptores ganados por cada uno.', 'Your best-performing videos ranked by views, with watch time, likes, and subscribers gained for each.') },
    { title: t('Desglose por países', 'Country Breakdown'), desc: t('Descubre en qué países se ve tu contenido. Importante para adaptar horarios, idiomas y temas.', 'Discover which countries watch your content. Important for adapting schedules, languages, and topics.') },
    { title: t('Suscriptores ganados vs perdidos', 'Subscribers Gained vs Lost'), desc: t('Visualiza la salud de tu canal: cuántos suscriptores ganas y pierdes cada día.', 'Visualize your channel\'s health: how many subscribers you gain and lose each day.') },
    { title: t('Overview con métricas clave', 'Key Metrics Overview'), desc: t('Total de vistas, watch time, suscriptores netos y engagement del periodo en tarjetas resumen.', 'Total views, watch time, net subscribers, and engagement for the period in summary cards.') },
  ];

  const comparison = [
    [t('Gráficas interactivas con hover', 'Interactive hover charts'), '✓', t('Limitado', 'Limited')],
    [t('Todas las fuentes de tráfico', 'All traffic sources'), '✓', '✓'],
    [t('Top vídeos con métricas', 'Top videos with metrics'), '✓', '✓'],
    [t('Desglose por países', 'Country breakdown'), '✓', '✓'],
    [t('Una sola vista unificada', 'Single unified view'), '✓', '✗'],
    [t('Sin navegación compleja', 'No complex navigation'), '✓', '✗'],
    [t('Precio', 'Price'), t('Gratis', 'Free'), t('Gratis', 'Free')],
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00FFA3' }}>
          {t('ANALYTICS DEL CANAL', 'CHANNEL ANALYTICS')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Entiende el crecimiento', 'Understand the Growth')}<br />
          <span style={{ color: 'var(--red)' }}>{t('de tu canal', 'of Your Channel')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('Dashboard de analytics avanzado: vistas diarias, fuentes de tráfico, países, top vídeos y suscriptores. Todo en una vista clara y accionable.',
            'Advanced analytics dashboard: daily views, traffic sources, countries, top videos, and subscribers. All in one clear, actionable view.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">{t('Ver mis analytics — gratis', 'See my analytics — free')}</Link>
          <Link href="/analytics" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">{t('Ir al dashboard', 'Go to dashboard')}</Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">{t('Todo lo que mides, mejora', 'What you measure, improves')}</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (<div key={f.title} className="soft-card p-5"><h3 className="font-display font-bold text-base mb-2">{f.title}</h3><p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p></div>))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">{t('YTubViral vs YouTube Studio', 'YTubViral vs YouTube Studio')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">{t('Característica', 'Feature')}</th>
                <th className="py-3 px-4 font-display font-bold text-center" style={{ color: 'var(--red)' }}>YTubViral</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">YouTube Studio</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {comparison.map(([feat, ytub, studio]) => (
                <tr key={feat} className="border-b border-white/5">
                  <td className="py-2.5 px-4">{feat}</td>
                  <td className="py-2.5 px-4 text-center text-white font-medium">{ytub}</td>
                  <td className="py-2.5 px-4 text-center">{studio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">{t('Preguntas frecuentes', 'Frequently asked questions')}</h2>
        <div className="space-y-6">
          {FAQ.map((item) => (<div key={item.q} className="soft-card p-5"><h3 className="font-display font-bold text-base mb-2">{item.q}</h3><p className="text-zinc-400 text-sm leading-relaxed">{item.a}</p></div>))}
        </div>
      </section>

      <RelatedTools slug="channel-analytics" lang={lang} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ_ES.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) }) }} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'YTubViral — Channel Analytics',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/channel-analytics',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">{t('¿Listo para entender tus datos?', 'Ready to understand your data?')}</h2>
        <p className="text-zinc-400 mb-8">{t('Gratis para siempre. Sin tarjeta. Empieza en 10 segundos.', 'Free forever. No credit card. Start in 10 seconds.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">{t('Ver mis analytics — gratis', 'See my analytics — free')}</Link>
      </section>
    </div>
  );
}
