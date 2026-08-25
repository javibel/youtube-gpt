'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useLang } from '@/components/LangProvider';
import { CheckIcon, CrossIcon } from '@/components/icons';

type Lang = 'es' | 'en';

interface Check {
  key: string;
  label: { es: string; en: string };
  passed: boolean;
  impact: number;
}

interface Category {
  key: string;
  label: { es: string; en: string };
  score: number;
  maxScore: number;
  checks: Check[];
}

interface QuickWin {
  label: { es: string; en: string };
  detail: { es: string; en: string };
  action: { label: { es: string; en: string }; href: string };
  priority: 'high' | 'medium' | 'low';
}

interface PatternVideo {
  videoId: string;
  title: string;
  views: number;
  seoScore: number;
}

interface AuditData {
  channelName: string;
  subscribers: number;
  healthScore: number;
  categories: Category[];
  quickWins: QuickWin[];
  patterns: {
    topVideos: PatternVideo[];
    bottomVideos: PatternVideo[];
    patterns: { es: string; en: string }[];
  };
  aiSummary: { es: string; en: string } | null;
  videosAnalyzed: number;
  period: { start: string; end: string };
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function scoreColor(s: number): string {
  if (s >= 70) return '#22c55e';
  if (s >= 40) return '#FFE800';
  return '#e84d5b';
}

function scoreBg(s: number): string {
  if (s >= 70) return 'rgba(34,197,94,0.10)';
  if (s >= 40) return 'rgba(255,232,0,0.08)';
  return 'rgba(232,77,91,0.10)';
}

function scoreLabel(s: number, lang: Lang): string {
  if (lang === 'en') {
    if (s >= 80) return 'Excellent';
    if (s >= 60) return 'Good';
    if (s >= 40) return 'Needs work';
    return 'Critical';
  }
  if (s >= 80) return 'Excelente';
  if (s >= 60) return 'Bien';
  if (s >= 40) return 'Mejorable';
  return 'Crítico';
}

const CATEGORY_ICONS: Record<string, string> = {
  content: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  seo: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  growth: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  engagement: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  consistency: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: 'rgba(232,77,91,0.10)', text: '#e84d5b', border: 'rgba(232,77,91,0.25)' },
  medium: { bg: 'rgba(255,232,0,0.08)', text: '#FFE800', border: 'rgba(255,232,0,0.20)' },
  low: { bg: 'rgba(34,197,94,0.08)', text: '#22c55e', border: 'rgba(34,197,94,0.20)' },
};

// ── Score Ring SVG ──────────────────────────────────────────────────────

function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const r = (size - 14) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s ease-out' }}
      />
    </svg>
  );
}

// ── Mini Ring ───────────────────────────────────────────────────────────

function MiniRing({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <svg width={size} height={size} className="transform -rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
    </svg>
  );
}

export default function AuditPage() {
  const { data: session, status } = useSession();
  const lang = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<AuditData | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    fetch('/api/youtube/audit')
      .then(r => r.json())
      .then(res => {
        if (res.error) {
          if (res.error === 'pro_required') setError(t('Necesitas el plan Pro para la auditoría.', 'Pro plan required for audit.'));
          else if (res.error === 'youtube_not_connected') setError(t('Conecta tu canal de YouTube primero.', 'Connect your YouTube channel first.'));
          else if (res.error === 'no_videos') setError(t('No se encontraron vídeos en tu canal.', 'No videos found on your channel.'));
          else setError(res.error);
        } else {
          setData(res);
        }
      })
      .catch(() => setError(t('Error de conexión', 'Connection error')))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">Channel Audit</h1>
          <p className="mb-6 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesión para auditar tu canal.', 'Sign in to audit your channel.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="yv-page space-y-8">
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('Auditoría de canal', 'Channel Audit')}</span>
            <h1 className="yv-page-header__title">
              {data ? data.channelName : t('Auditoría', 'Audit')}
            </h1>
            {data && (
              <p className="yv-page-header__desc">
                {data.videosAnalyzed} {t('vídeos analizados', 'videos analyzed')} &middot; {data.period.start} — {data.period.end}
              </p>
            )}
          </div>
        </header>
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 justify-center py-20">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="yv-muted font-mono-jb text-sm">{t('Analizando tu canal...', 'Analyzing your channel...')}</span>
            <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{t('Esto puede tardar unos segundos', 'This may take a few seconds')}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-400 font-mono-jb text-sm">{error}</p>
            {(error.includes('Conecta') || error.includes('Connect')) && (
              <a href="/dashboard" className="btn-offset inline-flex px-6 py-2 text-sm font-display mt-4">{t('Ir al panel', 'Go to dashboard')}</a>
            )}
          </div>
        )}

        {data && (
          <>
            {/* ── Health Score Hero ───────────────────────────────────────── */}
            <div className="yv-card p-8">
              <div className="flex flex-col md:flex-row items-center gap-8">
                {/* Score Ring */}
                <div className="relative shrink-0">
                  <ScoreRing score={data.healthScore} size={160} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display font-bold text-4xl" style={{ color: scoreColor(data.healthScore) }}>
                      {data.healthScore}
                    </span>
                    <span className="font-mono-jb text-[13px] tracking-wider yv-muted uppercase">
                      {t('SALUD', 'HEALTH')}
                    </span>
                  </div>
                </div>

                {/* Summary */}
                <div className="flex-1 text-center md:text-left">
                  <h2 className="font-display font-bold text-2xl text-white mb-1">
                    {scoreLabel(data.healthScore, lang)}
                  </h2>
                  <p className="yv-muted font-mono-jb text-sm mb-4">
                    {data.subscribers > 0 && <>{fmtNum(data.subscribers)} {t('suscriptores', 'subscribers')} &middot; </>}
                    {data.videosAnalyzed} {t('vídeos analizados', 'videos analyzed')}
                  </p>

                  {/* Category mini-bars */}
                  <div className="grid grid-cols-5 gap-3">
                    {data.categories.map(cat => (
                      <div key={cat.key} className="text-center">
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{ width: `${cat.score}%`, background: scoreColor(cat.score) }}
                          />
                        </div>
                        <span className="font-mono-jb text-[13px] yv-muted mt-1 block">{cat.label[lang]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── AI Summary ─────────────────────────────────────────────── */}
            {data.aiSummary && (
              <div className="yv-card p-6" style={{ background: 'var(--yv-brand-soft)', borderColor: 'var(--yv-brand-border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B2020" strokeWidth="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                  <span className="font-display font-bold text-sm text-white">AI Insights</span>
                </div>
                <p className="font-mono-jb text-sm text-[color:var(--yv-text-2)] whitespace-pre-line leading-relaxed">
                  {data.aiSummary[lang]}
                </p>
              </div>
            )}

            {/* ── Categories Grid ────────────────────────────────────────── */}
            <div>
              <h2 className="font-display font-bold text-xl text-white mb-4">
                {t('Desglose por categoría', 'Category breakdown')}
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.categories.map(cat => {
                  const isExpanded = expandedCat === cat.key;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => setExpandedCat(isExpanded ? null : cat.key)}
                      className="yv-card yv-glass--hover p-5 text-left transition"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="relative">
                          <MiniRing score={cat.score} size={48} />
                          <span className="absolute inset-0 flex items-center justify-center font-display font-bold text-[13px]" style={{ color: scoreColor(cat.score) }}>
                            {cat.score}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={scoreColor(cat.score)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d={CATEGORY_ICONS[cat.key] || 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'} />
                            </svg>
                            <span className="font-display font-bold text-sm text-white">{cat.label[lang]}</span>
                          </div>
                          <span className="font-mono-jb text-[13px] yv-muted">
                            {cat.checks.filter(c => c.passed).length}/{cat.checks.length} {t('checks', 'checks')}
                          </span>
                        </div>
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          className={`yv-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>

                      {/* Expanded checks */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 space-y-2" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)' }}>
                          {cat.checks.map(check => (
                            <div key={check.key} className="flex items-center gap-2">
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${check.passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {check.passed ? <CheckIcon size={10} /> : <CrossIcon size={10} />}
                              </span>
                              <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-2)' }}>{check.label[lang]}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Quick Wins ─────────────────────────────────────────────── */}
            {data.quickWins.length > 0 && (
              <div>
                <h2 className="font-display font-bold text-xl text-white mb-1">
                  {t('Quick Wins', 'Quick Wins')}
                </h2>
                <p className="yv-muted font-mono-jb text-[13px] mb-4">
                  {t('Acciones concretas para mejorar tu canal ahora mismo', 'Concrete actions to improve your channel right now')}
                </p>
                <div className="space-y-3">
                  {data.quickWins.map((win, i) => {
                    const colors = PRIORITY_COLORS[win.priority];
                    return (
                      <div
                        key={i}
                        className="rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                        style={{ background: colors.bg, boxShadow: `inset 0 1px 0 ${colors.border}` }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="font-mono-jb text-[13px] tracking-wider uppercase px-1.5 py-0.5 rounded"
                              style={{ background: colors.border, color: colors.text }}
                            >
                              {win.priority === 'high' ? t('ALTA', 'HIGH') : win.priority === 'medium' ? t('MEDIA', 'MED') : t('BAJA', 'LOW')}
                            </span>
                            <span className="font-display font-bold text-sm text-white truncate">{win.label[lang]}</span>
                          </div>
                          <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-2)' }}>{win.detail[lang]}</p>
                        </div>
                        <a
                          href={win.action.href}
                          className="yv-chip shrink-0 font-mono-jb text-[13px] tracking-wider px-4 py-2 text-white text-center"
                        >
                          {win.action.label[lang]} &rarr;
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Pattern Analysis ───────────────────────────────────────── */}
            {data.patterns.patterns.length > 0 && (
              <div>
                <h2 className="font-display font-bold text-xl text-white mb-1">
                  {t('Patrones detectados', 'Detected patterns')}
                </h2>
                <p className="yv-muted font-mono-jb text-[13px] mb-4">
                  {t('Qué tienen en común tus TOP vídeos vs los que menos funcionan', 'What your TOP videos have in common vs your underperformers')}
                </p>

                {/* Pattern insights */}
                <div className="space-y-2 mb-6">
                  {data.patterns.patterns.map((p, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg p-3" style={{ background: 'var(--yv-glass-chip)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B2020" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      <span className="font-mono-jb text-sm text-[color:var(--yv-text-2)]">{p[lang]}</span>
                    </div>
                  ))}
                </div>

                {/* Top vs Bottom videos */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Top */}
                  <div className="yv-card p-4" style={{ background: 'rgba(34,197,94,0.04)' }}>
                    <h3 className="font-display font-bold text-sm text-green-400 mb-3 flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                      TOP {t('vídeos', 'videos')}
                    </h3>
                    <div className="space-y-2">
                      {data.patterns.topVideos.map((v, i) => (
                        <a
                          key={v.videoId}
                          href={`/optimize?videoId=${v.videoId}`}
                          className="flex items-center gap-3 rounded p-2 hover:bg-white/5 transition"
                        >
                          <span className="font-mono-jb text-[13px] w-4" style={{ color: 'var(--yv-text-4)' }}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono-jb text-[13px] text-white truncate">{v.title}</div>
                            <div className="font-mono-jb text-[13px] yv-muted">{fmtNum(v.views)} views &middot; SEO {v.seoScore}</div>
                          </div>
                          <span className="font-mono-jb text-[13px] px-1.5 py-0.5 rounded" style={{ background: scoreBg(v.seoScore), color: scoreColor(v.seoScore) }}>
                            {v.seoScore}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* Bottom */}
                  <div className="yv-card p-4" style={{ background: 'rgba(232,77,91,0.04)' }}>
                    <h3 className="font-display font-bold text-sm text-red-400 mb-3 flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                      {t('Peor rendimiento', 'Underperformers')}
                    </h3>
                    <div className="space-y-2">
                      {data.patterns.bottomVideos.map((v, i) => (
                        <a
                          key={v.videoId}
                          href={`/optimize?videoId=${v.videoId}`}
                          className="flex items-center gap-3 rounded p-2 hover:bg-white/5 transition"
                        >
                          <span className="font-mono-jb text-[13px] w-4" style={{ color: 'var(--yv-text-4)' }}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono-jb text-[13px] text-white truncate">{v.title}</div>
                            <div className="font-mono-jb text-[13px] yv-muted">{fmtNum(v.views)} views &middot; SEO {v.seoScore}</div>
                          </div>
                          <span className="font-mono-jb text-[13px] px-1.5 py-0.5 rounded" style={{ background: scoreBg(v.seoScore), color: scoreColor(v.seoScore) }}>
                            {v.seoScore}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
