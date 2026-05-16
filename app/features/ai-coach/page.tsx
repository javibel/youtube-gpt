import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'YouTube AI Coach — Personalized Growth Assistant | YTubViral',
  description:
    'Tu coach personal de IA para YouTube: crea contenido, analiza rendimiento, optimiza SEO e investiga nichos. Todo vía chat.',
  alternates: { canonical: 'https://ytubviral.com/features/ai-coach' },
  openGraph: {
    title: 'YouTube AI Coach | YTubViral',
    description: 'Personal AI coach for YouTube growth. Create, analyze, optimize, and research — all via chat.',
    url: 'https://ytubviral.com/features/ai-coach',
    type: 'website',
  },
};

const FAQ_ES = [
  { q: '¿Qué puede hacer el AI Coach?', a: 'Cuatro modos: Crear (ideas, títulos, scripts, hooks), Analizar (rendimiento, métricas, crecimiento), Optimizar (SEO, títulos, descripciones, tags) e Investigar (nicho, competencia, keywords, gaps). Todo mediante chat conversacional.' },
  { q: '¿Conoce los datos de mi canal?', a: 'Si tienes YouTube conectado, el coach tiene contexto de tu canal: suscriptores, vistas medias, nicho y rendimiento. Sus consejos son personalizados, no genéricos.' },
  { q: '¿Es como ChatGPT pero para YouTube?', a: 'Sí, pero mejor. Está entrenado específicamente en estrategia de YouTube, tiene acceso a tus datos de canal y ofrece sugerencias basadas en lo que realmente funciona en la plataforma.' },
  { q: '¿Cuántas conversaciones puedo tener?', a: 'El plan gratuito incluye mensajes limitados al día. El plan Pro ofrece mensajes ilimitados con respuestas más detalladas y acceso a datos avanzados del canal.' },
  { q: '¿El historial de chat se guarda?', a: 'La conversación se mantiene durante la sesión. En próximas actualizaciones añadiremos historial persistente para que el coach recuerde tus objetivos y progreso.' },
];

const FAQ_EN = [
  { q: 'What can the AI Coach do?', a: 'Four modes: Create (ideas, titles, scripts, hooks), Analyze (performance, metrics, growth), Optimize (SEO, titles, descriptions, tags), and Research (niche, competition, keywords, gaps). All via conversational chat.' },
  { q: 'Does it know my channel data?', a: 'If you have YouTube connected, the coach has context about your channel: subscribers, average views, niche, and performance. Its advice is personalized, not generic.' },
  { q: 'Is it like ChatGPT but for YouTube?', a: 'Yes, but better. It\'s specifically trained in YouTube strategy, has access to your channel data, and offers suggestions based on what actually works on the platform.' },
  { q: 'How many conversations can I have?', a: 'The free plan includes limited messages per day. Pro offers unlimited messages with more detailed responses and access to advanced channel data.' },
  { q: 'Is chat history saved?', a: 'The conversation persists during the session. In upcoming updates we\'ll add persistent history so the coach remembers your goals and progress.' },
];

export default async function AICoachFeature() {
  const cookieStore = await cookies();
  const lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const modes = [
    { title: t('Crear', 'Create'), desc: t('Ideas de vídeos, títulos virales, scripts completos, hooks para los primeros 5 segundos. Pídele lo que necesites y lo genera al instante.', 'Video ideas, viral titles, full scripts, hooks for the first 5 seconds. Ask for what you need and it generates instantly.'), color: '#00E5FF' },
    { title: t('Analizar', 'Analyze'), desc: t('Pregúntale sobre tu rendimiento: "¿Por qué este vídeo tuvo menos vistas?", "¿Qué patrón tienen mis vídeos más exitosos?", "¿Estoy creciendo?"', 'Ask about your performance: "Why did this video get fewer views?", "What pattern do my top videos share?", "Am I growing?"'), color: '#22c55e' },
    { title: t('Optimizar', 'Optimize'), desc: t('Dale un título o descripción y te dice cómo mejorarlos. Analiza SEO, legibilidad, CTR potencial y sugiere alternativas.', 'Give it a title or description and it tells you how to improve. Analyzes SEO, readability, potential CTR, and suggests alternatives.'), color: '#eab308' },
    { title: t('Investigar', 'Research'), desc: t('Pregúntale sobre tu nicho, competencia o tendencias. "¿Qué keywords están subiendo?", "¿Qué hace diferente este canal?", "¿Hay gaps de contenido?"', 'Ask about your niche, competition, or trends. "What keywords are rising?", "What makes this channel different?", "Are there content gaps?"'), color: '#B388FF' },
  ];

  const benefits = [
    { title: t('Contexto de tu canal', 'Channel Context'), desc: t('No es un chatbot genérico. Conoce tu nicho, suscriptores, rendimiento medio y estilo de contenido.', 'Not a generic chatbot. It knows your niche, subscribers, average performance, and content style.') },
    { title: t('Respuestas accionables', 'Actionable Answers'), desc: t('No te dice "mejora tu SEO". Te dice exactamente qué cambiar en tu título, qué keyword añadir y por qué.', 'Doesn\'t say "improve your SEO". Tells you exactly what to change in your title, what keyword to add, and why.') },
    { title: t('Sugerencias predefinidas', 'Pre-built Suggestions'), desc: t('Cada modo viene con sugerencias rápidas para que no partas de cero. Un clic y ya tienes tu respuesta.', 'Each mode comes with quick suggestions so you don\'t start from scratch. One click and you have your answer.') },
    { title: t('Conversación natural', 'Natural Conversation'), desc: t('Habla como con un experto de YouTube. Haz follow-ups, pide más detalle, cambia de tema. El coach se adapta.', 'Talk like you would with a YouTube expert. Ask follow-ups, request more detail, change topics. The coach adapts.') },
    { title: t('Powered by Claude', 'Powered by Claude'), desc: t('Usa Claude de Anthropic, uno de los modelos de IA más avanzados del mundo, afinado para estrategia de YouTube.', 'Uses Claude by Anthropic, one of the world\'s most advanced AI models, fine-tuned for YouTube strategy.') },
    { title: t('Bilingüe nativo', 'Native Bilingual'), desc: t('Responde en español o inglés con la misma calidad. Entiende contexto cultural de ambos mercados.', 'Responds in Spanish or English with equal quality. Understands cultural context of both markets.') },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#FF00AA' }}>
          {t('COACH DE IA', 'AI COACH')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Tu experto de YouTube', 'Your YouTube Expert')}<br />
          <span style={{ color: 'var(--red)' }}>{t('disponible 24/7', 'Available 24/7')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('Un coach de IA que conoce tu canal y te ayuda a crear, analizar, optimizar e investigar. Como tener un consultor de YouTube en tu bolsillo.',
            'An AI coach that knows your channel and helps you create, analyze, optimize, and research. Like having a YouTube consultant in your pocket.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">{t('Hablar con el coach — gratis', 'Talk to the coach — free')}</Link>
          <Link href="/coach" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">{t('Ir al coach', 'Go to coach')}</Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">{t('4 modos, un solo coach', '4 modes, one coach')}</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {modes.map((m) => (
            <div key={m.title} className="soft-card p-5" style={{ borderLeft: `3px solid ${m.color}` }}>
              <h3 className="font-display font-bold text-base mb-2">{m.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">{t('Por qué es diferente', 'Why it\'s different')}</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((b) => (<div key={b.title} className="soft-card p-5"><h3 className="font-display font-bold text-base mb-2">{b.title}</h3><p className="text-zinc-400 text-sm leading-relaxed">{b.desc}</p></div>))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">{t('Preguntas frecuentes', 'Frequently asked questions')}</h2>
        <div className="space-y-6">
          {FAQ.map((item) => (<div key={item.q} className="soft-card p-5"><h3 className="font-display font-bold text-base mb-2">{item.q}</h3><p className="text-zinc-400 text-sm leading-relaxed">{item.a}</p></div>))}
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ_ES.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) }) }} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'YTubViral — AI Coach',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/ai-coach',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">{t('¿Listo para tener tu propio coach de YouTube?', 'Ready to have your own YouTube coach?')}</h2>
        <p className="text-zinc-400 mb-8">{t('Gratis para siempre. Sin tarjeta. Empieza en 10 segundos.', 'Free forever. No credit card. Start in 10 seconds.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">{t('Hablar con el coach — gratis', 'Talk to the coach — free')}</Link>
      </section>
    </div>
  );
}
