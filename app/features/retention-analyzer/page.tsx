import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';


export const metadata: Metadata = {
  title: 'YouTube Retention Analyzer — Hook Score & Drop-Off Points',
  description:
    'Analiza la retención de audiencia de tus vídeos de YouTube: curvas, hook score, puntos de abandono y consejos de IA para mejorar.',
  alternates: { canonical: 'https://ytubviral.com/features/retention-analyzer' },
  openGraph: {
    title: 'YouTube Retention Analyzer',
    description: 'Retention curves, hook scores, drop-off analysis, and AI tips to boost watch time.',
    url: 'https://ytubviral.com/features/retention-analyzer',
    type: 'website',
    images: [{ url: '/og-retention-analyzer.webp', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube Retention Analyzer — Hook Score & Drop-Off Points',
    description: 'Analiza la retención de audiencia de tus vídeos de YouTube: curvas, hook score, puntos de abandono y consejos de IA para mejorar.',
    images: ['/og-retention-analyzer.webp'],
  },
};

const FAQ_ES = [
  { q: '¿Qué es el Hook Score?', a: 'Es una puntuación 0-100 que mide cuánta audiencia retiene tu vídeo en los primeros 30 segundos. Un hook score >80 significa que tu intro engancha. <40 significa que estás perdiendo gente antes de empezar.' },
  { q: '¿Qué son los drop-off points?', a: 'Son los momentos exactos donde tu audiencia abandona el vídeo. Te mostramos el timestamp, el porcentaje de caída y, con IA, el posible motivo (pausa larga, cambio de tema, falta de pattern interrupt, etc.).' },
  { q: '¿Puedo comparar retención entre vídeos?', a: 'Sí. Puedes superponer hasta 5 curvas de retención para comparar qué formatos, intros o estilos retienen mejor a tu audiencia.' },
  { q: '¿Necesito muchas vistas para que funcione?', a: 'YouTube empieza a dar datos de retención fiables a partir de ~100 vistas. Con menos, la curva puede ser muy errática.' },
  { q: '¿La IA me dice cómo mejorar la retención?', a: 'Sí. Analizamos cada drop-off y sugerimos acciones concretas: hooks más fuertes, pattern interrupts, timestamps del momento exacto que necesitas editar.' },
];

const FAQ_EN = [
  { q: 'What is the Hook Score?', a: 'A 0-100 score measuring how much audience your video retains in the first 30 seconds. Hook score >80 means your intro hooks people. <40 means you\'re losing viewers before you even start.' },
  { q: 'What are drop-off points?', a: 'The exact moments where your audience leaves the video. We show the timestamp, drop percentage, and with AI, the likely reason (long pause, topic change, lack of pattern interrupt, etc.).' },
  { q: 'Can I compare retention between videos?', a: 'Yes. You can overlay up to 5 retention curves to compare which formats, intros, or styles retain your audience better.' },
  { q: 'Do I need many views for it to work?', a: 'YouTube starts providing reliable retention data from ~100 views. With fewer, the curve can be very erratic.' },
  { q: 'Does the AI tell me how to improve retention?', a: 'Yes. We analyze each drop-off and suggest concrete actions: stronger hooks, pattern interrupts, exact timestamps of moments you need to re-edit.' },
];

export default async function RetentionAnalyzerFeature() {
  const cookieStore = await cookies();
  const lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const features = [
    { title: t('Curva de retención interactiva', 'Interactive Retention Curve'), desc: t('Visualiza segundo a segundo dónde tu audiencia sigue enganchada y dónde abandona. Hover para ver datos exactos.', 'See second-by-second where your audience stays engaged and where they drop off. Hover for exact data.') },
    { title: t('Hook Score', 'Hook Score'), desc: t('Puntuación 0-100 de tu intro. ¿Engancha en los primeros 30 segundos? Te lo decimos con un número claro y accionable.', '0-100 score for your intro. Does it hook in the first 30 seconds? We tell you with a clear, actionable number.') },
    { title: t('Detección de drop-offs', 'Drop-Off Detection'), desc: t('Detectamos automáticamente los momentos donde pierdes audiencia y cuánta gente se va en cada punto.', 'We automatically detect moments where you lose audience and how many people leave at each point.') },
    { title: t('Diagnóstico IA', 'AI Diagnosis'), desc: t('Para cada drop-off, la IA sugiere por qué ocurrió (pausa, monotonía, cambio brusco) y cómo solucionarlo.', 'For each drop-off, AI suggests why it happened (pause, monotony, abrupt change) and how to fix it.') },
    { title: t('Comparación de vídeos', 'Video Comparison'), desc: t('Superpón hasta 5 curvas de retención. Descubre qué formato, duración o estilo de intro retiene mejor.', 'Overlay up to 5 retention curves. Discover which format, duration, or intro style retains best.') },
    { title: t('Retención media del canal', 'Channel Average Retention'), desc: t('Conoce tu retención media para usarla como benchmark. Cada nuevo vídeo debería superar tu media.', 'Know your average retention to use as a benchmark. Each new video should beat your average.') },
  ];

  const steps = [
    { step: '1', title: t('Conecta tu canal', 'Connect your channel'), desc: t('Autoriza YouTube Analytics para que podamos leer los datos de retención de tus vídeos.', 'Authorize YouTube Analytics so we can read retention data from your videos.') },
    { step: '2', title: t('Selecciona un vídeo', 'Select a video'), desc: t('Elige cualquier vídeo de tu canal. Los datos aparecen al instante con la curva y el hook score.', 'Choose any video from your channel. Data appears instantly with the curve and hook score.') },
    { step: '3', title: t('Analiza y mejora', 'Analyze and improve'), desc: t('Identifica tus drop-offs, lee las sugerencias de IA y aplícalas en tu próximo vídeo.', 'Identify your drop-offs, read AI suggestions, and apply them to your next video.') },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#22c55e' }}>
          {t('ANALIZADOR DE RETENCIÓN', 'RETENTION ANALYZER')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Descubre dónde tu audiencia', 'Discover Where Your Audience')}<br />
          <span style={{ color: 'var(--red)' }}>{t('deja de ver tus vídeos', 'Stops Watching')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('La retención es el factor #1 del algoritmo de YouTube. Analiza tu curva, hook score y drop-offs con IA para multiplicar tu watch time.',
            'Retention is YouTube\'s #1 algorithm factor. Analyze your curve, hook score, and drop-offs with AI to multiply your watch time.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            {t('Analizar retención — gratis', 'Analyze retention — free')}
          </Link>
          <Link href="/retention" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            {t('Ver mis curvas', 'See my curves')}
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('Todo lo que necesitas para dominar la retención', 'Everything you need to master retention')}
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
          {FAQ.map((item) => (
            <div key={item.q} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{item.q}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ_ES.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) }) }} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'YTubViral — Retention Analyzer',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/retention-analyzer',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">{t('¿Listo para mejorar tu retención?', 'Ready to improve your retention?')}</h2>
        <p className="text-zinc-400 mb-8">{t('Gratis para siempre. Sin tarjeta. Empieza en 10 segundos.', 'Free forever. No credit card. Start in 10 seconds.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">{t('Analizar mi retención — gratis', 'Analyze my retention — free')}</Link>
      </section>
    </div>
  );
}
