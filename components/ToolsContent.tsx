'use client';

import { useLang } from '@/components/LangProvider';
import PublicNav from '@/components/PublicNav';

interface Tool {
  href: string;
  icon: string;
  titleEs: string;
  titleEn: string;
  descEs: string;
  descEn: string;
  tagEs: string;
  tagEn: string;
  free: boolean;
}

interface Group {
  id: string;
  titleEs: string; titleEn: string;
  subtitleEs: string; subtitleEn: string;
  tools: Tool[];
}

const GROUPS: Group[] = [
  {
    id: 'instant',
    titleEs: 'Herramientas gratis instantáneas',
    titleEn: 'Instant free tools',
    subtitleEs: 'Sin registro, sin tarjeta — resultados en tu navegador al escribir.',
    subtitleEn: 'No signup, no card — results in your browser as you type.',
    tools: [
      {
        href: '/title-analyzer', icon: '/icons/title.webp', tagEs: 'GRATIS', tagEn: 'FREE', free: true,
        titleEs: 'Analizador de Títulos', titleEn: 'Title Analyzer',
        descEs: 'Puntúa cualquier título de YouTube de 0 a 100 con consejos de CTR y SEO al instante, antes de publicar.',
        descEn: 'Score any video title 0-100 with instant CTR & SEO tips, before you publish.',
      },
      {
        href: '/seo-score', icon: '/icons/bar-chart.webp', tagEs: 'GRATIS', tagEn: 'FREE', free: true,
        titleEs: 'Puntuación SEO', titleEn: 'SEO Score',
        descEs: 'Analiza cualquier vídeo publicado y obtén un SEO Score de 0 a 100 con recomendaciones.',
        descEn: 'Analyze any published video and get a 0-100 SEO score with recommendations.',
      },
      {
        href: '/ctr-calculator', icon: '/icons/target.webp', tagEs: 'GRATIS', tagEn: 'FREE', free: true,
        titleEs: 'Calculadora de CTR', titleEn: 'CTR Calculator',
        descEs: 'Calcula tu tasa de clics y compárala con las medias de YouTube.',
        descEn: 'Calculate your click-through rate and benchmark it against YouTube averages.',
      },
      {
        href: '/youtube-money-calculator', icon: '/icons/chart-up.webp', tagEs: 'GRATIS', tagEn: 'FREE', free: true,
        titleEs: 'Calculadora de Ingresos', titleEn: 'Money Calculator',
        descEs: 'Estima tus ganancias de AdSense a partir de tus visitas mensuales y nicho.',
        descEn: 'Estimate AdSense earnings from your monthly views and niche.',
      },
      {
        href: '/engagement-rate-calculator', icon: '/icons/community.webp', tagEs: 'GRATIS', tagEn: 'FREE', free: true,
        titleEs: 'Calculadora de Engagement', titleEn: 'Engagement Rate Calculator',
        descEs: 'Mide el engagement de un vídeo a partir de visitas, likes y comentarios.',
        descEn: 'Measure a video\'s engagement from views, likes and comments and benchmark it.',
      },
    ],
  },
  {
    id: 'discover',
    titleEs: 'Descubre y crea',
    titleEn: 'Discover & create',
    subtitleEs: 'Encuentra lo que funciona ahora y conviértelo en contenido.',
    subtitleEn: 'Find what works right now and turn it into content.',
    tools: [
      {
        href: '/youtube-title-ideas', icon: '/icons/bulb.webp', tagEs: 'GRATIS', tagEn: 'FREE', free: true,
        titleEs: 'Ideas de Títulos por Nicho', titleEn: 'Title Ideas by Niche',
        descEs: 'Decenas de ideas de títulos virales listas para usar: gaming, cocina, fitness y más.',
        descEn: 'Dozens of ready-to-use viral title ideas for your niche: gaming, cooking, fitness and more.',
      },
      {
        href: '/trends', icon: '/icons/trend.webp', tagEs: 'GRATIS', tagEn: 'FREE', free: true,
        titleEs: 'Explorador de Tendencias', titleEn: 'Trending Explorer',
        descEs: 'Los 20 vídeos más explosivos ahora mismo en 6 países. Actualizado cada 30 minutos.',
        descEn: 'The 20 most explosive videos right now across 6 countries. Updated every 30 minutes.',
      },
      {
        href: '/generate', icon: '/icons/magic-wand.webp', tagEs: '10 GRATIS/MES', tagEn: '10 FREE/MO', free: true,
        titleEs: 'Generador con IA', titleEn: 'AI Generator',
        descEs: 'Títulos, descripciones, scripts, captions y miniaturas generados con IA optimizada para YouTube.',
        descEn: 'Titles, descriptions, scripts, captions and thumbnails generated with YouTube-optimized AI.',
      },
      {
        href: '/embed', icon: '/icons/globe.webp', tagEs: 'GRATIS', tagEn: 'FREE', free: true,
        titleEs: 'Widget Embebible', titleEn: 'Embeddable Widget',
        descEs: 'Añade el analizador SEO a tu web con una línea de HTML. Gratis e ilimitado.',
        descEn: 'Add the SEO analyzer to your site with one line of HTML. Free and unlimited.',
      },
      {
        href: '/youtube-title-study', icon: '/icons/bar-chart.webp', tagEs: 'DATOS REALES', tagEn: 'REAL DATA', free: true,
        titleEs: 'Estudio: Anatomía de un Título Viral', titleEn: 'Study: Anatomy of a Viral Title',
        descEs: '1.814 títulos de YouTube analizados con la API oficial — qué diferencia a los más vistos de cada nicho.',
        descEn: '1,814 YouTube titles analyzed with the official API — what sets the most-viewed apart in each niche.',
      },
      {
        href: '/features/learning-hub', icon: '/icons/graduation.webp', tagEs: 'GRATIS', tagEn: 'FREE', free: true,
        titleEs: 'Learning Hub', titleEn: 'Learning Hub',
        descEs: '14 guías gratuitas paso a paso sobre SEO, retención, thumbnails, analytics y más.',
        descEn: '14 free step-by-step guides on SEO, retention, thumbnails, analytics, and more.',
      },
    ],
  },
  {
    id: 'pro',
    titleEs: 'Herramientas Pro',
    titleEn: 'Pro tools',
    subtitleEs: 'Investigación más profunda y datos de canal con una cuenta Pro.',
    subtitleEn: 'Deeper research and channel data with a Pro account.',
    tools: [
      {
        href: '/features/keyword-research', icon: '/icons/key.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'Investigación de Keywords', titleEn: 'Keyword Research',
        descEs: 'Encuentra las palabras clave que busca tu audiencia. Volumen, competencia y sugerencias relacionadas.',
        descEn: 'Find the keywords your audience searches for. Volume, competition, and related suggestions.',
      },
      {
        href: '/features/competitor-analysis', icon: '/icons/swords.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'Análisis de Competidores', titleEn: 'Competitor Analysis',
        descEs: 'Analiza cualquier canal: mejores vídeos, keywords que usan, frecuencia de publicación.',
        descEn: 'Analyze any channel: top videos, keywords they use, publishing frequency.',
      },
      {
        href: '/features/ab-testing', icon: '/icons/split.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'A/B Test para tus títulos de YouTube', titleEn: 'A/B Test Your YouTube Titles',
        descEs: 'Testea automáticamente dos títulos por vídeo, mide el CTR y aplica el ganador con un clic.',
        descEn: 'Automatically A/B test two titles per video, track CTR, and apply the winner in one click.',
      },
      {
        href: '/features/ai-coach', icon: '/icons/brain.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'Coach IA de YouTube', titleEn: 'AI YouTube Coach',
        descEs: 'Coach de IA que conoce tu canal y te ayuda a crear, analizar, optimizar e investigar por chat.',
        descEn: 'AI coach that knows your channel and helps you create, analyze, optimize, and research via chat.',
      },
      {
        href: '/features/content-calendar', icon: '/icons/clipboard.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'Calendario de Contenido', titleEn: 'Content Calendar',
        descEs: 'Calendario visual para planificar, programar y trackear tus vídeos, de la idea a la publicación.',
        descEn: 'Visual calendar to plan, schedule, and track your videos, from idea to publication.',
      },
      {
        href: '/features/channel-analytics', icon: '/icons/chart-up.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'Analytics del Canal', titleEn: 'Channel Analytics',
        descEs: 'Dashboard avanzado: vistas diarias, fuentes de tráfico, países, top vídeos y suscriptores.',
        descEn: 'Advanced dashboard: daily views, traffic sources, countries, top videos, and subscribers.',
      },
      {
        href: '/features/retention-analyzer', icon: '/icons/bar-chart.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'Analizador de Retención', titleEn: 'Retention Analyzer',
        descEs: 'Analiza tu curva de retención, hook score y drop-offs con IA para multiplicar tu watch time.',
        descEn: 'Analyze your retention curve, hook score, and drop-offs with AI to multiply your watch time.',
      },
      {
        href: '/features/video-predictor', icon: '/icons/crystal-ball.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'Predictor de Vídeo', titleEn: 'Video Predictor',
        descEs: 'La IA estima un rango de vistas, potencial viral y sugerencias antes de subir tu vídeo.',
        descEn: 'AI estimates a views range, viral potential, and suggestions before you upload.',
      },
      {
        href: '/features/best-time', icon: '/icons/clock-fast.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'Mejor Hora para Publicar', titleEn: 'Best Time to Post',
        descEs: 'Heatmap 7×24 y tus 3 mejores horarios, calculados con el rendimiento real de tus vídeos.',
        descEn: '7×24 heatmap and your top 3 time slots, calculated from your own videos\' real performance.',
      },
      {
        href: '/features/revenue-estimator', icon: '/icons/diamond.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'Estimador de Ingresos', titleEn: 'Revenue Estimator',
        descEs: 'Estima ingresos de cualquier canal con datos reales de CPM en más de 40 países.',
        descEn: 'Estimate any channel\'s earnings with real CPM data across 40+ countries.',
      },
      {
        href: '/features/trend-explorer', icon: '/icons/trend.webp', tagEs: 'PRO', tagEn: 'PRO', free: false,
        titleEs: 'Explorador de Tendencias Pro', titleEn: 'Pro Trend Explorer',
        descEs: 'Descubre qué se viraliza ahora en 12 países, filtra por categoría e idioma.',
        descEn: 'Discover what\'s going viral now across 12 countries, filter by category and language.',
      },
    ],
  },
];

export default function ToolsContent() {
  const lang = useLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <PublicNav />

      <div className="max-w-4xl mx-auto px-6 py-16">
        <header className="text-center mb-14">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('HERRAMIENTAS GRATIS', 'FREE TOOLS')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4">
            {t('Herramientas Gratis de YouTube', 'Free YouTube Tools')}
          </h1>
          <p className="font-mono-jb text-sm max-w-lg mx-auto" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Analiza, optimiza y haz crecer tu canal de YouTube con herramientas profesionales. Sin tarjeta de crédito.',
              'Analyze, optimize and grow your YouTube channel with professional tools. No credit card required.',
            )}
          </p>
        </header>

        <div className="space-y-12">
          {GROUPS.map(group => (
            <section key={group.id}>
              <div className="mb-5">
                <h2 className="font-display font-bold text-xl text-white">
                  {t(group.titleEs, group.titleEn)}
                </h2>
                <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>
                  {t(group.subtitleEs, group.subtitleEn)}
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                {group.tools.map(tool => (
                  <a
                    key={tool.href}
                    href={tool.href}
                    className="group p-6 rounded-xl transition"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--yv-border)' }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <img src={tool.icon} alt="" width={40} height={40} className="object-contain" />
                      <span
                        className="font-mono-jb text-[11px] tracking-wider font-bold px-2 py-0.5 rounded"
                        style={{
                          background: tool.free ? 'rgba(0,255,163,0.1)' : 'rgba(232,77,91,0.1)',
                          color: tool.free ? '#00FFA3' : '#e84d5b',
                          border: tool.free ? '1px solid rgba(0,255,163,0.3)' : '1px solid rgba(232,77,91,0.3)',
                        }}
                      >
                        {t(tool.tagEs, tool.tagEn)}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-lg text-white mb-2 group-hover:text-[#e84d5b] transition">
                      {t(tool.titleEs, tool.titleEn)}
                    </h3>
                    <p className="font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
                      {t(tool.descEs, tool.descEn)}
                    </p>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 text-center">
          <p className="font-mono-jb text-sm mb-4" style={{ color: 'var(--yv-text-3)' }}>
            {t('¿Quieres acceso a todas las herramientas?', 'Want access to all the tools?')}
          </p>
          <a href="/signup" className="btn-offset inline-flex px-8 py-3.5 text-sm font-display font-bold">
            {t('Crear cuenta gratis →', 'Create free account →')}
          </a>
        </div>
      </div>
    </div>
  );
}
