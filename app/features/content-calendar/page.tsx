import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerLang } from '@/lib/server-lang';
import RelatedTools from '@/components/RelatedTools';


export const metadata: Metadata = {
  title: 'YouTube Content Calendar — Plan & Schedule Videos',
  description:
    'Calendario de contenido para YouTube: planifica y programa tus vídeos. Gestiona ideas, borradores y publicaciones en un solo lugar.',
  alternates: { canonical: 'https://ytubviral.com/features/content-calendar' },
  openGraph: {
    title: 'YouTube Content Calendar',
    description: 'Visual content calendar for YouTube. Plan, schedule, and track your uploads.',
    url: 'https://ytubviral.com/features/content-calendar',
    type: 'website',
    images: [{ url: '/og-content-calendar.webp', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube Content Calendar — Plan & Schedule Videos',
    description: 'Calendario de contenido para YouTube: planifica y programa tus vídeos. Gestiona ideas, borradores y publicaciones en un solo lugar.',
    images: ['/og-content-calendar.webp'],
  },
};

const FAQ_ES = [
  { q: '¿Qué estados puede tener un vídeo?', a: 'Cuatro: Idea (conceptos sin desarrollar), Borrador (en producción), Programado (fecha de publicación asignada) y Publicado. Cada estado tiene un color distinto para verlo de un vistazo.' },
  { q: '¿Puedo arrastrar vídeos entre días?', a: 'Sí. Haz clic en cualquier entrada y cambia la fecha para replanificar tu calendario rápidamente.' },
  { q: '¿Se sincroniza con YouTube?', a: 'Actualmente es un planificador independiente. Los vídeos publicados se marcan manualmente. En próximas versiones se sincronizará automáticamente con tu canal.' },
  { q: '¿Cuántas entradas puedo crear?', a: 'Sin límite. Puedes planificar meses de contenido por adelantado sin restricción de entradas.' },
  { q: '¿Puedo usarlo en equipo?', a: 'Actualmente es individual por cuenta. La colaboración en equipo llegará con una actualización futura del plan Business.' },
];

const FAQ_EN = [
  { q: 'What statuses can a video have?', a: 'Four: Idea (undeveloped concepts), Draft (in production), Scheduled (publish date assigned), and Published. Each status has a different color for quick scanning.' },
  { q: 'Can I drag videos between days?', a: 'Yes. Click any entry and change the date to quickly replan your calendar.' },
  { q: 'Does it sync with YouTube?', a: 'Currently it\'s a standalone planner. Published videos are marked manually. Auto-sync with your channel is coming in a future update.' },
  { q: 'How many entries can I create?', a: 'Unlimited. You can plan months of content ahead with no entry restrictions.' },
  { q: 'Can I use it with a team?', a: 'Currently individual per account. Team collaboration is coming with a future Business plan update.' },
];

export default async function ContentCalendarFeature() {
  const lang = getServerLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const features = [
    { title: t('Vista mensual', 'Monthly View'), desc: t('Calendario visual mes a mes. Ve de un vistazo qué días tienes contenido planificado y cuáles están vacíos.', 'Visual month-by-month calendar. See at a glance which days have planned content and which are empty.') },
    { title: t('4 estados de producción', '4 Production Statuses'), desc: t('Idea → Borrador → Programado → Publicado. Cada etapa con color propio para trackear tu pipeline de contenido.', 'Idea → Draft → Scheduled → Published. Each stage color-coded to track your content pipeline.') },
    { title: t('Notas y descripción', 'Notes & Description'), desc: t('Añade notas, descripción y detalles a cada entrada. Guarda ideas completas para cuando llegue el momento de grabar.', 'Add notes, descriptions, and details to each entry. Save complete ideas for when it\'s time to record.') },
    { title: t('Colores personalizables', 'Custom Colors'), desc: t('Asigna colores a cada vídeo para categorizar por serie, formato o prioridad.', 'Assign colors to each video to categorize by series, format, or priority.') },
  ];

  const steps = [
    { step: '1', title: t('Crea una idea', 'Create an idea'), desc: t('Haz clic en cualquier día del calendario y añade un título. Empieza como "Idea" y ve avanzándola.', 'Click any day on the calendar and add a title. Start as "Idea" and advance it through stages.') },
    { step: '2', title: t('Desarrolla y programa', 'Develop and schedule'), desc: t('Cuando el vídeo esté en producción, cámbialo a "Borrador". Cuando asignes fecha, a "Programado".', 'When the video is in production, change it to "Draft". When you assign a date, to "Scheduled".') },
    { step: '3', title: t('Publica y trackea', 'Publish and track'), desc: t('Marca como "Publicado" cuando esté live. Tu calendario se convierte en un histórico de todo tu contenido.', 'Mark as "Published" when it\'s live. Your calendar becomes a history of all your content.') },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#ef4444' }}>
          {t('CALENDARIO DE CONTENIDO', 'CONTENT CALENDAR')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Planifica tu contenido', 'Plan Your Content')}<br />
          <span style={{ color: 'var(--red)' }}>{t('como un profesional', 'Like a Pro')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('Calendario visual para planificar, programar y trackear tus vídeos de YouTube. Desde la idea hasta la publicación, todo en un sitio.',
            'Visual calendar to plan, schedule, and track your YouTube videos. From idea to publication, all in one place.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">{t('Empezar a planificar — gratis', 'Start planning — free')}</Link>
          <Link href="/calendar" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">{t('Ver mi calendario', 'View my calendar')}</Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">{t('Funcionalidades', 'Features')}</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((f) => (<div key={f.title} className="soft-card p-5"><h3 className="font-display font-bold text-base mb-2">{f.title}</h3><p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p></div>))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">{t('Cómo funciona', 'How it works')}</h2>
        <div className="space-y-8">
          {steps.map((s) => (
            <div key={s.step} className="flex gap-5 items-start">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-lg" style={{ background: 'var(--red)', color: 'white' }}>{s.step}</div>
              <div><h3 className="font-display font-bold text-lg mb-1">{s.title}</h3><p className="text-zinc-400 text-sm leading-relaxed">{s.desc}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">{t('Preguntas frecuentes', 'Frequently asked questions')}</h2>
        <div className="space-y-6">
          {FAQ.map((item) => (<div key={item.q} className="soft-card p-5"><h3 className="font-display font-bold text-base mb-2">{item.q}</h3><p className="text-zinc-400 text-sm leading-relaxed">{item.a}</p></div>))}
        </div>
      </section>

      <RelatedTools slug="content-calendar" lang={lang} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ_ES.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) }) }} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'YTubViral — Content Calendar',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/content-calendar',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">{t('¿Listo para organizar tu contenido?', 'Ready to organize your content?')}</h2>
        <p className="text-zinc-400 mb-8">{t('Gratis para siempre. Sin tarjeta. Empieza en 10 segundos.', 'Free forever. No credit card. Start in 10 seconds.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">{t('Crear mi calendario — gratis', 'Create my calendar — free')}</Link>
      </section>
    </div>
  );
}
