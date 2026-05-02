'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getLangClient } from '@/lib/get-lang-client';
import DashboardShell from '@/components/DashboardShell';

type Lang = 'es' | 'en';

interface CheckItem {
  key: string;
  label: { es: string; en: string };
  passed: boolean;
  detail: { es: string; en: string };
  weight: number;
}

interface VideoScore {
  videoId: string;
  title?: string;
  thumbnail?: string;
  publishedAt?: string;
  views?: number;
  score: number;
  checklist: CheckItem[];
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function fmtDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#FFE800';
  return '#e84d5b';
}

function scoreBg(score: number): string {
  if (score >= 70) return 'rgba(34,197,94,0.12)';
  if (score >= 40) return 'rgba(255,232,0,0.10)';
  return 'rgba(232,77,91,0.12)';
}

function scoreLabel(score: number, lang: Lang): string {
  if (score >= 70) return lang === 'en' ? 'Good' : 'Bien';
  if (score >= 40) return lang === 'en' ? 'Needs work' : 'Mejorable';
  return lang === 'en' ? 'Poor' : 'Bajo';
}

export default function SeoScorePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('es');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scores, setScores] = useState<VideoScore[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => { setLang(getLangClient()); }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  // Load cached scores on mount
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/youtube/seo-score')
      .then(r => r.json())
      .then(data => {
        if (data.scores?.length) {
          setScores(data.scores);
        }
        setHasLoaded(true);
      })
      .catch(() => setHasLoaded(true));
  }, [status]);

  async function handleAnalyze() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/youtube/seo-score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'pro_required') {
          setError(t('Esta función requiere el plan Pro.', 'This feature requires the Pro plan.'));
        } else if (data.error === 'youtube_not_connected') {
          setError(t('Conecta tu canal de YouTube primero desde el Dashboard.', 'Connect your YouTube channel first from the Dashboard.'));
        } else {
          setError(data.error || 'Error');
        }
        return;
      }
      setScores(data.scores || []);
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
          <h1 className="font-display font-bold text-3xl text-white mb-4">SEO Score</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para analizar tus vídeos.', 'Sign in to analyze your videos.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v.score, 0) / scores.length) : 0;

  return (
    <DashboardShell>
      <div className="yv-page">

        {/* Page title */}
        <div className="mb-10">
          <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
            {t('ANÁLISIS SEO', 'SEO ANALYSIS')}
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl text-white leading-tight">
            {t('SEO Score', 'SEO Score')}<br />
            <span style={{ color: 'var(--red)' }}>{t('de tus vídeos.', 'for your videos.')}</span>
          </h1>
          <p className="text-zinc-500 mt-3 text-sm font-mono-jb max-w-xl">
            {t(
              'Analiza título, descripción, tags, subtítulos, engagement y más. Cada vídeo recibe un score de 0 a 100 con recomendaciones específicas.',
              'Analyze title, description, tags, captions, engagement and more. Each video gets a score from 0 to 100 with specific recommendations.'
            )}
          </p>
        </div>

        {/* Analyze button */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="btn-offset px-8 py-3 text-sm font-mono-jb tracking-wider"
            style={{ borderRadius: '10px' }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('Analizando...', 'Analyzing...')}
              </span>
            ) : (
              t('Analizar mis vídeos', 'Analyze my videos')
            )}
          </button>
          {scores.length > 0 && (
            <div className="flex items-center gap-3">
              <div
                className="px-4 py-2 rounded-lg font-mono-jb text-sm font-bold"
                style={{ background: scoreBg(avgScore), color: scoreColor(avgScore), border: `1px solid ${scoreColor(avgScore)}33` }}
              >
                {t('Media', 'Average')}: {avgScore}/100
              </div>
              <span className="text-zinc-600 text-xs font-mono-jb">
                {scores.length} {t('vídeos', 'videos')}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-mono-jb">
            {error}
          </div>
        )}

        {/* Empty state */}
        {hasLoaded && scores.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📊</div>
            <p className="text-zinc-400 font-mono-jb text-sm">
              {t(
                'Pulsa "Analizar mis vídeos" para obtener el SEO Score de tus últimos 10 vídeos.',
                'Click "Analyze my videos" to get the SEO Score for your last 10 videos.'
              )}
            </p>
          </div>
        )}

        {/* Video scores list */}
        <div className="space-y-4">
          {scores.map(video => {
            const isExpanded = expanded === video.videoId;
            const aiTip = video.checklist.find(c => c.key === 'ai_tip');
            const checks = video.checklist.filter(c => c.key !== 'ai_tip');
            const passed = checks.filter(c => c.passed).length;
            const total = checks.length;

            return (
              <div
                key={video.videoId}
                className="rounded-xl border border-white/10 overflow-hidden transition-all"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                {/* Video header row */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : video.videoId)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.03] transition"
                >
                  {/* Thumbnail */}
                  {video.thumbnail && (
                    <img
                      src={video.thumbnail}
                      alt=""
                      className="w-28 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-display font-semibold text-sm truncate">{video.title || video.videoId}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-zinc-500 font-mono-jb text-[11px]">
                        {fmtNum(video.views)} {t('vistas', 'views')}
                      </span>
                      {video.publishedAt && (
                        <span className="text-zinc-600 font-mono-jb text-[11px]">
                          {fmtDate(video.publishedAt, lang)}
                        </span>
                      )}
                      <span className="text-zinc-600 font-mono-jb text-[11px]">
                        {passed}/{total} {t('checks', 'checks')}
                      </span>
                    </div>
                  </div>

                  {/* Score badge */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div
                      className="w-14 h-14 rounded-xl flex flex-col items-center justify-center font-mono-jb"
                      style={{ background: scoreBg(video.score), border: `1px solid ${scoreColor(video.score)}33` }}
                    >
                      <span className="text-lg font-bold" style={{ color: scoreColor(video.score) }}>{video.score}</span>
                      <span className="text-[9px]" style={{ color: scoreColor(video.score), opacity: 0.7 }}>{scoreLabel(video.score, lang)}</span>
                    </div>
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </button>

                {/* Expanded checklist */}
                {isExpanded && (
                  <div className="border-t border-white/10 p-4 space-y-2">
                    {/* AI Tip */}
                    {aiTip && (
                      <div className="mb-4 p-3 rounded-lg border border-purple-500/30" style={{ background: 'rgba(139,92,246,0.08)' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                          </svg>
                          <span className="font-mono-jb text-[11px] tracking-wider text-purple-400 uppercase">
                            {t('Consejo IA', 'AI Tip')}
                          </span>
                        </div>
                        <p className="text-zinc-300 text-sm font-mono-jb">
                          {lang === 'en' ? aiTip.detail.en : aiTip.detail.es}
                        </p>
                      </div>
                    )}

                    {/* Check items */}
                    {checks.map(check => (
                      <div
                        key={check.key}
                        className="flex items-start gap-3 p-3 rounded-lg"
                        style={{ background: check.passed ? 'rgba(34,197,94,0.05)' : 'rgba(232,77,91,0.05)' }}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {check.passed ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e84d5b" strokeWidth="2.5">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-display font-medium">
                            {lang === 'en' ? check.label.en : check.label.es}
                          </p>
                          <p className="text-zinc-500 text-xs font-mono-jb mt-0.5">
                            {lang === 'en' ? check.detail.en : check.detail.es}
                          </p>
                        </div>
                        {check.weight > 0 && (
                          <span className="flex-shrink-0 text-zinc-600 font-mono-jb text-[10px]">
                            {t('peso', 'weight')}: {check.weight}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
