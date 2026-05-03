'use client';

import { useState, useEffect } from 'react';
import { getLangClient } from '@/lib/get-lang-client';
import DashboardShell from '@/components/DashboardShell';

type Lang = 'es' | 'en';

interface Guide {
  id: string;
  icon: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  level: 'beginner' | 'intermediate' | 'advanced';
  tool?: string; // link to YTubViral tool
  steps: Record<Lang, string[]>;
}

const LEVEL_COLORS = { beginner: '#22c55e', intermediate: '#eab308', advanced: '#ef4444' };
const LEVEL_LABELS: Record<string, Record<Lang, string>> = {
  beginner: { es: 'Principiante', en: 'Beginner' },
  intermediate: { es: 'Intermedio', en: 'Intermediate' },
  advanced: { es: 'Avanzado', en: 'Advanced' },
};

const GUIDES: Guide[] = [
  {
    id: 'seo-basics',
    icon: '🔍',
    title: { es: 'SEO en YouTube: Guía completa', en: 'YouTube SEO: Complete Guide' },
    description: {
      es: 'Aprende a optimizar tus vídeos para que aparezcan en búsquedas y recomendaciones.',
      en: 'Learn to optimize your videos to appear in search and recommendations.',
    },
    level: 'beginner',
    tool: '/seo-score',
    steps: {
      es: [
        'El título es lo más importante: incluye tu keyword principal en las primeras 5 palabras.',
        'Descripción: mínimo 150 palabras. Pon la keyword en el primer párrafo y añade timestamps.',
        'Tags: 5-15 tags relevantes. Mezcla broad (ej: "tutorial") con específicos (ej: "tutorial DaVinci Resolve color grading").',
        'Thumbnail personalizado: texto grande legible, colores contrastantes, rostros expresivos.',
        'Usa YTubViral SEO Score para analizar cada vídeo antes de publicar y llegar al 80+.',
      ],
      en: [
        'The title is king: include your main keyword in the first 5 words.',
        'Description: minimum 150 words. Put the keyword in the first paragraph and add timestamps.',
        'Tags: 5-15 relevant tags. Mix broad (eg: "tutorial") with specific (eg: "DaVinci Resolve color grading tutorial").',
        'Custom thumbnail: large readable text, contrasting colors, expressive faces.',
        'Use YTubViral SEO Score to analyze each video before publishing and aim for 80+.',
      ],
    },
  },
  {
    id: 'keyword-research',
    icon: '📊',
    title: { es: 'Keyword Research para YouTube', en: 'Keyword Research for YouTube' },
    description: {
      es: 'Encuentra las palabras clave que tu audiencia está buscando y que tienen poca competencia.',
      en: 'Find keywords your audience is searching for with low competition.',
    },
    level: 'beginner',
    tool: '/research',
    steps: {
      es: [
        'Empieza con el autocomplete de YouTube: escribe tu tema y mira qué sugiere.',
        'Usa YTubViral Research para ver volumen estimado y nivel de competencia de cada keyword.',
        'Busca keywords con oportunidad alta (>60) y competencia baja-media.',
        'Combina keywords: "cómo + [tema]", "[tema] + para principiantes", "mejor + [tema] + 2026".',
        'Crea un calendario de contenido basado en tus keywords ganadores.',
      ],
      en: [
        'Start with YouTube autocomplete: type your topic and see what it suggests.',
        'Use YTubViral Research to see estimated volume and competition level for each keyword.',
        'Look for keywords with high opportunity (>60) and low-medium competition.',
        'Combine keywords: "how to + [topic]", "[topic] + for beginners", "best + [topic] + 2026".',
        'Create a content calendar based on your winning keywords.',
      ],
    },
  },
  {
    id: 'retention',
    icon: '📈',
    title: { es: 'Mejorar retención de audiencia', en: 'Improve Audience Retention' },
    description: {
      es: 'La retención es el factor #1 del algoritmo. Aprende a mantener a tu audiencia enganchada.',
      en: 'Retention is the #1 algorithm factor. Learn to keep your audience hooked.',
    },
    level: 'intermediate',
    tool: '/retention',
    steps: {
      es: [
        'Hook en los primeros 30 segundos: promete el valor que vas a dar. "En este vídeo vas a aprender..."',
        'Usa pattern interrupts cada 2-3 minutos: cambios de cámara, gráficos, b-roll, preguntas al viewer.',
        'Elimina silencios y pausas largas. El ritmo es clave.',
        'Open loops: anticipa lo que viene después para que no se vayan. "Pero antes de eso..."',
        'Analiza tus drop-off points en YTubViral Retention y mejora esos momentos exactos.',
      ],
      en: [
        'Hook in the first 30 seconds: promise the value you\'ll deliver. "In this video you\'ll learn..."',
        'Use pattern interrupts every 2-3 minutes: camera changes, graphics, b-roll, viewer questions.',
        'Eliminate dead air and long pauses. Pacing is key.',
        'Open loops: tease what\'s coming next so they stay. "But before that..."',
        'Analyze your drop-off points in YTubViral Retention and improve those exact moments.',
      ],
    },
  },
  {
    id: 'thumbnails',
    icon: '🎨',
    title: { es: 'Thumbnails que generan clics', en: 'Thumbnails That Get Clicks' },
    description: {
      es: 'El thumbnail decide si alguien hace clic. Aprende los principios de diseño que funcionan.',
      en: 'The thumbnail decides if someone clicks. Learn the design principles that work.',
    },
    level: 'beginner',
    steps: {
      es: [
        'Máximo 3-4 palabras en el thumbnail. Texto grande y legible incluso en móvil.',
        'Contraste de colores: fondo y texto deben diferenciarse claramente. Amarillo sobre oscuro funciona.',
        'Rostros con expresiones exageradas aumentan CTR un 30-40%.',
        'No repitas el título exacto — el thumbnail complementa, no duplica.',
        'Testea 2-3 versiones en tus primeras horas con YTubViral A/B Testing (próximamente).',
      ],
      en: [
        'Maximum 3-4 words on the thumbnail. Large text readable even on mobile.',
        'Color contrast: background and text must be clearly different. Yellow on dark works well.',
        'Faces with exaggerated expressions increase CTR by 30-40%.',
        'Don\'t repeat the exact title — the thumbnail complements, not duplicates.',
        'Test 2-3 versions in your first hours with YTubViral A/B Testing (coming soon).',
      ],
    },
  },
  {
    id: 'analytics-deep',
    icon: '🔬',
    title: { es: 'Análisis avanzado con YouTube Analytics', en: 'Advanced Analysis with YouTube Analytics' },
    description: {
      es: 'Aprende a leer tus datos privados de YouTube y tomar decisiones basadas en métricas reales.',
      en: 'Learn to read your private YouTube data and make decisions based on real metrics.',
    },
    level: 'advanced',
    tool: '/analytics',
    steps: {
      es: [
        'Fuentes de tráfico: si la mayoría viene de "Búsqueda", tu SEO funciona. Si viene de "Sugeridos", el algoritmo te empuja.',
        'Watch time > Views: un vídeo con menos views pero más watch time es mejor señal para el algoritmo.',
        'Suscriptores ganados por vídeo: identifica qué tipo de contenido convierte viewers en suscriptores.',
        'Países: si tu audiencia está en otro país del que pensabas, adapta horarios y contenido.',
        'Compara tus métricas mes a mes en YTubViral Analytics para detectar tendencias.',
      ],
      en: [
        'Traffic sources: if most comes from "Search", your SEO works. If from "Suggested", the algorithm is pushing you.',
        'Watch time > Views: a video with fewer views but more watch time is a better signal for the algorithm.',
        'Subscribers gained per video: identify what content type converts viewers into subscribers.',
        'Countries: if your audience is in a different country than expected, adapt schedule and content.',
        'Compare your metrics month over month in YTubViral Analytics to spot trends.',
      ],
    },
  },
  {
    id: 'growth-strategy',
    icon: '🚀',
    title: { es: 'Estrategia de crecimiento 0 a 1K subs', en: 'Growth Strategy 0 to 1K Subs' },
    description: {
      es: 'Los primeros 1000 suscriptores son los más difíciles. Aquí tienes el plan paso a paso.',
      en: 'The first 1000 subscribers are the hardest. Here\'s the step-by-step plan.',
    },
    level: 'beginner',
    steps: {
      es: [
        'Define tu nicho claramente. "Tutoriales de DaVinci Resolve para principiantes" es mejor que "edición de vídeo".',
        'Publica de forma consistente: mínimo 1 vídeo/semana. El algoritmo premia la consistencia.',
        'Enfócate en contenido de búsqueda (how-to, tutorials, reviews) — no en contenido de trending.',
        'Colabora con canales de tu tamaño. Los collabs son el growth hack más infrautilizado.',
        'Usa todas las herramientas de YTubViral: SEO Score, Keywords, Best Time, y Daily Ideas para mantenerte enfocado.',
      ],
      en: [
        'Define your niche clearly. "DaVinci Resolve tutorials for beginners" is better than "video editing".',
        'Publish consistently: minimum 1 video/week. The algorithm rewards consistency.',
        'Focus on search content (how-to, tutorials, reviews) — not trending content.',
        'Collaborate with channels your size. Collabs are the most underused growth hack.',
        'Use all YTubViral tools: SEO Score, Keywords, Best Time, and Daily Ideas to stay focused.',
      ],
    },
  },
  {
    id: 'competitor-analysis',
    icon: '🎯',
    title: { es: 'Análisis de competidores', en: 'Competitor Analysis' },
    description: {
      es: 'Aprende de los que ya lo están haciendo bien. Analiza su estrategia y encuentra tu ventaja.',
      en: 'Learn from those already doing well. Analyze their strategy and find your edge.',
    },
    level: 'intermediate',
    tool: '/competitors',
    steps: {
      es: [
        'Identifica 5-10 canales de tu nicho que tengan 2-10x más suscriptores que tú.',
        'Analiza sus vídeos más exitosos: ¿qué tienen en común los títulos, thumbnails y temas?',
        'Mira su frecuencia de subida y duración media — ¿qué funciona en tu nicho?',
        'Usa YTubViral Competitor Tracking para monitorizar su crecimiento en tiempo real.',
        'No copies — inspírate. Encuentra el ángulo que ellos no cubren.',
      ],
      en: [
        'Identify 5-10 channels in your niche with 2-10x more subscribers than you.',
        'Analyze their most successful videos: what do the titles, thumbnails and topics have in common?',
        'Look at their upload frequency and average duration — what works in your niche?',
        'Use YTubViral Competitor Tracking to monitor their growth in real time.',
        'Don\'t copy — get inspired. Find the angle they don\'t cover.',
      ],
    },
  },
];

export default function LearnPage() {
  const [lang, setLang] = useState<Lang>('es');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <DashboardShell>
      {/* Header */}
      <div className="yv-page">
        <div className="yv-page-header" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div className="yv-page-header__left" style={{ alignItems: 'center' }}>
            <span className="yv-page-header__eyebrow">
              {t('CENTRO DE APRENDIZAJE', 'LEARNING HUB')}
            </span>
            <h1 className="yv-page-header__title">
              {t('Aprende a crecer en YouTube', 'Learn to Grow on YouTube')}
            </h1>
            <p className="yv-page-header__desc" style={{ textAlign: 'center' }}>
              {t('Guías prácticas basadas en datos reales. Cada guía incluye pasos concretos que puedes aplicar hoy.', 'Practical data-driven guides. Each guide includes concrete steps you can apply today.')}
            </p>
          </div>
        </div>
      </div>

      <div className="yv-page space-y-4">
        {GUIDES.map(guide => {
          const isExpanded = expanded.has(guide.id);
          return (
            <div
              key={guide.id}
              className="yv-card overflow-hidden transition hover:border-white/15"
            >
              <div
                className="flex items-start gap-4 p-5 cursor-pointer"
                onClick={() => toggle(guide.id)}
              >
                <span className="text-2xl flex-shrink-0">{guide.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="font-display font-bold text-base" style={{ color: 'var(--yv-text-1)' }}>{guide.title[lang]}</h2>
                    <span
                      className="font-mono-jb text-[13px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: `${LEVEL_COLORS[guide.level]}22`, color: LEVEL_COLORS[guide.level] }}
                    >
                      {LEVEL_LABELS[guide.level][lang]}
                    </span>
                  </div>
                  <p className="text-[13px] font-mono-jb" style={{ color: 'var(--yv-text-2)' }}>{guide.description[lang]}</p>
                </div>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--yv-text-4)' }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>

              {isExpanded && (
                <div className="border-t border-white/5 px-5 pb-5 pt-4">
                  <ol className="space-y-3">
                    {guide.steps[lang].map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="font-mono-jb font-bold text-sm mt-0.5 flex-shrink-0" style={{ color: 'var(--yv-brand)' }}>
                          {i + 1}
                        </span>
                        <span className="text-sm font-mono-jb leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {guide.tool && (
                    <a
                      href={guide.tool}
                      className="yv-btn yv-btn--ghost inline-flex items-center gap-2 mt-4"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      {t('Usar herramienta', 'Use tool')} →
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DashboardShell>
  );
}
