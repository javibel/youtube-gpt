export interface AchievementDef {
  key: string;
  icon: string;
  label: { es: string; en: string };
  desc: { es: string; en: string };
  category: 'milestone' | 'improvement' | 'streak' | 'learning';
}

const definitions: AchievementDef[] = [
  // ── Milestones ──
  { key: 'first_video', icon: '/icons/clapperboard.webp', label: { es: 'Primer paso', en: 'First Step' }, desc: { es: 'Conecta tu canal de YouTube', en: 'Connect your YouTube channel' }, category: 'milestone' },
  { key: 'ten_videos', icon: '/icons/target.webp', label: { es: 'Creador constante', en: 'Consistent Creator' }, desc: { es: '10+ vídeos en tu canal', en: '10+ videos on your channel' }, category: 'milestone' },
  { key: 'hundred_subs', icon: '/icons/community.webp', label: { es: 'Primera comunidad', en: 'First Community' }, desc: { es: 'Alcanza 100 suscriptores', en: 'Reach 100 subscribers' }, category: 'milestone' },
  { key: 'thousand_subs', icon: '/icons/trophy.webp', label: { es: 'Club de los 1K', en: '1K Club' }, desc: { es: 'Alcanza 1.000 suscriptores', en: 'Reach 1,000 subscribers' }, category: 'milestone' },

  // ── Improvement ──
  { key: 'first_optimize', icon: '/icons/magic-wand.webp', label: { es: 'Optimizador', en: 'Optimizer' }, desc: { es: 'Optimiza tu primer vídeo', en: 'Optimize your first video' }, category: 'improvement' },
  { key: 'seo_70', icon: '/icons/magnifying-glass.webp', label: { es: 'SEO Pro', en: 'SEO Pro' }, desc: { es: 'Consigue un SEO Score de 70+', en: 'Get a SEO Score of 70+' }, category: 'improvement' },
  { key: 'seo_90', icon: '/icons/diamond.webp', label: { es: 'SEO Master', en: 'SEO Master' }, desc: { es: 'Consigue un SEO Score de 90+', en: 'Get a SEO Score of 90+' }, category: 'improvement' },
  { key: 'score_up_20', icon: '/icons/chart-up.webp', label: { es: 'Gran mejora', en: 'Big Improvement' }, desc: { es: 'Mejora un SEO Score en 20+ puntos', en: 'Improve a SEO Score by 20+ points' }, category: 'improvement' },
  { key: 'ab_winner', icon: '/icons/flask.webp', label: { es: 'Científico', en: 'Scientist' }, desc: { es: 'Completa un A/B test con ganador', en: 'Complete an A/B test with a winner' }, category: 'improvement' },

  // ── Streaks ──
  { key: 'streak_3', icon: '/icons/flame.webp', label: { es: 'En racha', en: 'On Fire' }, desc: { es: '3 días seguidos usando YTubViral', en: '3 consecutive days using YTubViral' }, category: 'streak' },
  { key: 'streak_7', icon: '/icons/lightning.webp', label: { es: 'Semana perfecta', en: 'Perfect Week' }, desc: { es: '7 días seguidos usando YTubViral', en: '7 consecutive days using YTubViral' }, category: 'streak' },
  { key: 'streak_30', icon: '/icons/crown.webp', label: { es: 'Dedicación total', en: 'Total Dedication' }, desc: { es: '30 días seguidos usando YTubViral', en: '30 consecutive days using YTubViral' }, category: 'streak' },

  // ── Learning ──
  { key: 'first_audit', icon: '/icons/clipboard.webp', label: { es: 'Autoconsciente', en: 'Self-Aware' }, desc: { es: 'Completa tu primera auditoría de canal', en: 'Complete your first channel audit' }, category: 'learning' },
  { key: 'trend_explorer', icon: '/icons/globe.webp', label: { es: 'Explorador', en: 'Explorer' }, desc: { es: 'Explora tendencias en 3 países diferentes', en: 'Explore trends in 3 different countries' }, category: 'learning' },
  { key: 'coach_5', icon: '/icons/brain.webp', label: { es: 'Aprendiz', en: 'Learner' }, desc: { es: 'Envía 5 mensajes al AI Coach', en: 'Send 5 messages to AI Coach' }, category: 'learning' },
  { key: 'coach_50', icon: '/icons/graduation.webp', label: { es: 'Estudiante avanzado', en: 'Advanced Student' }, desc: { es: 'Envía 50 mensajes al AI Coach', en: 'Send 50 messages to AI Coach' }, category: 'learning' },
  { key: 'all_tools', icon: '/icons/wrench.webp', label: { es: 'Herramientas dominadas', en: 'Tool Master' }, desc: { es: 'Usa todas las herramientas al menos una vez', en: 'Use every tool at least once' }, category: 'learning' },
];


export const ACHIEVEMENTS = Object.freeze(definitions.map(def => Object.freeze({ ...def, label: Object.freeze({ ...def.label }), desc: Object.freeze({ ...def.desc }) })));
