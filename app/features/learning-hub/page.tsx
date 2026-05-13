import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'YouTube Learning Hub — Free Creator Guides | YTubViral',
  description:
    '14 free step-by-step guides to grow on YouTube: SEO, keyword research, retention, thumbnails, analytics, A/B testing, AI coaching, trends, and more. Guías gratuitas paso a paso para crecer en YouTube.',
  alternates: { canonical: 'https://ytubviral.com/features/learning-hub' },
  openGraph: {
    title: 'YouTube Learning Hub — Free Creator Guides | YTubViral',
    description: '14 practical, data-driven guides to master YouTube growth. From SEO basics to AI coaching and advanced analytics.',
    url: 'https://ytubviral.com/features/learning-hub',
    type: 'website',
  },
};

const FAQ_ES = [
  { q: '¿Las guías son realmente gratis?', a: 'Sí. Todas las guías del Learning Hub son 100% gratis y accesibles para cualquier usuario registrado. No necesitas plan Pro para aprender.' },
  { q: '¿Son guías genéricas o están basadas en datos?', a: 'Cada guía está escrita por creadores con experiencia real y se basa en datos del algoritmo de YouTube actualizados a 2026. Nada de consejos reciclados de 2020.' },
  { q: '¿Para qué nivel son?', a: 'Tenemos guías para principiantes (SEO básico, thumbnails), intermedios (retención, competidores) y avanzados (analytics profundo). Cada guía indica su nivel.' },
  { q: '¿Las guías se conectan con las herramientas de YTubViral?', a: 'Sí. Cada guía enlaza directamente a la herramienta relevante (SEO Score, Keyword Research, Competitor Tracking, etc.) para que puedas aplicar lo aprendido al instante.' },
  { q: '¿Con qué frecuencia se actualizan?', a: 'Revisamos y actualizamos las guías cada vez que YouTube cambia su algoritmo o lanza nuevas funcionalidades. Última actualización: mayo 2026.' },
  { q: '¿En qué orden debería seguir las guías?', a: 'Si empiezas de cero: SEO → Keywords → Thumbnails → Mejor Hora → Calendario → Crecimiento 0-1K. Si ya tienes canal: Retención → Analytics → Competidores → A/B Testing → AI Coach.' },
  { q: '¿Puedo usar las guías con la IA de YTubViral?', a: 'Sí. Cada guía enlaza a la herramienta de IA correspondiente. Por ejemplo, la guía de SEO te lleva al SEO Score, y la de contenido al AI Generator. Aprende la teoría y aplícala al instante con IA.' },
  { q: '¿Las guías funcionan para canales en español y en inglés?', a: 'Sí. Las estrategias son universales y funcionan en cualquier idioma. Además, todas las guías están disponibles en español e inglés.' },
];

const FAQ_EN = [
  { q: 'Are the guides really free?', a: 'Yes. All Learning Hub guides are 100% free and accessible to any registered user. No Pro plan needed to learn.' },
  { q: 'Are these generic guides or data-driven?', a: 'Every guide is written by experienced creators and based on up-to-date YouTube algorithm data for 2026. No recycled 2020 tips.' },
  { q: 'What skill level are they for?', a: 'We have guides for beginners (basic SEO, thumbnails), intermediate (retention, competitors), and advanced (deep analytics). Each guide shows its level.' },
  { q: 'Do the guides connect to YTubViral tools?', a: 'Yes. Each guide links directly to the relevant tool (SEO Score, Keyword Research, Competitor Tracking, etc.) so you can apply what you learn instantly.' },
  { q: 'How often are they updated?', a: 'We review and update guides every time YouTube changes its algorithm or launches new features. Last update: May 2026.' },
  { q: 'What order should I follow the guides?', a: 'If starting from zero: SEO → Keywords → Thumbnails → Best Time → Calendar → Growth 0-1K. If you already have a channel: Retention → Analytics → Competitors → A/B Testing → AI Coach.' },
  { q: 'Can I use the guides with YTubViral AI?', a: 'Yes. Each guide links to the corresponding AI tool. For example, the SEO guide leads to SEO Score, and the content guide to AI Generator. Learn the theory and apply it instantly with AI.' },
  { q: 'Do the guides work for channels in any language?', a: 'Yes. The strategies are universal and work in any language. Plus, all guides are available in both Spanish and English.' },
];

export default async function LearningHubFeature() {
  const cookieStore = await cookies();
  const lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const guides = [
    { title: t('SEO en YouTube: Guía completa', 'YouTube SEO: Complete Guide'), desc: t('Aprende a optimizar títulos, descripciones, tags y thumbnails para que tus vídeos aparezcan en búsquedas y recomendaciones.', 'Learn to optimize titles, descriptions, tags, and thumbnails so your videos appear in search and recommendations.'), level: t('Principiante', 'Beginner'), color: '#22c55e' },
    { title: t('Keyword Research para YouTube', 'Keyword Research for YouTube'), desc: t('Encuentra las palabras clave que tu audiencia está buscando y que tienen poca competencia. Metodología paso a paso.', 'Find keywords your audience is searching for with low competition. Step-by-step methodology.'), level: t('Principiante', 'Beginner'), color: '#22c55e' },
    { title: t('Mejorar retención de audiencia', 'Improve Audience Retention'), desc: t('La retención es el factor #1 del algoritmo. Técnicas de hook, pattern interrupts y open loops para mantener a tu audiencia.', 'Retention is the #1 algorithm factor. Hook techniques, pattern interrupts, and open loops to keep your audience.'), level: t('Intermedio', 'Intermediate'), color: '#eab308' },
    { title: t('Thumbnails que generan clics', 'Thumbnails That Get Clicks'), desc: t('Principios de diseño probados: contraste de colores, tipografía, expresiones faciales y tests A/B para maximizar CTR.', 'Proven design principles: color contrast, typography, facial expressions, and A/B tests to maximize CTR.'), level: t('Principiante', 'Beginner'), color: '#22c55e' },
    { title: t('Análisis avanzado con YouTube Analytics', 'Advanced YouTube Analytics'), desc: t('Lee tus datos privados de YouTube como un profesional: fuentes de tráfico, watch time, conversión a suscriptores y tendencias.', 'Read your private YouTube data like a pro: traffic sources, watch time, subscriber conversion, and trends.'), level: t('Avanzado', 'Advanced'), color: '#ef4444' },
    { title: t('Estrategia de crecimiento 0 a 1K subs', 'Growth Strategy 0 to 1K Subs'), desc: t('Los primeros 1000 suscriptores son los más difíciles. Plan paso a paso: nicho, consistencia, colaboraciones y herramientas.', 'The first 1000 subscribers are the hardest. Step-by-step plan: niche, consistency, collabs, and tools.'), level: t('Principiante', 'Beginner'), color: '#22c55e' },
    { title: t('Análisis de competidores', 'Competitor Analysis'), desc: t('Aprende de los que ya lo están haciendo bien. Identifica sus patrones, encuentra huecos de contenido y descubre tu ventaja.', 'Learn from those already doing well. Identify their patterns, find content gaps, and discover your edge.'), level: t('Intermedio', 'Intermediate'), color: '#eab308' },
    { title: t('A/B Testing de títulos y thumbnails', 'A/B Testing Titles & Thumbnails'), desc: t('Deja de adivinar qué funciona. Testea variaciones de título y thumbnail y deja que los datos elijan al ganador.', 'Stop guessing what works. Test title and thumbnail variations and let data pick the winner.'), level: t('Intermedio', 'Intermediate'), color: '#eab308' },
    { title: t('Mejor hora para publicar', 'Best Time to Publish'), desc: t('Publica cuando tu audiencia está activa para maximizar el impulso inicial y las recomendaciones del algoritmo.', 'Publish when your audience is active to maximize initial momentum and algorithm recommendations.'), level: t('Principiante', 'Beginner'), color: '#22c55e' },
    { title: t('Cómo aprovechar las tendencias', 'How to Ride Trends'), desc: t('Detecta temas en auge antes que tu competencia y crea contenido oportuno que el algoritmo quiere recomendar.', 'Spot rising topics before competitors and create timely content the algorithm wants to recommend.'), level: t('Intermedio', 'Intermediate'), color: '#eab308' },
    { title: t('Generar contenido con IA', 'Generate Content with AI'), desc: t('Usa la IA como copiloto para generar ideas, títulos, descripciones y guiones optimizados para SEO en segundos.', 'Use AI as your copilot to generate ideas, titles, descriptions, and SEO-optimized scripts in seconds.'), level: t('Principiante', 'Beginner'), color: '#22c55e' },
    { title: t('Calendario de contenido', 'Content Calendar'), desc: t('Planifica tu contenido con estrategia. La consistencia es lo que separa a los canales que crecen de los que se estancan.', 'Plan your content strategically. Consistency separates growing channels from stagnant ones.'), level: t('Intermedio', 'Intermediate'), color: '#eab308' },
    { title: t('Predictor de rendimiento', 'Performance Predictor'), desc: t('Anticipa cómo rendirá tu vídeo antes de publicar y optimiza título, thumbnail y descripción a tiempo.', 'Anticipate how your video will perform before publishing and optimize title, thumbnail, and description in time.'), level: t('Avanzado', 'Advanced'), color: '#ef4444' },
    { title: t('AI Coach personalizado', 'Personalized AI Coach'), desc: t('Recibe análisis personalizado de tu canal y recomendaciones accionables basadas en tus datos reales, no en consejos genéricos.', 'Get personalized channel analysis and actionable recommendations based on your real data, not generic tips.'), level: t('Avanzado', 'Advanced'), color: '#ef4444' },
  ];

  const benefits = [
    { title: t('Basado en datos reales', 'Based on real data'), desc: t('Nada de "sube buenos vídeos". Cada consejo está respaldado por métricas y datos del algoritmo de YouTube actualizados.', 'No "just upload good videos". Every tip is backed by metrics and up-to-date YouTube algorithm data.') },
    { title: t('Pasos concretos y aplicables', 'Concrete, actionable steps'), desc: t('Cada guía incluye pasos numerados que puedes aplicar inmediatamente. Sin teoría vacía.', 'Each guide includes numbered steps you can apply immediately. No empty theory.') },
    { title: t('Conectado a herramientas', 'Connected to tools'), desc: t('Cada guía enlaza a la herramienta de YTubViral relevante para que puedas practicar al momento.', 'Each guide links to the relevant YTubViral tool so you can practice right away.') },
    { title: t('Para todos los niveles', 'For all levels'), desc: t('Principiante, intermedio o avanzado — cada guía indica su nivel para que encuentres lo que necesitas.', 'Beginner, intermediate, or advanced — each guide shows its level so you find what you need.') },
    { title: t('Actualizado a 2026', 'Updated for 2026'), desc: t('El algoritmo de YouTube cambia constantemente. Nuestras guías reflejan las últimas actualizaciones y mejores prácticas.', 'YouTube\'s algorithm changes constantly. Our guides reflect the latest updates and best practices.') },
    { title: t('Bilingüe', 'Bilingual'), desc: t('Todas las guías disponibles en español e inglés. Aprende en tu idioma.', 'All guides available in Spanish and English. Learn in your language.') },
  ];

  const audiences = [
    { title: t('Nuevos creadores', 'New creators'), desc: t('Empieza con las bases correctas: SEO, keywords y thumbnails. Evita los errores que frenan al 90% de canales nuevos.', 'Start with the right foundations: SEO, keywords, and thumbnails. Avoid the mistakes that hold back 90% of new channels.') },
    { title: t('Creadores estancados', 'Plateaued creators'), desc: t('Si tus vistas no crecen, las guías de retención, analytics avanzado y análisis de competidores te ayudarán a romper el techo.', 'If your views aren\'t growing, the retention, advanced analytics, and competitor analysis guides will help you break through.') },
    { title: t('Equipos y agencias', 'Teams & agencies'), desc: t('Forma a tu equipo con las mismas guías. Metodologías estandarizadas para gestionar múltiples canales de forma consistente.', 'Train your team with the same guides. Standardized methodologies to manage multiple channels consistently.') },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#22c55e' }}>
          {t('CENTRO DE APRENDIZAJE', 'LEARNING HUB')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Aprende a crecer en YouTube', 'Learn to Grow on YouTube')}<br />
          <span style={{ color: 'var(--red)' }}>{t('con guías prácticas', 'with practical guides')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('14 guías paso a paso basadas en datos reales. SEO, keywords, retención, thumbnails, A/B testing, IA, tendencias, calendario y más. Todo lo que necesitas para pasar de 0 a viral.',
            '14 step-by-step guides based on real data. SEO, keywords, retention, thumbnails, A/B testing, AI, trends, calendar, and more. Everything you need to go from 0 to viral.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            {t('Empezar a aprender — gratis', 'Start learning — free')}
          </Link>
          <Link href="/learn" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            {t('Ver las guías', 'Browse guides')}
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('14 guías para dominar YouTube', '14 guides to master YouTube')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {guides.map((g) => (
            <div key={g.title} className="soft-card p-5">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="font-display font-bold text-base">{g.title}</h3>
                <span className="font-mono-jb text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${g.color}22`, color: g.color }}>{g.level}</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4 text-center">
          {t('Rutas de aprendizaje recomendadas', 'Recommended learning paths')}
        </h2>
        <p className="text-zinc-400 text-center mb-10 max-w-2xl mx-auto">
          {t('No necesitas leer todo. Sigue la ruta que encaje con tu situación actual.',
            'You don\'t need to read everything. Follow the path that fits your current situation.')}
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="soft-card p-6">
            <h3 className="font-display font-bold text-base mb-1" style={{ color: '#22c55e' }}>
              {t('Canal nuevo (0-100 subs)', 'New channel (0-100 subs)')}
            </h3>
            <p className="text-zinc-500 text-xs font-mono-jb mb-3">{t('6 guías · ~45 min lectura', '6 guides · ~45 min read')}</p>
            <ol className="space-y-1.5 text-sm text-zinc-400">
              <li>1. {t('SEO en YouTube: Guía completa', 'YouTube SEO: Complete Guide')}</li>
              <li>2. {t('Keyword Research para YouTube', 'Keyword Research for YouTube')}</li>
              <li>3. {t('Thumbnails que generan clics', 'Thumbnails That Get Clicks')}</li>
              <li>4. {t('Mejor hora para publicar', 'Best Time to Publish')}</li>
              <li>5. {t('Generar contenido con IA', 'Generate Content with AI')}</li>
              <li>6. {t('Estrategia de crecimiento 0 a 1K', 'Growth Strategy 0 to 1K')}</li>
            </ol>
          </div>
          <div className="soft-card p-6">
            <h3 className="font-display font-bold text-base mb-1" style={{ color: '#eab308' }}>
              {t('Canal estancado (100-10K subs)', 'Plateaued channel (100-10K subs)')}
            </h3>
            <p className="text-zinc-500 text-xs font-mono-jb mb-3">{t('6 guías · ~45 min lectura', '6 guides · ~45 min read')}</p>
            <ol className="space-y-1.5 text-sm text-zinc-400">
              <li>1. {t('Mejorar retención de audiencia', 'Improve Audience Retention')}</li>
              <li>2. {t('Análisis avanzado con Analytics', 'Advanced YouTube Analytics')}</li>
              <li>3. {t('Análisis de competidores', 'Competitor Analysis')}</li>
              <li>4. {t('A/B Testing de títulos y thumbnails', 'A/B Testing Titles & Thumbnails')}</li>
              <li>5. {t('Calendario de contenido', 'Content Calendar')}</li>
              <li>6. {t('AI Coach personalizado', 'Personalized AI Coach')}</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('Por qué estas guías son diferentes', 'Why these guides are different')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((b) => (
            <div key={b.title} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{b.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          {t('¿Para quién es?', 'Who is this for?')}
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
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
          {t('¿Listo para aprender lo que funciona en YouTube?', 'Ready to learn what actually works on YouTube?')}
        </h2>
        <p className="text-zinc-400 mb-8">{t('Gratis para siempre. Sin tarjeta. Empieza en 10 segundos.', 'Free forever. No credit card. Start in 10 seconds.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          {t('Acceder al Learning Hub — gratis', 'Access the Learning Hub — free')}
        </Link>
      </section>
    </div>
  );
}
