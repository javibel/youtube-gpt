import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerLang } from '@/lib/server-lang';
import RelatedTools from '@/components/RelatedTools';


export const metadata: Metadata = {
  title: 'YouTube Video Predictor — AI Views Estimator',
  description:
    'Predice el rendimiento de tu vídeo de YouTube antes de publicarlo: vistas estimadas, engagement, potencial viral y sugerencias de IA.',
  alternates: { canonical: 'https://ytubviral.com/features/video-predictor' },
  openGraph: {
    title: 'YouTube Video Predictor — AI Performance Estimation',
    description: 'Estimate views, engagement, and viral potential before uploading. AI-powered predictions.',
    url: 'https://ytubviral.com/features/video-predictor',
    type: 'website',
    images: [{ url: '/og-video-predictor.webp', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube Video Performance Predictor — AI Views Estimator',
    description: 'Predice el rendimiento de tu vídeo de YouTube antes de publicarlo: vistas estimadas, engagement, potencial viral y sugerencias de IA.',
    images: ['/og-video-predictor.webp'],
  },
};

const FAQ_ES = [
  { q: '¿Cómo predice las vistas?', a: 'Combinamos el rendimiento histórico de tu canal (media de vistas, top vídeos, engagement) con el análisis del título, tema y SEO que introduces. El resultado es un rango bajo-medio-alto de vistas estimadas.' },
  { q: '¿Qué es el Viral Potential?', a: 'Es un indicador (bajo, medio, alto) que estima la probabilidad de que tu vídeo supere significativamente tu media de vistas. Se basa en la fuerza del título, el potencial del tema y tu histórico.' },
  { q: '¿Qué tan precisas son las predicciones?', a: 'Son estimaciones orientativas, no garantías. El rango medio suele acertar en el 60-70% de los casos. Úsalas para priorizar qué vídeos crear primero, no como predicciones exactas.' },
  { q: '¿Qué datos necesita?', a: 'Tu canal de YouTube conectado (para los datos base) + el título del vídeo que planeas publicar. Opcionalmente, puedes añadir descripción y tags para mejorar la predicción.' },
  { q: '¿Me dice cómo mejorar antes de publicar?', a: 'Sí. Además de las predicciones numéricas, te da fortalezas, debilidades y una sugerencia concreta para maximizar el rendimiento del vídeo.' },
];

const FAQ_EN = [
  { q: 'How does it predict views?', a: 'We combine your channel\'s historical performance (average views, top videos, engagement) with analysis of the title, topic, and SEO you enter. The result is a low-mid-high estimated views range.' },
  { q: 'What is Viral Potential?', a: 'An indicator (low, medium, high) estimating the probability your video significantly exceeds your average views. Based on title strength, topic potential, and your history.' },
  { q: 'How accurate are the predictions?', a: 'They\'re directional estimates, not guarantees. The mid-range is accurate in ~60-70% of cases. Use them to prioritize which videos to create first, not as exact predictions.' },
  { q: 'What data does it need?', a: 'Your connected YouTube channel (for baseline data) + the title of the video you plan to publish. Optionally, add description and tags for better predictions.' },
  { q: 'Does it tell me how to improve before publishing?', a: 'Yes. Beyond the numbers, it gives you strengths, weaknesses, and a concrete suggestion to maximize the video\'s performance.' },
];

export default async function VideoPredictorFeature() {
  const lang = getServerLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const features = [
    { title: t('Rango de vistas estimado', 'Estimated Views Range'), desc: t('Predicción baja, media y alta de vistas basada en tu canal y el vídeo que planeas publicar.', 'Low, mid, and high view prediction based on your channel and the video you plan to upload.') },
    { title: t('Viral Potential', 'Viral Potential'), desc: t('Indicador de probabilidad viral: bajo, medio o alto. ¿Este vídeo puede superar tu media?', 'Viral probability indicator: low, medium, or high. Can this video beat your average?') },
    { title: t('Title Score', 'Title Score'), desc: t('Puntuación del título: CTR potencial, claridad, keywords y gancho emocional.', 'Title score: potential CTR, clarity, keywords, and emotional hook.') },
    { title: t('SEO Score', 'SEO Score'), desc: t('Evaluación de la optimización SEO del título y la descripción que introduces.', 'Evaluation of SEO optimization for the title and description you enter.') },
    { title: t('Fortalezas y debilidades', 'Strengths & Weaknesses'), desc: t('Lista clara de lo que tu vídeo hace bien y lo que podría mejorar antes de publicar.', 'Clear list of what your video does well and what could improve before publishing.') },
    { title: t('Sugerencia de mejora', 'Improvement Suggestion'), desc: t('Un consejo concreto y accionable para maximizar el rendimiento del vídeo.', 'A concrete, actionable tip to maximize the video\'s performance.') },
  ];

  const steps = [
    { step: '1', title: t('Introduce tu idea', 'Enter your idea'), desc: t('Escribe el título (y opcionalmente descripción) del vídeo que planeas publicar.', 'Type the title (and optionally description) of the video you plan to publish.') },
    { step: '2', title: t('La IA analiza', 'AI analyzes'), desc: t('Combinamos tu historial de canal con el análisis del título, tema y SEO para generar la predicción.', 'We combine your channel history with title, topic, and SEO analysis to generate the prediction.') },
    { step: '3', title: t('Decide con datos', 'Decide with data'), desc: t('Si el Viral Potential es alto, prioriza ese vídeo. Si es bajo, mejora el título o cambia de tema antes de invertir horas en producción.', 'If Viral Potential is high, prioritize that video. If low, improve the title or switch topics before investing hours in production.') },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#B388FF' }}>
          {t('PREDICTOR DE RENDIMIENTO', 'PERFORMANCE PREDICTOR')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Predice las vistas', 'Predict Your Views')}<br />
          <span style={{ color: 'var(--red)' }}>{t('antes de publicar', 'Before You Publish')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('¿Merece la pena invertir 10 horas en este vídeo? La IA te da un rango de vistas estimado, viral potential y sugerencias para maximizar el impacto.',
            'Is it worth investing 10 hours in this video? AI gives you an estimated views range, viral potential, and suggestions to maximize impact.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">{t('Probar el predictor — gratis', 'Try the predictor — free')}</Link>
          <Link href="/predictor" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">{t('Predecir mi vídeo', 'Predict my video')}</Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">{t('Qué obtienes', 'What you get')}</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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

      <RelatedTools slug="video-predictor" lang={lang} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ_ES.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) }) }} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'YTubViral — Video Predictor',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/video-predictor',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">{t('¿Listo para predecir tu próximo hit?', 'Ready to predict your next hit?')}</h2>
        <p className="text-zinc-400 mb-8">{t('Gratis para siempre. Sin tarjeta. Empieza en 10 segundos.', 'Free forever. No credit card. Start in 10 seconds.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">{t('Empezar a predecir — gratis', 'Start predicting — free')}</Link>
      </section>
    </div>
  );
}
