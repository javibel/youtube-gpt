import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { LEARN_GUIDES } from '@/lib/learn-data';
import GuideCard from '@/components/GuideCard';

export const metadata: Metadata = {
  title: 'YouTube Learning Hub — Free Creator Guides',
  description:
    '14 guías gratuitas paso a paso para crecer en YouTube: SEO, keywords, retención, thumbnails, analytics, A/B testing, coaching IA y más.',
  alternates: { canonical: 'https://ytubviral.com/features/learning-hub' },
  openGraph: {
    title: 'YouTube Learning Hub — Free Creator Guides',
    description: '14 practical, data-driven guides to master YouTube growth. From SEO basics to AI coaching and advanced analytics.',
    url: 'https://ytubviral.com/features/learning-hub',
    type: 'website',
    images: [{ url: '/og-learning-hub.webp', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube Learning Hub — Free Creator Guides',
    description: '14 guías gratuitas paso a paso para crecer en YouTube: SEO, keywords, retención, thumbnails, analytics, A/B testing, coaching IA y más.',
    images: ['/og-learning-hub.webp'],
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
          {LEARN_GUIDES.map((g) => (
            <GuideCard key={g.slug} guide={g} lang={lang} linkPrefix="/features/learning-hub/" />
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
            name: 'YTubViral — Learning Hub',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/learning-hub',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
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
