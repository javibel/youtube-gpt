'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface CountryRow { country: string; views: number; watchTime: number; cpm: number; estimatedRevenue: number }
interface VideoRevenue { videoId: string; title: string; views: number; watchTime: number; estimatedRevenue: number; thumbnail: string }
interface MonthData { month: string; views: number; watchTime: number; estimatedRevenue: number }

interface RevenueData {
  hasRealRevenue: boolean;
  revenue28d: number;
  weightedCPM: number;
  totalViews28: number;
  totalWatchTime28: number;
  countries: CountryRow[];
  videos: VideoRevenue[];
  months: MonthData[];
  projection: { daily: number; monthly: number; yearly: number };
  aiInsights: {
    optimizationPotential: string;
    missedRevenue: string;
    tips: string[];
    cpmStrategy: string;
  } | null;
  channelName: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸', CA: '🇨🇦', GB: '🇬🇧', AU: '🇦🇺', DE: '🇩🇪', FR: '🇫🇷', NL: '🇳🇱',
  SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰', CH: '🇨🇭', AT: '🇦🇹', BE: '🇧🇪', IE: '🇮🇪',
  JP: '🇯🇵', KR: '🇰🇷', SG: '🇸🇬', NZ: '🇳🇿', FI: '🇫🇮', IT: '🇮🇹', ES: '🇪🇸',
  PT: '🇵🇹', BR: '🇧🇷', MX: '🇲🇽', AR: '🇦🇷', CO: '🇨🇴', CL: '🇨🇱', PE: '🇵🇪',
  IN: '🇮🇳', PH: '🇵🇭', ID: '🇮🇩', TH: '🇹🇭', VN: '🇻🇳', PK: '🇵🇰',
  PL: '🇵🇱', CZ: '🇨🇿', RO: '🇷🇴', HU: '🇭🇺', TR: '🇹🇷', RU: '🇷🇺',
  ZA: '🇿🇦', EG: '🇪🇬', NG: '🇳🇬', KE: '🇰🇪',
};

function fmt$(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(2)}`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function RevenuePage() {
  const { data: session, status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    fetch(`/api/youtube/revenue?lang=${lang}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) setError(json.error === 'pro_required' ? t('Plan Pro requerido.', 'Pro plan required.') : json.error);
        else setData(json);
      })
      .catch(() => setError(t('Error de conexión', 'Connection error')))
      .finally(() => setLoading(false));
  }, [status, lang]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Estimando ingresos...', 'Estimating revenue...')}</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Revenue Estimator', 'Revenue Estimator')}</h1>
          <p className="mb-6 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesión para ver tus estimaciones.', 'Sign in to view your estimates.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  const maxRevCountry = data ? Math.max(...data.countries.map(c => c.estimatedRevenue), 1) : 1;
  const maxRevVideo = data ? Math.max(...data.videos.map(v => v.estimatedRevenue), 1) : 1;
  const maxMonthRev = data ? Math.max(...data.months.map(m => m.estimatedRevenue), 1) : 1;

  return (
    <DashboardShell>
      {/* Header */}
      <div className="yv-page">
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">
              {t('ESTIMADOR DE INGRESOS', 'REVENUE ESTIMATOR')}
            </span>
            <h1 className="yv-page-header__title">
              {data?.channelName || t('Tu canal', 'Your channel')}
            </h1>
            {data && !data.hasRealRevenue && (
              <p className="yv-page-header__desc font-mono-jb text-[11px]">
                {t('Estimaciones basadas en CPM por país. Los datos reales aparecerán si el canal está monetizado.', 'Estimates based on country CPM. Real data will appear if channel is monetized.')}
              </p>
            )}
            {data?.hasRealRevenue && (
              <p className="font-mono-jb text-[11px] text-green-400/80">
                {t('Datos de ingresos reales de YouTube Analytics', 'Real revenue data from YouTube Analytics')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="yv-page">
        {error && (
          <div className="text-center py-12">
            <p className="text-red-400 font-mono-jb text-sm">{error}</p>
            {error.includes('youtube_not_connected') && (
              <a href="/dashboard" className="btn-offset inline-flex px-6 py-2 text-sm font-display mt-4">{t('Conectar canal', 'Connect channel')}</a>
            )}
          </div>
        )}

        {data && (
          <>
            {/* Projection cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {[
                { label: t('Ingresos 28d', 'Revenue 28d'), value: fmt$(data.revenue28d), color: '#22c55e' },
                { label: t('Proyección mensual', 'Monthly projection'), value: fmt$(data.projection.monthly), color: '#3b82f6' },
                { label: t('Proyección anual', 'Yearly projection'), value: fmt$(data.projection.yearly), color: '#a855f7' },
                { label: t('CPM medio', 'Avg CPM'), value: `$${data.weightedCPM.toFixed(2)}`, color: '#eab308' },
              ].map((card, i) => (
                <div key={i} className="yv-card p-4">
                  <p className="font-mono-jb text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--yv-text-3)' }}>{card.label}</p>
                  <p className="font-display font-bold text-xl md:text-2xl" style={{ color: card.color }}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Revenue by country */}
              <div className="yv-card">
                <h2 className="font-display font-bold text-white text-sm mb-4">{t('Ingresos por país', 'Revenue by Country')}</h2>
                <div className="space-y-2">
                  {data.countries.slice(0, 12).map(c => (
                    <div key={c.country} className="flex items-center gap-2">
                      <span className="text-sm w-6 text-center">{COUNTRY_FLAGS[c.country] || '🌍'}</span>
                      <span className="font-mono-jb text-[11px] w-8" style={{ color: 'var(--yv-text-2)' }}>{c.country}</span>
                      <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, (c.estimatedRevenue / maxRevCountry) * 100)}%`,
                            background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                          }}
                        />
                      </div>
                      <span className="font-mono-jb text-[11px] text-green-400 w-16 text-right">{fmt$(c.estimatedRevenue)}</span>
                      <span className="font-mono-jb text-[10px] w-14 text-right" style={{ color: 'var(--yv-text-4)' }}>${c.cpm} CPM</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly trend */}
              <div className="yv-card">
                <h2 className="font-display font-bold text-white text-sm mb-4">{t('Tendencia mensual', 'Monthly Trend')}</h2>
                {data.months.length > 0 ? (
                  <div className="space-y-3">
                    {data.months.map(m => (
                      <div key={m.month}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono-jb text-[11px]" style={{ color: 'var(--yv-text-2)' }}>{m.month}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-4)' }}>{fmtNum(m.views)} views</span>
                            <span className="font-mono-jb text-[11px] text-green-400 font-bold">{fmt$(m.estimatedRevenue)}</span>
                          </div>
                        </div>
                        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, (m.estimatedRevenue / maxMonthRev) * 100)}%`,
                              background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-4)' }}>{t('Sin datos mensuales suficientes', 'Not enough monthly data')}</p>
                )}
              </div>
            </div>

            {/* Top videos by revenue */}
            <div className="yv-card mb-8">
              <h2 className="font-display font-bold text-white text-sm mb-4">{t('Top vídeos por ingresos (28d)', 'Top Videos by Revenue (28d)')}</h2>
              <div className="space-y-2">
                {data.videos.map((v, i) => (
                  <div key={v.videoId} className="flex items-center gap-3 group">
                    <span className="font-mono-jb text-[11px] w-5 text-right" style={{ color: 'var(--yv-text-4)' }}>{i + 1}</span>
                    {v.thumbnail && (
                      <img src={v.thumbnail} alt="" className="w-16 h-9 rounded object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <a
                        href={`https://youtube.com/watch?v=${v.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono-jb text-[11px] text-white hover:text-green-400 transition truncate block"
                      >
                        {v.title}
                      </a>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-4)' }}>{fmtNum(v.views)} views</span>
                        <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-4)' }}>{(v.watchTime / 60).toFixed(0)}h watch</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-3 rounded-full overflow-hidden hidden md:block" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(3, (v.estimatedRevenue / maxRevVideo) * 100)}%`,
                            background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                          }}
                        />
                      </div>
                      <span className="font-mono-jb text-[12px] text-green-400 font-bold w-16 text-right">{fmt$(v.estimatedRevenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Insights */}
            {data.aiInsights && (
              <div className="yv-card mb-8" style={{ borderColor: 'rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.04)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  <h2 className="font-display font-bold text-white text-sm">{t('AI: Potencial de optimización', 'AI: Optimization Potential')}</h2>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="yv-card p-3">
                    <p className="font-mono-jb text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--yv-text-3)' }}>{t('Potencial', 'Potential')}</p>
                    <p className="font-mono-jb text-[12px] text-white leading-relaxed">{data.aiInsights.optimizationPotential}</p>
                  </div>
                  <div className="yv-card p-3">
                    <p className="font-mono-jb text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--yv-text-3)' }}>{t('Ingresos que dejas de ganar', 'Revenue left on the table')}</p>
                    <p className="font-mono-jb text-[14px] text-yellow-400 font-bold">{data.aiInsights.missedRevenue}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="font-mono-jb text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--yv-text-3)' }}>{t('Estrategia CPM', 'CPM Strategy')}</p>
                  <p className="font-mono-jb text-[12px] text-purple-300/80 leading-relaxed">{data.aiInsights.cpmStrategy}</p>
                </div>

                <div>
                  <p className="font-mono-jb text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--yv-text-3)' }}>{t('Tips de monetización', 'Monetization Tips')}</p>
                  <div className="space-y-1.5">
                    {data.aiInsights.tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="font-mono-jb text-[10px] text-green-400 mt-0.5">{i + 1}.</span>
                        <p className="font-mono-jb text-[11px] leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: t('Views 28d', 'Views 28d'), value: fmtNum(data.totalViews28) },
                { label: t('Watch time 28d', 'Watch time 28d'), value: `${(data.totalWatchTime28 / 60).toFixed(0)}h` },
                { label: t('Ingresos/día', 'Revenue/day'), value: fmt$(data.projection.daily) },
                { label: t('Ingresos/1K views', 'Revenue/1K views'), value: data.totalViews28 > 0 ? fmt$(data.revenue28d / (data.totalViews28 / 1000)) : '$0' },
              ].map((s, i) => (
                <div key={i} className="yv-card p-3 text-center">
                  <p className="font-mono-jb text-[10px] uppercase tracking-wider" style={{ color: 'var(--yv-text-4)' }}>{s.label}</p>
                  <p className="font-mono-jb text-[14px] text-white font-bold mt-1">{s.value}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
