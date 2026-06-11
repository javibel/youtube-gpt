// Meta titles/descriptions cortos para Google (CTR), separados del H1 visible.
// El H1 largo se mantiene en blog-data.ts; aquí solo lo que ve Google en SERP.
// title ≤52 chars (el template añade " | YTubViral" = 12) · desc ≤160 chars.
// Los OG/Twitter siguen usando el título largo de blog-data (mejor en redes).

export type BlogSeo = {
  title: { es: string; en: string };
  desc?: { es: string; en: string };
};

export const BLOG_SEO: Record<string, BlogSeo> = {
  '7-frameworks-titulos-virales-youtube': {
    title: {
      es: '7 frameworks de títulos virales en YouTube (2026)',
      en: '7 viral YouTube title frameworks (2026)',
    },
  },
  'ab-testing-youtube-titulos-guia': {
    title: {
      es: 'A/B testing en YouTube: títulos y miniaturas 2026',
      en: 'YouTube A/B testing: titles & thumbnails (2026)',
    },
  },
  'algoritmo-youtube-2026-como-funciona': {
    title: {
      es: 'Algoritmo de YouTube 2026: cómo funciona de verdad',
      en: 'YouTube algorithm 2026: how it really works',
    },
    desc: {
      es: 'YouTube ya no premia solo el watch time: satisfacción, LLMs y señales contextuales mandan en 2026. Qué métricas importan y cómo adaptar tu canal.',
      en: 'YouTube no longer rewards watch time alone: satisfaction, LLMs and contextual signals rule 2026. Which metrics matter and how to adapt your channel.',
    },
  },
  'auditoria-canal-youtube-guia': {
    title: {
      es: 'Auditoría de canal YouTube: detecta qué te frena',
      en: 'YouTube channel audit: find what blocks your growth',
    },
  },
  'best-youtube-title-generator-2026': {
    title: {
      es: 'Mejores generadores de títulos YouTube 2026',
      en: 'Best YouTube title generators 2026',
    },
  },
  'como-analizar-competencia-youtube': {
    title: {
      es: 'Cómo analizar a tu competencia en YouTube (2026)',
      en: 'How to analyze your YouTube competitors (2026)',
    },
    desc: {
      es: 'Tus competidores ya tienen las respuestas: temas, keywords y horarios que funcionan. Aprende a extraer esos datos gratis y convertirlos en ventaja.',
      en: 'Your competitors already have the answers: topics, keywords and schedules that work. Learn to extract that data for free and turn it into an edge.',
    },
  },
  'como-conseguir-suscriptores-youtube-2026': {
    title: {
      es: '12 estrategias para ganar suscriptores en 2026',
      en: '12 strategies to gain YouTube subscribers in 2026',
    },
    desc: {
      es: 'Ganar suscriptores en YouTube es más difícil que nunca. 12 estrategias probadas con datos reales para crecer del primer vídeo a los 100K.',
      en: 'Gaining YouTube subscribers is harder than ever. 12 proven strategies backed by real data to grow from your first video to 100K.',
    },
  },
  'como-crear-scripts-youtube-con-ia': {
    title: {
      es: 'Cómo crear scripts de YouTube con IA (guía 2026)',
      en: 'How to create YouTube scripts with AI (2026 guide)',
    },
    desc: {
      es: 'La IA puede ahorrarte 3 horas por guion. El proceso exacto para crear scripts que suenen a ti — no a un robot — usando IA como herramienta.',
      en: 'AI can save you 3 hours per script. The exact process to create scripts that sound like you — not a robot — using AI as a tool.',
    },
  },
  'como-escribir-titulos-virales-youtube': {
    title: {
      es: 'Cómo escribir títulos virales para YouTube (2026)',
      en: 'How to write viral YouTube titles (2026)',
    },
  },
  'como-monetizar-youtube-2026-guia': {
    title: {
      es: 'Cómo monetizar YouTube en 2026: guía completa',
      en: 'How to monetize YouTube in 2026: full guide',
    },
    desc: {
      es: 'AdSense es solo la puerta de entrada. Las 6 fuentes de ingresos reales de un YouTuber en 2026, con CPMs por nicho y la ruta desde 500 suscriptores.',
      en: 'AdSense is just the entry door. The 6 real income sources for YouTubers in 2026, with CPMs by niche and the roadmap from 500 subscribers.',
    },
  },
  'cuanto-gana-un-youtuber-en-espana': {
    title: {
      es: 'Cuánto gana realmente un YouTuber en España',
      en: 'How much YouTubers really earn in Spain',
    },
  },
  'descripciones-seo-youtube-guia': {
    title: {
      es: 'Descripciones SEO para YouTube: guía 2026',
      en: 'YouTube SEO descriptions: 2026 guide',
    },
    desc: {
      es: 'La descripción es el elemento más infravalorado del SEO en YouTube: las optimizadas tienen un 78% más de opciones de salir en primera página.',
      en: 'The description is the most undervalued element of YouTube SEO: optimized ones are 78% more likely to reach the first page.',
    },
  },
  'herramientas-ia-para-youtubers-2026': {
    title: {
      es: '10 herramientas de IA para YouTubers (2026)',
      en: '10 AI tools for YouTubers (2026)',
    },
    desc: {
      es: 'Las 10 mejores herramientas de IA de 2026 que ahorran horas cada semana a los creadores, con precios y para qué sirve cada una.',
      en: 'The 10 best AI tools of 2026 that save creators hours every week, with pricing and what each one is for.',
    },
  },
  'ideas-videos-youtube-no-se-que-subir': {
    title: {
      es: 'No sé qué subir a YouTube: sistema de ideas',
      en: 'Out of YouTube video ideas? A system that works',
    },
  },
  'keyword-research-youtube-guia': {
    title: {
      es: 'Keyword research para YouTube: guía 2026',
      en: 'YouTube keyword research: 2026 guide',
    },
    desc: {
      es: 'Encuentra keywords con alto volumen y baja competencia. Método completo con herramientas gratis y los errores que comete el 90% de creadores.',
      en: 'Find high-volume, low-competition keywords. Complete method with free tools and the mistakes 90% of creators make.',
    },
  },
  'setup-youtube-menos-500-euros': {
    title: {
      es: 'Setup de YouTube por menos de 500€ (2026)',
      en: 'YouTube setup under €500 (2026 buying guide)',
    },
  },
  'thumbnails-youtube-guia-ctr': {
    title: {
      es: 'Thumbnails de YouTube que generan clicks (2026)',
      en: 'YouTube thumbnails that get clicks (2026)',
    },
  },
  'tour-completo-ytubviral-14-herramientas': {
    title: {
      es: 'Tour: 14 herramientas de IA para crecer en YouTube',
      en: 'Tour: 14 AI tools to grow on YouTube',
    },
  },
  'tubebuddy-vs-vidiq-2026': {
    title: {
      es: 'TubeBuddy vs VidIQ 2026: comparativa completa',
      en: 'TubeBuddy vs VidIQ 2026: full comparison',
    },
    desc: {
      es: 'TubeBuddy o VidIQ: análisis de características, precios y resultados para elegir la mejor herramienta SEO para tu canal en 2026.',
      en: 'TubeBuddy or VidIQ: feature, pricing and results analysis to choose the best SEO tool for your channel in 2026.',
    },
  },
  'vidiq-alternative-free-2026': {
    title: {
      es: 'Alternativas gratis a VidIQ en 2026',
      en: 'Free VidIQ alternatives in 2026',
    },
  },
  'youtube-analytics-tools-free-2026': {
    title: {
      es: 'Herramientas de analytics YouTube gratis (2026)',
      en: 'Free YouTube analytics tools (2026)',
    },
  },
  'youtube-description-generator-ai': {
    title: {
      es: 'Generador de descripciones YouTube con IA',
      en: 'AI YouTube description generator',
    },
  },
  'youtube-keyword-research-free-tool': {
    title: {
      es: 'Keyword research YouTube: herramienta gratis',
      en: 'Free YouTube keyword research tool',
    },
    desc: {
      es: 'Herramienta gratuita de keyword research para YouTube: encuentra palabras clave, optimiza tu contenido y gana visibilidad.',
      en: 'Free YouTube keyword research tool: find keywords, optimize your content and gain visibility.',
    },
  },
  'youtube-neurodivergencia-guia': {
    title: {
      es: 'Triunfar en YouTube siendo neurodivergente',
      en: 'Thriving on YouTube as a neurodivergent creator',
    },
    desc: {
      es: 'TDAH, autismo, dislexia: tu cerebro funciona diferente y en YouTube eso es ventaja. Adapta tu workflow y evita el burnout.',
      en: 'ADHD, autism, dyslexia: your brain works differently and on YouTube that is an advantage. Adapt your workflow and avoid burnout.',
    },
  },
  'youtube-tag-generator-free-2026': {
    title: {
      es: 'Generador de etiquetas YouTube gratis (SEO)',
      en: 'Free YouTube tag generator (SEO)',
    },
  },
  'youtube-trending-videos-free-tool': {
    title: {
      es: 'Ver vídeos trending de YouTube en tiempo real',
      en: 'See YouTube trending videos in real time',
    },
  },
};
