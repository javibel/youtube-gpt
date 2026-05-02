'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getLangClient } from '@/lib/get-lang-client';
import DashboardShell from '@/components/DashboardShell';

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
  const [lang, setLang] = useState<Lang>('es');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => { setLang(getLangClient()); }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    fetch('/api/youtube/analytics')
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
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">Analytics</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para ver tus analytics.', 'Sign in to view your analytics.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  // Sparkline SVG for daily views
  function renderSparkline(points: DailyPoint[], key: 'views' | 'estimatedMinutesWatched') {
    if (points.length < 2) return null;
    const vals = points.map(p => p[key]);
    const max = Math.max(...vals, 1);
    const w = 600;
    const h = 100;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - (v / max) * h}`).join(' ');
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke="#9B2020" strokeWidth="2" />
        <polyline points={`0,${h} ${pts} ${w},${h}`} fill="rgba(155,32,32,0.15)" stroke="none" />
      </svg>
    );
  }

  const ov = data?.overview;

  return (
    <DashboardShell>
      {/* Header */}
      <div className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--red)' }}>
            {t('ANALYTICS PRIVADOS', 'PRIVATE ANALYTICS')}
          </p>
          <h1 className="font-display font-bold text-3xl md:text-4xl text-white">
            {data?.channelName || 'Analytics'}
          </h1>
          {data?.period && (
            <p className="text-zinc-500 font-mono-jb text-xs mt-1">
              {data.period.start} — {data.period.end} (28 {t('días', 'days')})
            </p>
          )}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
        {loading && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-zinc-500 font-mono-jb text-sm">{t('Cargando analytics...', 'Loading analytics...')}</span>
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
                <div key={i} className="rounded-lg p-4 border border-white/8" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="font-display font-bold text-xl text-white">{card.value}</div>
                  <div className="font-mono-jb text-[10px] text-zinc-500 mt-1">{card.label}</div>
                </div>
              ))}
            </div>

            {/* Daily views sparkline */}
            {data.daily.length > 2 && (
              <div className="rounded-lg border border-white/8 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <h2 className="font-display font-bold text-lg text-white mb-3">
                  {t('Visualizaciones diarias (90 días)', 'Daily views (90 days)')}
                </h2>
                {renderSparkline(data.daily, 'views')}
                <div className="flex justify-between text-zinc-600 font-mono-jb text-[10px] mt-1">
                  <span>{data.daily[0]?.day}</span>
                  <span>{data.daily[data.daily.length - 1]?.day}</span>
                </div>
              </div>
            )}

            {/* Two columns: Traffic + Countries */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Traffic sources */}
              {data.traffic.length > 0 && (
                <div className="rounded-lg border border-white/8 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <h2 className="font-display font-bold text-lg text-white mb-4">
                    {t('Fuentes de tráfico', 'Traffic sources')}
                  </h2>
                  <div className="space-y-2">
                    {data.traffic.slice(0, 8).map((src, i) => {
                      const totalViews = data.traffic.reduce((s, x) => s + x.views, 0);
                      const pct = totalViews > 0 ? (src.views / totalViews) * 100 : 0;
                      const label = TRAFFIC_LABELS[src.insightTrafficSourceType]?.[lang] || src.insightTrafficSourceType;
                      return (
                        <div key={i}>
                          <div className="flex justify-between font-mono-jb text-xs mb-0.5">
                            <span className="text-zinc-300">{label}</span>
                            <span className="text-zinc-500">{fmtNum(src.views)} ({pct.toFixed(1)}%)</span>
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
                <div className="rounded-lg border border-white/8 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <h2 className="font-display font-bold text-lg text-white mb-4">
                    {t('Países principales', 'Top countries')}
                  </h2>
                  <div className="space-y-2">
                    {data.countries.slice(0, 8).map((c, i) => {
                      const totalViews = data.countries.reduce((s, x) => s + x.views, 0);
                      const pct = totalViews > 0 ? (c.views / totalViews) * 100 : 0;
                      return (
                        <div key={i}>
                          <div className="flex justify-between font-mono-jb text-xs mb-0.5">
                            <span className="text-zinc-300">{c.country}</span>
                            <span className="text-zinc-500">{fmtNum(c.views)} ({pct.toFixed(1)}%)</span>
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
              <div className="rounded-lg border border-white/8 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <h2 className="font-display font-bold text-lg text-white mb-4">
                  {t('Vídeos principales (28 días)', 'Top videos (28 days)')}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="font-mono-jb text-[10px] text-zinc-500 uppercase tracking-wider border-b border-white/8">
                        <th className="pb-2 pr-4">{t('Vídeo', 'Video')}</th>
                        <th className="pb-2 pr-4 text-right">{t('Vistas', 'Views')}</th>
                        <th className="pb-2 pr-4 text-right">{t('Duración media', 'Avg duration')}</th>
                        <th className="pb-2 pr-4 text-right">Likes</th>
                        <th className="pb-2 text-right">{t('Subs +', 'Subs +')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topVideos.map((v, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                          <td className="py-2.5 pr-4">
                            <a
                              href={`https://www.youtube.com/watch?v=${v.video}`}
                              target="_blank"
                              rel="noopener"
                              className="text-sm text-zinc-200 hover:text-white transition line-clamp-1"
                              title={v.title}
                            >
                              {v.title}
                            </a>
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono-jb text-xs text-zinc-300">{fmtNum(v.views)}</td>
                          <td className="py-2.5 pr-4 text-right font-mono-jb text-xs text-zinc-400">{fmtDuration(v.averageViewDuration)}</td>
                          <td className="py-2.5 pr-4 text-right font-mono-jb text-xs text-zinc-400">{fmtNum(v.likes)}</td>
                          <td className="py-2.5 text-right font-mono-jb text-xs" style={{ color: v.subscribersGained > 0 ? '#22c55e' : '#888' }}>
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
              <span className="inline-flex items-center gap-2 font-mono-jb text-[10px] text-zinc-600 border border-white/8 rounded-full px-4 py-1.5">
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
