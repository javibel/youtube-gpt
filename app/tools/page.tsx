'use client';

import { useLang } from '@/components/LangProvider';
import PublicNav from '@/components/PublicNav';

const TOOLS = [
  {
    href: '/seo-score',
    icon: '📊',
    color: '#e84d5b',
    title: { es: 'YouTube SEO Score', en: 'YouTube SEO Score' },
    desc: { es: 'Analiza cualquier vídeo y obtén una puntuación SEO de 0-100 con recomendaciones específicas.', en: 'Analyze any video and get a 0-100 SEO score with specific recommendations.' },
    tag: { es: 'GRATIS', en: 'FREE' },
  },
  {
    href: '/trends',
    icon: '🔥',
    color: '#FF8A00',
    title: { es: 'Trending Explorer', en: 'Trending Explorer' },
    desc: { es: 'Los 20 vídeos más explosivos del momento en 6 países. Actualizado cada 30 minutos.', en: 'The 20 most explosive videos right now across 6 countries. Updated every 30 minutes.' },
    tag: { es: 'GRATIS', en: 'FREE' },
  },
  {
    href: '/embed',
    icon: '🧩',
    color: '#00E5FF',
    title: { es: 'Widget Embebible', en: 'Embeddable Widget' },
    desc: { es: 'Añade el analizador SEO a tu web con una línea de HTML. Gratis y sin límites.', en: 'Add the SEO analyzer to your site with one line of HTML. Free and unlimited.' },
    tag: { es: 'GRATIS', en: 'FREE' },
  },
  {
    href: '/generate',
    icon: '✍️',
    color: '#FFE800',
    title: { es: 'Generador IA', en: 'AI Generator' },
    desc: { es: 'Títulos, descripciones, scripts, captions y thumbnails generados con IA optimizada para YouTube.', en: 'Titles, descriptions, scripts, captions and thumbnails generated with YouTube-optimized AI.' },
    tag: { es: '10 GRATIS/MES', en: '10 FREE/MO' },
  },
  {
    href: '/features/keyword-research',
    icon: '🔑',
    color: '#7CFF00',
    title: { es: 'Keyword Research', en: 'Keyword Research' },
    desc: { es: 'Encuentra las keywords que tu audiencia busca. Volumen, competencia y sugerencias relacionadas.', en: 'Find the keywords your audience searches for. Volume, competition, and related suggestions.' },
    tag: { es: 'PRO', en: 'PRO' },
  },
  {
    href: '/features/competitor-analysis',
    icon: '🕵️',
    color: '#B388FF',
    title: { es: 'Análisis de Competidores', en: 'Competitor Analysis' },
    desc: { es: 'Analiza cualquier canal: mejores vídeos, keywords que usan, frecuencia de publicación.', en: 'Analyze any channel: top videos, keywords they use, publishing frequency.' },
    tag: { es: 'PRO', en: 'PRO' },
  },
];

export default function ToolsPage() {
  const lang = useLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <PublicNav />

      <div className="max-w-4xl mx-auto px-6 py-16">
        <header className="text-center mb-14">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('HERRAMIENTAS GRATUITAS', 'FREE TOOLS')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4">
            {t('Herramientas YouTube Gratis', 'Free YouTube Tools')}
          </h1>
          <p className="font-mono-jb text-sm max-w-lg mx-auto" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Analiza, optimiza y haz crecer tu canal de YouTube con herramientas profesionales. Sin tarjeta de crédito.',
              'Analyze, optimize and grow your YouTube channel with professional tools. No credit card required.'
            )}
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-5">
          {TOOLS.map(tool => (
            <a
              key={tool.href}
              href={tool.href}
              className="group p-6 rounded-xl transition"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--yv-border)' }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{tool.icon}</span>
                <span
                  className="font-mono-jb text-[11px] tracking-wider font-bold px-2 py-0.5 rounded"
                  style={{
                    background: tool.tag.en === 'FREE' || tool.tag.en === '10 FREE/MO' ? 'rgba(0,255,163,0.1)' : 'rgba(232,77,91,0.1)',
                    color: tool.tag.en === 'FREE' || tool.tag.en === '10 FREE/MO' ? '#00FFA3' : '#e84d5b',
                    border: tool.tag.en === 'FREE' || tool.tag.en === '10 FREE/MO' ? '1px solid rgba(0,255,163,0.3)' : '1px solid rgba(232,77,91,0.3)',
                  }}
                >
                  {tool.tag[lang]}
                </span>
              </div>
              <h3 className="font-display font-bold text-lg text-white mb-2 group-hover:text-[#e84d5b] transition">
                {tool.title[lang]}
              </h3>
              <p className="font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
                {tool.desc[lang]}
              </p>
            </a>
          ))}
        </div>

        <div className="mt-14 text-center">
          <p className="font-mono-jb text-sm mb-4" style={{ color: 'var(--yv-text-3)' }}>
            {t('¿Quieres acceso a las 14 herramientas?', 'Want access to all 14 tools?')}
          </p>
          <a href="/signup" className="btn-offset inline-flex px-8 py-3.5 text-sm font-display font-bold">
            {t('Crear cuenta gratis →', 'Create free account →')}
          </a>
        </div>
      </div>
    </div>
  );
}
