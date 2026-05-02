'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { getLangClient } from '@/lib/get-lang-client';

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
  const [lang, setLang] = useState<Lang>('es');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);

  useEffect(() => { setLang(getLangClient()); }, []);
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
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Predictor', 'Predictor')}</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para predecir rendimiento.', 'Sign in to predict performance.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      {/* Header */}
      <div className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--red)' }}>
            {t('PREDICTOR DE RENDIMIENTO', 'PERFORMANCE PREDICTOR')}
          </p>
          <h1 className="font-display font-bold text-3xl text-white">
            {t('¿Cómo rendirá tu vídeo?', 'How will your video perform?')}
          </h1>
          <p className="text-zinc-500 font-mono-jb text-xs mt-1">
            {t('Predicción basada en los datos reales de tu canal.', 'Prediction based on your real channel data.')}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Input form */}
        <div className="rounded-xl border border-white/10 p-6 mb-8" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="space-y-4">
            <div>
              <label className="font-mono-jb text-[10px] text-zinc-500 uppercase tracking-wider block mb-1.5">
                {t('Título del vídeo', 'Video title')} *
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('Ej: 10 Trucos de Edición que Nadie te Enseña', 'Ex: 10 Editing Tricks Nobody Teaches You')}
                className="w-full rounded-lg border border-white/15 px-4 py-3 text-sm font-mono-jb text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition"
                style={{ background: 'rgba(255,255,255,0.04)' }}
                maxLength={200}
              />
              <div className="text-right font-mono-jb text-[10px] text-zinc-600 mt-1">{title.length}/200</div>
            </div>

            <div>
              <label className="font-mono-jb text-[10px] text-zinc-500 uppercase tracking-wider block mb-1.5">
                {t('Descripción (opcional)', 'Description (optional)')}
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('Primeras líneas de la descripción...', 'First lines of the description...')}
                rows={3}
                className="w-full resize-none rounded-lg border border-white/15 px-4 py-3 text-sm font-mono-jb text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              />
            </div>

            <div>
              <label className="font-mono-jb text-[10px] text-zinc-500 uppercase tracking-wider block mb-1.5">
                {t('Tags (separados por coma)', 'Tags (comma separated)')}
              </label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder={t('edición, tutorial, davinci resolve, premiere', 'editing, tutorial, davinci resolve, premiere')}
                className="w-full rounded-lg border border-white/15 px-4 py-3 text-sm font-mono-jb text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition"
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
            <p className="text-red-400 font-mono-jb text-xs mt-3 text-center">{error}</p>
          )}
        </div>

        {/* Results */}
        {prediction && baseline && (
          <div className="space-y-6">
            {/* View estimate */}
            <div className="rounded-xl border border-white/10 p-6" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <h2 className="font-display font-bold text-lg text-white mb-4">
                {t('Estimación de visualizaciones', 'Estimated views')}
              </h2>
              <div className="flex items-end justify-center gap-8 mb-4">
                <div className="text-center">
                  <div className="font-mono-jb text-[10px] text-zinc-600 mb-1">{t('Pesimista', 'Low')}</div>
                  <div className="font-display font-bold text-xl text-zinc-400">{fmtNum(prediction.estimatedViews.low)}</div>
                </div>
                <div className="text-center">
                  <div className="font-mono-jb text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--red)' }}>{t('Estimado', 'Expected')}</div>
                  <div className="font-display font-bold text-4xl text-white">{fmtNum(prediction.estimatedViews.mid)}</div>
                </div>
                <div className="text-center">
                  <div className="font-mono-jb text-[10px] text-zinc-600 mb-1">{t('Optimista', 'High')}</div>
                  <div className="font-display font-bold text-xl text-zinc-400">{fmtNum(prediction.estimatedViews.high)}</div>
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
              <div className="flex justify-between font-mono-jb text-[10px] text-zinc-600 mt-2 mx-8">
                <span>0</span>
                <span>{t('Tu media', 'Your avg')}: {fmtNum(baseline.avgViews)}</span>
                <span>{t('Tu mejor', 'Your best')}: {fmtNum(baseline.topVideoViews)}</span>
              </div>
            </div>

            {/* Scores grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-white/8 p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="font-display font-bold text-2xl" style={{ color: scoreColor(prediction.titleScore) }}>
                  {prediction.titleScore}
                </div>
                <div className="font-mono-jb text-[10px] text-zinc-500 mt-1">{t('Título', 'Title')}</div>
              </div>
              <div className="rounded-lg border border-white/8 p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="font-display font-bold text-2xl" style={{ color: scoreColor(prediction.seoScore) }}>
                  {prediction.seoScore}
                </div>
                <div className="font-mono-jb text-[10px] text-zinc-500 mt-1">SEO</div>
              </div>
              <div className="rounded-lg border border-white/8 p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="font-display font-bold text-2xl text-white">
                  {prediction.estimatedEngagement}%
                </div>
                <div className="font-mono-jb text-[10px] text-zinc-500 mt-1">Engagement</div>
              </div>
              <div className="rounded-lg border border-white/8 p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="font-display font-bold text-lg" style={{ color: VIRAL_COLORS[prediction.viralPotential] || '#888' }}>
                  {VIRAL_LABELS[prediction.viralPotential]?.[lang] || prediction.viralPotential}
                </div>
                <div className="font-mono-jb text-[10px] text-zinc-500 mt-1">{t('Potencial viral', 'Viral potential')}</div>
              </div>
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-white/8 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <h3 className="font-display font-bold text-sm text-green-400 mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {t('Fortalezas', 'Strengths')}
                </h3>
                <ul className="space-y-2">
                  {(prediction.strengths || []).map((s, i) => (
                    <li key={i} className="text-sm font-mono-jb text-zinc-300 flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">+</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-white/8 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <h3 className="font-display font-bold text-sm text-yellow-400 mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {t('Mejoras', 'Improvements')}
                </h3>
                <ul className="space-y-2">
                  {(prediction.weaknesses || []).map((w, i) => (
                    <li key={i} className="text-sm font-mono-jb text-zinc-300 flex items-start gap-2">
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
                <p className="text-sm font-mono-jb text-zinc-300 leading-relaxed">{prediction.suggestion}</p>
              </div>
            )}

            {/* Baseline reference */}
            <div className="text-center">
              <span className="inline-flex items-center gap-2 font-mono-jb text-[10px] text-zinc-600 border border-white/8 rounded-full px-4 py-1.5">
                {t(`Basado en tus últimos ${baseline.videoCount} vídeos · ${fmtNum(baseline.subscribers)} subs`, `Based on your last ${baseline.videoCount} videos · ${fmtNum(baseline.subscribers)} subs`)}
              </span>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
