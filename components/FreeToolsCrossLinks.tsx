'use client';

// Fuente única de las herramientas gratis públicas. Al añadir una nueva tool,
// registrarla aquí y todas las demás la enlazan automáticamente (link juice interno, SEO Fase 1).
export interface FreeTool {
  href: string;
  icon: string;
  title: { es: string; en: string };
  desc: { es: string; en: string };
}

export const FREE_TOOLS: FreeTool[] = [
  {
    href: '/title-analyzer',
    icon: '📝',
    title: { es: 'Analizador de Títulos', en: 'Title Analyzer' },
    desc: { es: 'Puntúa tu título antes de publicar', en: 'Score your title before publishing' },
  },
  {
    href: '/ctr-calculator',
    icon: '🎯',
    title: { es: 'Calculadora de CTR', en: 'CTR Calculator' },
    desc: { es: 'Calcula y compara tu CTR', en: 'Calculate and benchmark your CTR' },
  },
  {
    href: '/youtube-money-calculator',
    icon: '💰',
    title: { es: 'Calculadora de Ingresos', en: 'Money Calculator' },
    desc: { es: 'Estima cuánto ganarías por tus vistas', en: 'Estimate earnings from your views' },
  },
  {
    href: '/seo-score',
    icon: '📊',
    title: { es: 'SEO Score', en: 'SEO Score' },
    desc: { es: 'Analiza un vídeo publicado', en: 'Analyze a published video' },
  },
  {
    href: '/trends',
    icon: '🔥',
    title: { es: 'Trending', en: 'Trending' },
    desc: { es: 'Vídeos virales por país', en: 'Viral videos by country' },
  },
  {
    href: '/tools',
    icon: '🧰',
    title: { es: 'Todas', en: 'All tools' },
    desc: { es: 'Ver todas las herramientas', en: 'See all the tools' },
  },
];

export default function FreeToolsCrossLinks({ current, lang }: { current: string; lang: 'es' | 'en' }) {
  const t = (es: string, en: string) => (lang === 'en' ? en : es);
  const tools = FREE_TOOLS.filter(tool => tool.href !== current).slice(0, 3);

  return (
    <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--yv-border)' }}>
      <p className="font-mono-jb text-[12px] tracking-[0.2em] uppercase mb-4" style={{ color: 'var(--yv-text-4)' }}>
        {t('Más herramientas gratis', 'More free tools')}
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        {tools.map(tool => (
          <a key={tool.href} href={tool.href} className="block p-3 rounded-lg transition hover:bg-white/[0.03]" style={{ border: '1px solid var(--yv-border)' }}>
            <span className="text-white text-sm font-display font-semibold">{tool.icon} {lang === 'en' ? tool.title.en : tool.title.es}</span>
            <p className="font-mono-jb text-[12px] mt-1" style={{ color: 'var(--yv-text-4)' }}>{lang === 'en' ? tool.desc.en : tool.desc.es}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
