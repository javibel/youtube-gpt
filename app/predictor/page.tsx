'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useLang } from '@/components/LangProvider';
import ToolLoginGate from '@/components/ToolLoginGate';

type Lang = 'es' | 'en';

interface Prediction {
  estimatedViews: { low: number; mid: number; high: number };
  estimatedEngagement: number;
  titleScore: number;
  seoScore: number;
  viralPotential: 'low' | 'medium' | 'high';
  strengths: string[];
  weaknesses: string[];
  suggestion: string;
}

interface Baseline {
  avgViews: number;
  medianViews: number;
  avgEngagement: number;
  topVideoViews: number;
  topVideoTitle: string;
  videoCount: number;
  subscribers: number;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function scoreColor(s: number): string {
  if (s >= 70) return '#22c55e';
  if (s >= 40) return '#eab308';
  return '#ef4444';
}

const VIRAL_COLORS: Record<string, string> = { low: '#6366f1', medium: '#eab308', high: '#22c55e' };
const VIRAL_LABELS: Record<string, Record<Lang, string>> = {
  low: { es: 'Bajo', en: 'Low' },
  medium: { es: 'Medio', en: 'Medium' },
  high: { es: 'Alto', en: 'High' },
};

export default function PredictorPage() {
  const { data: session, status } = useSession();
  const lang = useLang();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  async function predict() {
    if (!title.trim() || loading) return;
    setLoading(true);
    setError('');
    setPrediction(null);
    try {
      const res = await fetch('/api/predictor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), tags: tags.trim(), lang }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === 'pro_required') setError(t('Plan Pro requerido.', 'Pro plan required.'));
        else if (json.error === 'youtube_not_connected') setError(t('Conecta tu canal de YouTube primero.', 'Connect your YouTube channel first.'));
        else if (json.error === 'not_enough_videos') setError(t(`Necesitas al menos 3 vídeos (tienes ${json.videoCount}).`, `Need at least 3 videos (you have ${json.videoCount}).`));
        else setError(json.error || 'Error');
        return;
      }
      setPrediction(json.prediction);
      setBaseline(json.baseline);
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <ToolLoginGate
        eyebrow={{ es: 'PREDICTOR DE RENDIMIENTO', en: 'PERFORMANCE PREDICTOR' }}
        title={{ es: 'Predice las vistas', en: 'Predict Your Views' }}
        highlight={{ es: 'antes de publicar', en: 'Before You Publish' }}
        description={{
          es: '¿Merece la pena invertir 10 horas en este vídeo? La IA te da un rango de vistas estimado, viral potential y sugerencias para maximizar el impacto.',
          en: 'Is it worth investing 10 hours in this video? AI gives you an estimated views range, viral potential, and suggestions to maximize impact.',
        }}
        color="#B388FF"
        featuresHref="/features/video-predictor"
        bullets={[
          { icon: '/icons/crystal-ball.webp', title: { es: 'Rango de vistas', en: 'Views range' }, desc: { es: 'Estimación basada en tu histórico real', en: 'Estimate based on your real history' } },
          { icon: '/icons/lightning.webp', title: { es: 'Potencial viral', en: 'Viral potential' }, desc: { es: 'Score de probabilidad de despegue', en: 'Breakout probability score' } },
          { icon: '/icons/bulb.webp', title: { es: 'Sugerencias', en: 'Suggestions' }, desc: { es: 'Qué ajustar antes de publicar', en: 'What to tweak before publishing' } },
        ]}
      />
    );
  }

  return (
    <DashboardShell>
      <div className="yv-page">
        {/* Header */}
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('PREDICTOR DE RENDIMIENTO', 'PERFORMANCE PREDICTOR')}</span>
            <h1 className="yv-page-header__title">
              {t('¿Cómo rendirá tu vídeo?', 'How will your video perform?')}
            </h1>
            <p className="yv-page-header__desc" style={{ fontSize: 'var(--yv-text-xs)' }}>
              {t('Predicción basada en los datos reales de tu canal. Estimación propia de YTubViral — no es un dato oficial de YouTube.', 'Prediction based on your real channel data. YTubViral\'s own estimate — not an official YouTube metric.')}
            </p>
          </div>
        </header>
        {/* Input form */}
        <div className="yv-card p-6 mb-8">
          <div className="space-y-4">
            <div>
              <label className="font-mono-jb text-[13px] yv-muted uppercase tracking-wider block mb-1.5">
                {t('Título del vídeo', 'Video title')} *
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('Ej: 10 Trucos de Edición que Nadie te Enseña', 'Ex: 10 Editing Tricks Nobody Teaches You')}
                className="yv-input text-sm font-mono-jb text-white placeholder-zinc-500"
                style={{ background: 'rgba(255,255,255,0.04)' }}
                maxLength={200}
              />
              <div className="text-right font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>{title.length}/200</div>
            </div>

            <div>
              <label className="font-mono-jb text-[13px] yv-muted uppercase tracking-wider block mb-1.5">
                {t('Descripción (opcional)', 'Description (optional)')}
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('Primeras líneas de la descripción...', 'First lines of the description...')}
                rows={3}
                className="yv-input resize-none text-sm font-mono-jb text-white placeholder-zinc-500"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              />
            </div>

            <div>
              <label className="font-mono-jb text-[13px] yv-muted uppercase tracking-wider block mb-1.5">
                {t('Tags (separados por coma)', 'Tags (comma separated)')}
              </label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder={t('edición, tutorial, davinci resolve, premiere', 'editing, tutorial, davinci resolve, premiere')}
                className="yv-input text-sm font-mono-jb text-white placeholder-zinc-500"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              />
            </div>

            <button
              onClick={predict}
              disabled={loading || !title.trim()}
              className="btn-offset w-full py-3 text-sm font-display rounded-lg disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('Analizando...', 'Analyzing...')}
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  {t('Predecir rendimiento', 'Predict performance')}
                </>
              )}
            </button>
          </div>

          {error && (
            <p className="text-red-400 font-mono-jb text-[13px] mt-3 text-center">{error}</p>
          )}
        </div>

        {/* Results */}
        {prediction && baseline && (
          <div className="space-y-6">
            {/* View estimate */}
            <div className="yv-card p-6">
              <h2 className="font-display font-bold text-lg text-white mb-4">
                {t('Estimación de visualizaciones', 'Estimated views')}
              </h2>
              <div className="flex items-end justify-center gap-8 mb-4">
                <div className="text-center">
                  <div className="font-mono-jb text-[13px] mb-1" style={{ color: 'var(--yv-text-4)' }}>{t('Pesimista', 'Low')}</div>
                  <div className="font-display font-bold text-xl" style={{ color: 'var(--yv-text-2)' }}>{fmtNum(prediction.estimatedViews.low)}</div>
                </div>
                <div className="text-center">
                  <div className="font-mono-jb text-[13px] uppercase tracking-wider mb-1" style={{ color: 'var(--yv-brand)' }}>{t('Estimado', 'Expected')}</div>
                  <div className="font-display font-bold text-4xl text-white">{fmtNum(prediction.estimatedViews.mid)}</div>
                </div>
                <div className="text-center">
                  <div className="font-mono-jb text-[13px] mb-1" style={{ color: 'var(--yv-text-4)' }}>{t('Optimista', 'High')}</div>
                  <div className="font-display font-bold text-xl" style={{ color: 'var(--yv-text-2)' }}>{fmtNum(prediction.estimatedViews.high)}</div>
                </div>
              </div>
              {/* Visual range bar */}
              <div className="relative h-3 rounded-full overflow-hidden mx-8" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {(() => {
                  const maxVal = Math.max(prediction.estimatedViews.high, baseline.topVideoViews, 1);
                  const lowPct = (prediction.estimatedViews.low / maxVal) * 100;
                  const highPct = (prediction.estimatedViews.high / maxVal) * 100;
                  const midPct = (prediction.estimatedViews.mid / maxVal) * 100;
                  return (
                    <>
                      <div className="absolute h-full rounded-full" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%`, background: 'rgba(155,32,32,0.3)' }} />
                      <div className="absolute h-full w-1 rounded-full" style={{ left: `${midPct}%`, background: '#9B2020' }} />
                    </>
                  );
                })()}
              </div>
              <div className="flex justify-between font-mono-jb text-[13px] mt-2 mx-8" style={{ color: 'var(--yv-text-4)' }}>
                <span>0</span>
                <span>{t('Tu media', 'Your avg')}: {fmtNum(baseline.avgViews)}</span>
                <span>{t('Tu mejor', 'Your best')}: {fmtNum(baseline.topVideoViews)}</span>
              </div>
            </div>

            {/* Scores grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="yv-card p-4 text-center">
                <div className="font-display font-bold text-2xl" style={{ color: scoreColor(prediction.titleScore) }}>
                  {prediction.titleScore}
                </div>
                <div className="font-mono-jb text-[13px] yv-muted mt-1">{t('Título', 'Title')}</div>
              </div>
              <div className="yv-card p-4 text-center">
                <div className="font-display font-bold text-2xl" style={{ color: scoreColor(prediction.seoScore) }}>
                  {prediction.seoScore}
                </div>
                <div className="font-mono-jb text-[13px] yv-muted mt-1">SEO</div>
              </div>
              <div className="yv-card p-4 text-center">
                <div className="font-display font-bold text-2xl text-white">
                  {prediction.estimatedEngagement}%
                </div>
                <div className="font-mono-jb text-[13px] yv-muted mt-1">Engagement</div>
              </div>
              <div className="yv-card p-4 text-center">
                <div className="font-display font-bold text-lg" style={{ color: VIRAL_COLORS[prediction.viralPotential] || '#888' }}>
                  {VIRAL_LABELS[prediction.viralPotential]?.[lang] || prediction.viralPotential}
                </div>
                <div className="font-mono-jb text-[13px] yv-muted mt-1">{t('Potencial viral', 'Viral potential')}</div>
              </div>
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="yv-card p-5">
                <h3 className="font-display font-bold text-sm text-green-400 mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {t('Fortalezas', 'Strengths')}
                </h3>
                <ul className="space-y-2">
                  {(prediction.strengths || []).map((s, i) => (
                    <li key={i} className="text-sm font-mono-jb text-[color:var(--yv-text-2)] flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">+</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="yv-card p-5">
                <h3 className="font-display font-bold text-sm text-yellow-400 mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {t('Mejoras', 'Improvements')}
                </h3>
                <ul className="space-y-2">
                  {(prediction.weaknesses || []).map((w, i) => (
                    <li key={i} className="text-sm font-mono-jb text-[color:var(--yv-text-2)] flex items-start gap-2">
                      <span className="text-yellow-500 mt-0.5">!</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* AI Suggestion */}
            {prediction.suggestion && (
              <div className="rounded-lg border p-5" style={{ background: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.2)' }}>
                <h3 className="font-display font-bold text-sm text-purple-300 mb-2 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
                  {t('Consejo clave', 'Key advice')}
                </h3>
                <p className="text-sm font-mono-jb text-[color:var(--yv-text-2)] leading-relaxed">{prediction.suggestion}</p>
              </div>
            )}

            {/* Baseline reference */}
            <div className="text-center">
              <span className="yv-chip inline-flex items-center gap-2 font-mono-jb text-[13px] px-4 py-1.5" style={{ color: 'var(--yv-text-4)' }}>
                {t(`Basado en tus últimos ${baseline.videoCount} vídeos · ${fmtNum(baseline.subscribers)} subs`, `Based on your last ${baseline.videoCount} videos · ${fmtNum(baseline.subscribers)} subs`)}
              </span>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
