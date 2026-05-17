import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'YouTube AI Content Generator — Titles, Scripts & More',
  description:
    'Genera contenido para YouTube con IA: títulos, guiones, descripciones, hooks para Shorts y más. 9 plantillas listas para usar.',
  alternates: { canonical: 'https://ytubviral.com/features/ai-generator' },
  openGraph: {
    title: 'YouTube AI Content Generator',
    description: 'Generate titles, scripts, descriptions, and more for YouTube with AI. 9 templates, free.',
    url: 'https://ytubviral.com/features/ai-generator',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube AI Content Generator — Titles, Scripts & More',
    description: 'Genera contenido para YouTube con IA: títulos, guiones, descripciones, hooks para Shorts y más. 9 plantillas listas para usar.',
    images: ['/og-image.png'],
  },
};

const FAQ_ES = [
  { q: '¿Qué tipo de contenido puedo generar?', a: 'Títulos virales, descripciones SEO, scripts completos, captions/subtítulos, ideas de thumbnails, hooks para Shorts, planes de series y análisis de nicho. 9 plantillas distintas.' },
  { q: '¿Qué IA usa el generador?', a: 'Usamos Claude de Anthropic, uno de los modelos de lenguaje más avanzados. Está entrenado específicamente para entender YouTube: algoritmo, SEO, retención y engagement.' },
  { q: '¿En qué idiomas funciona?', a: 'Genera contenido nativo en español e inglés. Puedes escribir el tema en cualquier idioma y el resultado se adapta a tu preferencia.' },
  { q: '¿Cuántas generaciones puedo hacer?', a: 'El plan gratuito incluye 10 generaciones diarias. El plan Pro ofrece generaciones ilimitadas con modelos más potentes.' },
  { q: '¿Los scripts son originales?', a: 'Sí. Cada script se genera desde cero basándose en tu tema, tono y duración. No son plantillas genéricas — son contenido original adaptado a tu estilo.' },
];

const FAQ_EN = [
  { q: 'What kind of content can I generate?', a: 'Viral titles, SEO descriptions, full scripts, captions/subtitles, thumbnail ideas, Shorts hooks, series plans, and niche analysis. 9 different templates.' },
  { q: 'What AI powers the generator?', a: 'We use Claude by Anthropic, one of the most advanced language models. It\'s specifically tuned for YouTube: algorithm, SEO, retention, and engagement.' },
  { q: 'What languages does it support?', a: 'Generates native content in Spanish and English. You can write your topic in any language and the output adapts to your preference.' },
  { q: 'How many generations can I do?', a: 'The free plan includes 10 daily generations. Pro offers unlimited generations with more powerful models.' },
  { q: 'Are the scripts original?', a: 'Yes. Each script is generated from scratch based on your topic, tone, and duration. Not generic templates — original content adapted to your style.' },
];

export default async function AIGeneratorFeature() {
  const cookieStore = await cookies();
  const lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const templates = [
    { title: t('Títulos virales', 'Viral Titles'), desc: t('5 títulos optimizados para CTR con diferentes estilos: curiosidad, números, urgencia, contraste.', '5 CTR-optimized titles with different styles: curiosity, numbers, urgency, contrast.'), est: '8s' },
    { title: t('Descripciones SEO', 'SEO Descriptions'), desc: t('Descripción completa con keywords, timestamps, CTA y links. Lista para copiar y pegar en YouTube.', 'Full description with keywords, timestamps, CTA, and links. Ready to copy-paste into YouTube.'), est: '12s' },
    { title: t('Scripts completos', 'Full Scripts'), desc: t('Guión con hook, desarrollo y cierre. Adaptado a tu duración objetivo (5, 10, 15, 20+ minutos).', 'Script with hook, body, and closing. Adapted to your target duration (5, 10, 15, 20+ min).'), est: '30s' },
    { title: t('Captions / Subtítulos', 'Captions / Subtitles'), desc: t('Subtítulos para redes sociales: Instagram, TikTok, X. Adaptados al tono de cada plataforma.', 'Social media captions: Instagram, TikTok, X. Adapted to each platform\'s tone.'), est: '10s' },
    { title: t('Ideas de Thumbnail', 'Thumbnail Ideas'), desc: t('Concepto visual, texto sugerido, paleta de colores y composición para tu miniatura.', 'Visual concept, suggested text, color palette, and composition for your thumbnail.'), est: '5s' },
    { title: t('Hooks para Shorts', 'Shorts Hooks'), desc: t('Ganchos para los primeros 3 segundos que retienen al espectador. Frases que paran el scroll.', 'Hooks for the first 3 seconds that retain the viewer. Scroll-stopping lines.'), est: '6s' },
    { title: t('Plan de serie', 'Series Plan'), desc: t('Planifica 5-10 episodios interconectados. Títulos, ángulos y estrategia de engagement para cada uno.', 'Plan 5-10 interconnected episodes. Titles, angles, and engagement strategy for each.'), est: '60s' },
    { title: t('Análisis de nicho', 'Niche Analysis'), desc: t('Análisis completo de tu nicho: audiencia, competencia, oportunidades y estrategia recomendada.', 'Full niche analysis: audience, competition, opportunities, and recommended strategy.'), est: '45s' },
    { title: t('Video Tips', 'Video Tips'), desc: t('Consejos personalizados de producción, edición y presentación basados en tu tipo de contenido.', 'Personalized production, editing, and presentation tips based on your content type.'), est: '30s' },
  ];

  const steps = [
    { step: '1', title: t('Elige una plantilla', 'Choose a template'), desc: t('Selecciona entre 9 plantillas: títulos, scripts, descripciones, hooks, thumbnails y más.', 'Select from 9 templates: titles, scripts, descriptions, hooks, thumbnails, and more.') },
    { step: '2', title: t('Describe tu vídeo', 'Describe your video'), desc: t('Escribe el tema, elige tono (viral, profesional, casual, educativo) y ajusta la duración.', 'Enter the topic, choose tone (viral, professional, casual, educational), and set the duration.') },
    { step: '3', title: t('Genera con IA', 'Generate with AI'), desc: t('En segundos obtienes contenido profesional listo para usar. Copia, edita o regenera.', 'In seconds you get professional content ready to use. Copy, edit, or regenerate.') },
  ];

  const audiences = [
    { title: t('Creadores que empiezan', 'New creators'), desc: t('No sabes qué escribir en la descripción o cómo empezar el script. La IA te da un punto de partida profesional.', 'Don\'t know what to write in the description or how to start the script. AI gives you a professional starting point.') },
    { title: t('Creadores que publican mucho', 'High-volume creators'), desc: t('Publicas 3-5 vídeos por semana y necesitas producir títulos y descripciones rápido sin perder calidad.', 'You publish 3-5 videos per week and need to produce titles and descriptions quickly without losing quality.') },
    { title: t('Canales faceless / automatización', 'Faceless / automation channels'), desc: t('Genera scripts completos, descripciones y títulos para producción a escala. Ideal para canales de compilación o IA.', 'Generate complete scripts, descriptions, and titles for production at scale. Ideal for compilation or AI channels.') },
    { title: t('Creadores bilingües', 'Bilingual creators'), desc: t('Genera en español e inglés desde la misma herramienta. Perfecto para canales que publican en dos idiomas.', 'Generate in Spanish and English from the same tool. Perfect for channels publishing in two languages.') },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00E5FF' }}>
          {t('GENERADOR CON IA', 'AI GENERATOR')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('Genera contenido para YouTube', 'Generate YouTube Content')}<br />
          <span style={{ color: 'var(--red)' }}>{t('con inteligencia artificial', 'with artificial intelligence')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('Títulos, descripciones, scripts, hooks, thumbnails y más. 9 plantillas de IA entrenadas para YouTube. Resultados en segundos.',
            'Titles, descriptions, scripts, hooks, thumbnails, and more. 9 AI templates trained for YouTube. Results in seconds.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            {t('Empieza gratis', 'Start free')}
          </Link>
          <Link href="/generate" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            {t('Probar el generador', 'Try the generator')}
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('9 plantillas para todo tu contenido', '9 templates for all your content')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map((tpl) => (
            <div key={tpl.title} className="soft-card p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display font-bold text-base">{tpl.title}</h3>
                <span className="font-mono-jb text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--yv-text-3)' }}>~{tpl.est}</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">{tpl.desc}</p>
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
            name: 'YTubViral — AI Generator',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/ai-generator',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">
          {t('¿Listo para crear contenido 10x más rápido?', 'Ready to create content 10x faster?')}
        </h2>
        <p className="text-zinc-400 mb-8">{t('Gratis para siempre. Sin tarjeta. Empieza en 10 segundos.', 'Free forever. No credit card. Start in 10 seconds.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          {t('Empezar a generar — gratis', 'Start generating — free')}
        </Link>
      </section>
    </div>
  );
}
