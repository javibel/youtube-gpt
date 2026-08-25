'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useLang } from '@/components/LangProvider';
import DashboardShell from '@/components/DashboardShell';
import ToolLoginGate from '@/components/ToolLoginGate';

type Lang = 'es' | 'en';

interface Traffic { insightTrafficSourceType: string; views: number; estimatedMinutesWatched: number }
interface Country { country: string; views: number; estimatedMinutesWatched: number }
interface TopVideo { video: string; title: string; views: number; estimatedMinutesWatched: number; averageViewDuration: number; likes: number; subscribersGained: number }
interface DailyPoint { day: string; views: number; estimatedMinutesWatched: number; subscribersGained: number; subscribersLost: number }

interface AnalyticsData {
  overview: Record<string, number>;
  traffic: Traffic[];
  countries: Country[];
  topVideos: TopVideo[];
  daily: DailyPoint[];
  aiInsight: { es: string; en: string } | null;
  channelName: string;
  period: { start: string; end: string };
}

const TRAFFIC_LABELS: Record<string, Record<Lang, string>> = {
  YT_SEARCH: { es: 'Búsqueda YouTube', en: 'YouTube Search' },
  SUGGESTED: { es: 'Sugeridos', en: 'Suggested' },
  EXT_URL: { es: 'Enlaces externos', en: 'External URLs' },
  SUBSCRIBER: { es: 'Suscriptores', en: 'Subscribers' },
  NOTIFICATION: { es: 'Notificaciones', en: 'Notifications' },
  PLAYLIST: { es: 'Playlists', en: 'Playlists' },
  YT_CHANNEL: { es: 'Página del canal', en: 'Channel page' },
  NO_LINK_OTHER: { es: 'Directo / otros', en: 'Direct / other' },
  END_SCREEN: { es: 'Pantallas finales', en: 'End screens' },
  YT_OTHER_PAGE: { es: 'Otros YouTube', en: 'Other YouTube' },
  SHORTS: { es: 'Shorts', en: 'Shorts' },
};

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtHours(min: number): string {
  const h = min / 60;
  if (h >= 1000) return (h / 1000).toFixed(1) + 'K h';
  return Math.round(h) + ' h';
}

function barColor(i: number): string {
  const colors = ['#9B2020', '#c43030', '#e04040', '#ff6060', '#ff8080', '#444', '#555', '#666', '#777', '#888'];
  return colors[i] || '#555';
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const lang = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    fetch(`/api/youtube/analytics?lang=${lang}`)
      .then(r => r.json())
      .then(res => {
        if (res.error) {
          if (res.error === 'pro_required') setError(t('Necesitas el plan Pro.', 'Pro plan required.'));
          else if (res.error === 'youtube_not_connected') setError(t('Conecta tu canal de YouTube primero.', 'Connect your YouTube channel first.'));
          else setError(res.error);
        } else {
          setData(res);
        }
      })
      .catch(() => setError(t('Error de conexión', 'Connection error')))
      .finally(() => setLoading(false));
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
      <ToolLoginGate
        eyebrow={{ es: 'ANALYTICS DEL CANAL', en: 'CHANNEL ANALYTICS' }}
        title={{ es: 'Entiende el crecimiento', en: 'Understand the Growth' }}
        highlight={{ es: 'de tu canal', en: 'of Your Channel' }}
        description={{
          es: 'Dashboard de analytics avanzado: vistas diarias, fuentes de tráfico, países, top vídeos y suscriptores. Todo en una vista clara y accionable.',
          en: 'Advanced analytics dashboard: daily views, traffic sources, countries, top videos, and subscribers. All in one clear, actionable view.',
        }}
        color="#00FFA3"
        featuresHref="/features/channel-analytics"
        bullets={[
          { icon: '/icons/chart-up.webp', title: { es: 'Vistas diarias', en: 'Daily views' }, desc: { es: 'Evolución real de tu canal día a día', en: 'Your channel\'s real day-by-day evolution' } },
          { icon: '/icons/globe.webp', title: { es: 'Tráfico y países', en: 'Traffic & countries' }, desc: { es: 'De dónde vienen tus espectadores', en: 'Where your viewers come from' } },
          { icon: '/icons/clapperboard.webp', title: { es: 'Top vídeos', en: 'Top videos' }, desc: { es: 'Qué contenido está funcionando mejor', en: 'Which content is performing best' } },
        ]}
      />
    );
  }

  // Interactive chart with hover tooltip
  function InteractiveChart({ points, dataKey, label }: { points: DailyPoint[]; dataKey: 'views' | 'estimatedMinutesWatched'; label: string }) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    if (points.length < 2) return null;
    const vals = points.map(p => p[dataKey]);
    const max = Math.max(...vals, 1);
    const w = 600;
    const h = 120;
    const padding = 4;

    const getX = (i: number) => padding + (i / (vals.length - 1)) * (w - padding * 2);
    const getY = (v: number) => h - padding - (v / max) * (h - padding * 2);

    const pts = vals.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');
    const fillPts = `${getX(0)},${h} ${pts} ${getX(vals.length - 1)},${h}`;

    function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const pct = relX / rect.width;
      const idx = Math.round(pct * (vals.length - 1));
      const clamped = Math.max(0, Math.min(vals.length - 1, idx));
      setHoverIdx(clamped);
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;
    const hoverVal = hoverIdx !== null ? vals[hoverIdx] : 0;

    return (
      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full"
          style={{ height: 140 }}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Fill area */}
          <polyline points={fillPts} fill="rgba(155,32,32,0.12)" stroke="none" />
          {/* Line */}
          <polyline points={pts} fill="none" stroke="#e84d5b" strokeWidth="2" />

          {/* Vertical hover line */}
          {hoverIdx !== null && (
            <>
              <line
                x1={getX(hoverIdx)} y1={0}
                x2={getX(hoverIdx)} y2={h}
                stroke="rgba(232,77,91,0.4)" strokeWidth="1" strokeDasharray="3,3"
              />
              <circle
                cx={getX(hoverIdx)} cy={getY(hoverVal)}
                r="4" fill="#e84d5b" stroke="#fff" strokeWidth="1.5"
              />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hoverPoint && (
          <div
            className="absolute pointer-events-none z-10"
            style={{
              left: mousePos.x,
              top: mousePos.y - 70,
              transform: 'translateX(-50%)',
            }}
          >
            <div
              className="font-mono-jb text-[12px] rounded-lg px-3 py-2 shadow-lg"
              style={{
                background: 'var(--yv-bg-2)',
                border: '1px solid var(--yv-border)',
                color: 'var(--yv-text-1)',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ color: 'var(--yv-text-3)', marginBottom: 2 }}>{hoverPoint.day}</div>
              <div style={{ fontWeight: 600 }}>{fmtNum(hoverVal)} {label}</div>
              {dataKey === 'views' && (
                <div style={{ color: 'var(--yv-text-3)', fontSize: 11 }}>
                  +{hoverPoint.subscribersGained} subs · {fmtHours(hoverPoint.estimatedMinutesWatched)} watch
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const ov = data?.overview;

  return (
    <DashboardShell>
      <div className="yv-page space-y-8">
        {/* §3 Page header */}
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('Analytics privados', 'Private Analytics')}</span>
            <h1 className="yv-page-header__title">
              {data?.channelName || 'Analytics'}
            </h1>
            {data?.period && (
              <p className="yv-page-header__desc">
                {t('Datos de tu canal en los últimos 28 días.', 'Your channel data from the last 28 days.')}
                {' '}<span style={{ fontFamily: 'var(--yv-font-mono)', fontSize: 'var(--yv-text-xs)', color: 'var(--yv-text-3)' }}>
                  {data.period.start} — {data.period.end}
                </span>
              </p>
            )}
          </div>
        </header>
        {loading && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Cargando analytics...', 'Loading analytics...')}</span>
          </div>
        )}

        {error && (
          <div className="text-center py-12">
            <p className="text-red-400 font-mono-jb text-sm">{error}</p>
            {error.includes('youtube_not_connected') || error.includes('Conecta') ? (
              <a href="/dashboard" className="btn-offset inline-flex px-6 py-2 text-sm font-display mt-4">{t('Ir al panel', 'Go to dashboard')}</a>
            ) : null}
          </div>
        )}

        {data && ov && (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: t('Visualizaciones', 'Views'), value: fmtNum(ov.views || 0) },
                { label: t('Tiempo de visualización', 'Watch time'), value: fmtHours(ov.estimatedMinutesWatched || 0) },
                { label: t('Duración media', 'Avg view duration'), value: fmtDuration(ov.averageViewDuration || 0) },
                { label: t('% medio visto', 'Avg % viewed'), value: `${Math.round(ov.averageViewPercentage || 0)}%` },
                { label: t('Suscriptores +', 'Subscribers +'), value: `+${fmtNum(ov.subscribersGained || 0)}` },
                { label: t('Suscriptores -', 'Subscribers -'), value: `-${fmtNum(ov.subscribersLost || 0)}` },
                { label: 'Likes', value: fmtNum(ov.likes || 0) },
                { label: t('Comentarios', 'Comments'), value: fmtNum(ov.comments || 0) },
              ].map((card, i) => (
                <div key={i} className="yv-card p-4">
                  <div className="font-display font-bold text-xl" style={{ color: 'var(--yv-text-1)' }}>{card.value}</div>
                  <div className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-3)' }}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* AI analysis */}
            {data.aiInsight && (
              <div className="yv-card p-5">
                <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2" style={{ color: 'var(--yv-text-1)' }}>
                  <span aria-hidden>✨</span> {t('Análisis de Claude', 'Claude analysis')}
                </h2>
                <p className="font-mono-jb text-[13px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--yv-text-2)' }}>
                  {data.aiInsight[lang]}
                </p>
              </div>
            )}

            {/* Daily views chart */}
            {data.daily.length > 2 && (
              <div className="yv-card p-5">
                <h2 className="font-display font-bold text-lg mb-3" style={{ color: 'var(--yv-text-1)' }}>
                  {t('Visualizaciones diarias (90 días)', 'Daily views (90 days)')}
                </h2>
                <InteractiveChart points={data.daily} dataKey="views" label={t('vistas', 'views')} />
                <div className="flex justify-between font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>
                  <span>{data.daily[0]?.day}</span>
                  <span>{data.daily[data.daily.length - 1]?.day}</span>
                </div>
              </div>
            )}

            {/* Two columns: Traffic + Countries */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Traffic sources */}
              {data.traffic.length > 0 && (
                <div className="yv-card p-5">
                  <h2 className="font-display font-bold text-lg mb-4" style={{ color: 'var(--yv-text-1)' }}>
                    {t('Fuentes de tráfico', 'Traffic sources')}
                  </h2>
                  <div className="space-y-2">
                    {data.traffic.slice(0, 8).map((src, i) => {
                      const totalViews = data.traffic.reduce((s, x) => s + x.views, 0);
                      const pct = totalViews > 0 ? (src.views / totalViews) * 100 : 0;
                      const label = TRAFFIC_LABELS[src.insightTrafficSourceType]?.[lang] || src.insightTrafficSourceType;
                      return (
                        <div key={i}>
                          <div className="flex justify-between font-mono-jb text-[13px] mb-0.5">
                            <span style={{ color: 'var(--yv-text-2)' }}>{label}</span>
                            <span style={{ color: 'var(--yv-text-3)' }}>{fmtNum(src.views)} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor(i) }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top countries */}
              {data.countries.length > 0 && (
                <div className="yv-card p-5">
                  <h2 className="font-display font-bold text-lg mb-4" style={{ color: 'var(--yv-text-1)' }}>
                    {t('Países principales', 'Top countries')}
                  </h2>
                  <div className="space-y-2">
                    {data.countries.slice(0, 8).map((c, i) => {
                      const totalViews = data.countries.reduce((s, x) => s + x.views, 0);
                      const pct = totalViews > 0 ? (c.views / totalViews) * 100 : 0;
                      return (
                        <div key={i}>
                          <div className="flex justify-between font-mono-jb text-[13px] mb-0.5">
                            <span style={{ color: 'var(--yv-text-2)' }}>{c.country}</span>
                            <span style={{ color: 'var(--yv-text-3)' }}>{fmtNum(c.views)} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor(i) }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Top Videos */}
            {data.topVideos.length > 0 && (
              <div className="yv-card p-5">
                <h2 className="font-display font-bold text-lg mb-4" style={{ color: 'var(--yv-text-1)' }}>
                  {t('Vídeos principales (28 días)', 'Top videos (28 days)')}
                </h2>
                <div className="overflow-x-auto">
                  <table className="yv-table">
                    <thead>
                      <tr>
                        <th>{t('Vídeo', 'Video')}</th>
                        <th className="yv-num-cell">{t('Vistas', 'Views')}</th>
                        <th className="yv-num-cell">{t('Duración media', 'Avg duration')}</th>
                        <th className="yv-num-cell">Likes</th>
                        <th className="yv-num-cell">{t('Subs +', 'Subs +')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topVideos.map((v, i) => (
                        <tr key={i}>
                          <td>
                            <a
                              href={`https://www.youtube.com/watch?v=${v.video}`}
                              target="_blank"
                              rel="noopener"
                              className="text-sm transition line-clamp-1"
                              style={{ color: 'var(--yv-text-2)' }}
                              title={v.title}
                            >
                              {v.title}
                            </a>
                          </td>
                          <td className="yv-num-cell">{fmtNum(v.views)}</td>
                          <td className="yv-num-cell">{fmtDuration(v.averageViewDuration)}</td>
                          <td className="yv-num-cell">{fmtNum(v.likes)}</td>
                          <td className="yv-num-cell" style={{ color: v.subscribersGained > 0 ? '#22c55e' : '#888' }}>
                            +{v.subscribersGained}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Private data badge */}
            <div className="text-center py-4">
              <span className="yv-chip inline-flex items-center gap-2 font-mono-jb text-[13px] px-4 py-1.5" style={{ color: 'var(--yv-text-4)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {t('Datos privados — solo accesibles con tu autorización OAuth', 'Private data — only accessible with your OAuth authorization')}
              </span>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
