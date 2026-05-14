'use client';

import { useState, useEffect } from 'react';
import { getLangClient } from '@/lib/get-lang-client';
import DashboardShell from '@/components/DashboardShell';
import GuideCard from '@/components/GuideCard';
import { LEARN_GUIDES } from '@/lib/learn-data';

type Lang = 'es' | 'en';

const LEVEL_COLORS = { beginner: '#22c55e', intermediate: '#eab308', advanced: '#ef4444' };
const LEVEL_LABELS: Record<string, Record<Lang, string>> = {
  beginner: { es: 'Principiante', en: 'Beginner' },
  intermediate: { es: 'Intermedio', en: 'Intermediate' },
  advanced: { es: 'Avanzado', en: 'Advanced' },
};

const LEARNING_PATHS: { title: Record<Lang, string>; desc: Record<Lang, string>; slugs: string[] }[] = [
  {
    title: { es: 'Canal nuevo (0-1K subs)', en: 'New Channel (0-1K subs)' },
    desc: { es: 'El camino desde cero hasta tus primeros 1000 suscriptores.', en: 'The path from zero to your first 1000 subscribers.' },
    slugs: ['seo-basics', 'keyword-research', 'thumbnails', 'growth-strategy', 'best-time', 'content-calendar'],
  },
  {
    title: { es: 'Canal estancado (optimización)', en: 'Plateaued Channel (optimization)' },
    desc: { es: 'Rompe la meseta con análisis avanzado y testing.', en: 'Break through the plateau with advanced analysis and testing.' },
    slugs: ['retention', 'analytics-deep', 'ab-testing', 'competitor-analysis', 'video-predictor', 'ai-coach'],
  },
];

export default function LearnPage() {
  const [lang, setLang] = useState<Lang>('es');
  const [filter, setFilter] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const filtered = filter === 'all' ? LEARN_GUIDES : LEARN_GUIDES.filter((g) => g.level === filter);

  return (
    <DashboardShell>
      {/* Header */}
      <div className="yv-page">
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">
              {t('CENTRO DE APRENDIZAJE', 'LEARNING HUB')}
            </span>
            <h1 className="yv-page-header__title">
              {t('Aprende a crecer en YouTube', 'Learn to Grow on YouTube')}
            </h1>
            <p className="yv-page-header__desc">
              {t(
                '14 guías prácticas basadas en datos reales. Cada guía incluye pasos concretos que puedes aplicar hoy.',
                '14 practical data-driven guides. Each guide includes concrete steps you can apply today.',
              )}
            </p>
          </div>
        </header>
      </div>

      {/* Level filter */}
      <div className="yv-page mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((level) => {
            const isActive = filter === level;
            const label = level === 'all'
              ? t('Todas', 'All')
              : LEVEL_LABELS[level][lang];
            const color = level === 'all' ? 'var(--yv-brand)' : LEVEL_COLORS[level];
            return (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className="font-mono-jb text-[12px] uppercase tracking-wider px-3 py-1.5 rounded-full transition-all"
                style={{
                  background: isActive ? `${color}22` : 'transparent',
                  color: isActive ? color : 'var(--yv-text-3)',
                  border: `1px solid ${isActive ? `${color}44` : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {label} {level === 'all' ? `(${LEARN_GUIDES.length})` : `(${LEARN_GUIDES.filter((g) => g.level === level).length})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Guide grid */}
      <div className="yv-page">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {filtered.map((guide) => (
            <GuideCard key={guide.slug} guide={guide} lang={lang} linkPrefix="/learn/" />
          ))}
        </div>

        {/* Learning paths */}
        <div className="mb-8">
          <h2 className="font-display font-bold text-xl mb-6" style={{ color: 'var(--yv-text-1)' }}>
            {t('Rutas de aprendizaje', 'Learning Paths')}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {LEARNING_PATHS.map((path, idx) => (
              <div key={idx} className="yv-card p-6">
                <h3 className="font-display font-bold text-lg mb-2" style={{ color: 'var(--yv-text-1)' }}>{path.title[lang]}</h3>
                <p className="font-mono-jb text-sm mb-4" style={{ color: 'var(--yv-text-2)' }}>{path.desc[lang]}</p>
                <ol className="space-y-2">
                  {path.slugs.map((s, i) => {
                    const g = LEARN_GUIDES.find((x) => x.slug === s);
                    if (!g) return null;
                    return (
                      <li key={s}>
                        <a href={`/learn/${s}`} className="flex items-center gap-3 text-sm font-mono-jb hover:text-white transition-colors" style={{ color: 'var(--yv-text-2)' }}>
                          <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[11px] font-bold"
                            style={{ background: 'rgba(232,77,91,0.15)', color: 'var(--yv-brand)' }}>
                            {i + 1}
                          </span>
                          {g.title[lang]}
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
