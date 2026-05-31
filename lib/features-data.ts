export interface FeatureInfo {
  slug: string;
  title: { es: string; en: string };
  short: { es: string; en: string };
  category: 'content' | 'seo' | 'analytics' | 'optimization' | 'planning';
}

export const FEATURES: FeatureInfo[] = [
  {
    slug: 'ai-generator',
    title: { es: 'Generador IA', en: 'AI Generator' },
    short: { es: 'Títulos, scripts, descripciones y más con IA', en: 'Titles, scripts, descriptions and more with AI' },
    category: 'content',
  },
  {
    slug: 'ai-coach',
    title: { es: 'AI Coach', en: 'AI Coach' },
    short: { es: 'Asistente personal que conoce tu canal', en: 'Personal assistant that knows your channel' },
    category: 'content',
  },
  {
    slug: 'content-calendar',
    title: { es: 'Calendario de Contenido', en: 'Content Calendar' },
    short: { es: 'Planifica y programa tus publicaciones con IA', en: 'Plan and schedule your uploads with AI' },
    category: 'planning',
  },
  {
    slug: 'keyword-research',
    title: { es: 'Keyword Research', en: 'Keyword Research' },
    short: { es: 'Encuentra keywords de baja competencia y alta oportunidad', en: 'Find low-competition, high-opportunity keywords' },
    category: 'seo',
  },
  {
    slug: 'seo-score',
    title: { es: 'SEO Score', en: 'SEO Score' },
    short: { es: 'Analiza y mejora el SEO de cualquier vídeo', en: 'Analyze and improve any video\'s SEO' },
    category: 'seo',
  },
  {
    slug: 'trend-explorer',
    title: { es: 'Trend Explorer', en: 'Trend Explorer' },
    short: { es: 'Descubre vídeos virales y tendencias por país', en: 'Discover viral videos and trends by country' },
    category: 'seo',
  },
  {
    slug: 'channel-analytics',
    title: { es: 'Analytics del Canal', en: 'Channel Analytics' },
    short: { es: 'Métricas de crecimiento, engagement y rendimiento', en: 'Growth, engagement and performance metrics' },
    category: 'analytics',
  },
  {
    slug: 'retention-analyzer',
    title: { es: 'Analizador de Retención', en: 'Retention Analyzer' },
    short: { es: 'Identifica dónde pierdes audiencia en tus vídeos', en: 'Identify where you lose viewers in your videos' },
    category: 'analytics',
  },
  {
    slug: 'revenue-estimator',
    title: { es: 'Estimador de Ingresos', en: 'Revenue Estimator' },
    short: { es: 'Estima ingresos por AdSense, sponsors y más', en: 'Estimate revenue from AdSense, sponsors and more' },
    category: 'analytics',
  },
  {
    slug: 'video-predictor',
    title: { es: 'Predictor de Vídeo', en: 'Video Predictor' },
    short: { es: 'Predice el rendimiento antes de publicar', en: 'Predict performance before publishing' },
    category: 'analytics',
  },
  {
    slug: 'ab-testing',
    title: { es: 'A/B Testing', en: 'A/B Testing' },
    short: { es: 'Compara títulos y miniaturas para maximizar CTR', en: 'Compare titles and thumbnails to maximize CTR' },
    category: 'optimization',
  },
  {
    slug: 'competitor-analysis',
    title: { es: 'Análisis de Competidores', en: 'Competitor Analysis' },
    short: { es: 'Analiza canales rivales y descubre su estrategia', en: 'Analyze rival channels and discover their strategy' },
    category: 'optimization',
  },
  {
    slug: 'best-time',
    title: { es: 'Mejor Hora para Publicar', en: 'Best Time to Post' },
    short: { es: 'Encuentra el horario óptimo para tu audiencia', en: 'Find the optimal time for your audience' },
    category: 'optimization',
  },
  {
    slug: 'learning-hub',
    title: { es: 'Learning Hub', en: 'Learning Hub' },
    short: { es: 'Guías y tutoriales para crecer en YouTube', en: 'Guides and tutorials to grow on YouTube' },
    category: 'planning',
  },
];

export function getRelatedFeatures(currentSlug: string, count = 4): FeatureInfo[] {
  const current = FEATURES.find(f => f.slug === currentSlug);
  if (!current) return FEATURES.filter(f => f.slug !== currentSlug).slice(0, count);

  const sameCategory = FEATURES.filter(f => f.slug !== currentSlug && f.category === current.category);
  const otherCategory = FEATURES.filter(f => f.slug !== currentSlug && f.category !== current.category);

  const related = [...sameCategory, ...otherCategory];
  return related.slice(0, count);
}
