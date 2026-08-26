'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/components/LangProvider';
import DashboardShell from '@/components/DashboardShell';
import { FlameIcon, BoltIcon, LeafIcon } from '@/components/icons';

type Lang = 'es' | 'en';

interface ChannelInfo {
  id: string; name: string; description: string; thumbnail: string;
  country: string | null; subscribers: number; totalViews: number; videoCount: number;
}
interface VideoItem {
  videoId: string; title: string; thumbnail: string;
  publishedAt: string; views: number; likes: number;
}
interface CompetitorResult {
  channel: ChannelInfo;
  topVideos: VideoItem[];
  keywords: string[];
  uploadFrequency: string;
  avgViews: number;
}
interface OutlierVideo {
  videoId: string; title: string; thumbnail: string;
  publishedAt: string; views: number; likes: number;
  multiplier: number; type: 'viral' | 'evergreen';
}
interface OutlierResult {
  channelId: string;
  medianViews: number;
  totalVideosAnalyzed: number;
  outliers: OutlierVideo[];
}

function fmtNum(n: number, lang: Lang): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function fmtDate(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'short' });
  } catch { return ''; }
}

const EXAMPLE_URLS = [
  'https://www.youtube.com/@MrBeast',
  'https://www.youtube.com/@veritasium',
  'https://www.youtube.com/@kurzgesagt',
];

export default function CompetitorsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const lang = useLang();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CompetitorResult | null>(null);
  const [outliers, setOutliers] = useState<OutlierResult | null>(null);
  const [outliersLoading, setOutliersLoading] = useState(false);
  const [outlierPeriod, setOutlierPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('all');
  // Guardar el canal analizado como competidor seguido (cierra el bucle
  // analisis -> seguimiento; antes /competitors/tracking no tenia ni un enlace).
  const [trackState, setTrackState] = useState<'idle' | 'loading' | 'tracked'>('idle');
  const [trackError, setTrackError] = useState('');
  const [trackUpgrade, setTrackUpgrade] = useState(false);

  // Fetch outliers when we have a result or period changes
  useEffect(() => {
    if (!result?.channel?.id) { setOutliers(null); return; }
    let cancelled = false;
    async function fetchOutliers() {
      setOutliersLoading(true);
      try {
        const res = await fetch(`/api/youtube/outliers?channelId=${result!.channel.id}&period=${outlierPeriod}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setOutliers(data);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setOutliersLoading(false); }
    }
    fetchOutliers();
    return () => { cancelled = true; };
  }, [result?.channel?.id, outlierPeriod]);

  // Marca el boton como "siguiendo" si el canal ya esta en la lista del usuario
  useEffect(() => {
    setTrackState('idle');
    setTrackError('');
    setTrackUpgrade(false);
    if (!result?.channel?.id || status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/youtube/competitors')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.competitors) return;
        const id = result!.channel.id;
        if (d.competitors.some((c: { channelId: string }) => c.channelId === id)) {
          setTrackState('tracked');
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [result?.channel?.id, status]);

  // No redirect — show public landing if unauthenticated

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  async function trackChannel() {
    if (!result?.channel?.id || trackState !== 'idle') return;
    setTrackState('loading');
    setTrackError('');
    setTrackUpgrade(false);
    try {
      const res = await fetch('/api/youtube/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: result.channel.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || data.error === 'already_tracked') {
        setTrackState('tracked');
        return;
      }
      setTrackState('idle');
      if (data.error === 'pro_required') {
        setTrackUpgrade(true);
        setTrackError(t('El seguimiento de competidores es del plan Pro.', 'Competitor tracking is a Pro plan feature.'));
      } else if (data.error === 'limit_reached') {
        setTrackError(t('Has llegado al maximo de competidores de tu plan.', "You've reached your plan's competitor limit."));
      } else {
        setTrackError(t('No se pudo guardar. Intentalo de nuevo.', 'Could not save. Please try again.'));
      }
    } catch {
      setTrackState('idle');
      setTrackError(t('Error de conexion.', 'Connection error.'));
    }
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/youtube/competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), lang }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        if (data.error === 'pro_required') {
          setError(t('Esta función es exclusiva del Plan Pro. Actualiza tu cuenta desde el dashboard.', 'This feature is exclusive to the Pro Plan. Upgrade your account from the dashboard.'));
        } else if (data.error === 'channel_not_found') {
          setError(t('No se encontró el canal. Comprueba la URL.', 'Channel not found. Check the URL.'));
        } else {
          setError(t('Error al analizar el canal. Inténtalo de nuevo.', 'Error analysing channel. Please try again.'));
        }
        return;
      }
      setResult(data);
    } catch {
      setError(t('Error de conexión.', 'Connection error.'));
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') return null;

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-2)' }}>
        <header style={{ background: 'rgba(12,10,15,0.85)', boxShadow: 'inset 0 -1px 0 rgba(255,255,255,.08)' }}>
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="7 7 18 18" fill="none">
                <circle cx="16" cy="16" r="8" fill="#e84d5b"/>
              </svg>
              <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--yv-brand)' }}>.</span>com</span>
            </a>
            <div className="flex items-center gap-3">
              <a href="/login" className="font-mono-jb text-[13px] tracking-wider hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>{t('Iniciar sesión', 'Sign in')}</a>
              <a href="/signup" className="btn-offset px-4 py-1.5 text-[13px] font-display">{t('Crear cuenta gratis', 'Sign up free')}</a>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-6" style={{ color: 'var(--yv-brand)' }}>{t('ANÁLISIS DE COMPETIDORES', 'COMPETITOR ANALYSIS')}</p>
          <h1 className="font-display font-bold text-4xl md:text-5xl mb-6 leading-tight">
            {t('Analiza a tu competencia en', 'Analyze your competition on')}
            <span style={{ color: 'var(--yv-brand)' }}> YouTube</span>
          </h1>
          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
            {t(
              'Descubre qué hace crecer a otros canales. Analiza sus vídeos más exitosos, frecuencia de subida, keywords principales y estrategias de crecimiento.',
              'Discover what makes other channels grow. Analyze their most successful videos, upload frequency, main keywords and growth strategies.'
            )}
          </p>

          <div className="grid md:grid-cols-3 gap-5 mb-14 text-left">
            {[
              { icon: '/icons/chart-up.webp', title: t('Métricas del canal', 'Channel metrics'), desc: t('Suscriptores, vistas totales, frecuencia de publicación y país.', 'Subscribers, total views, upload frequency and country') },
              { icon: '/icons/trophy.webp', title: t('Top vídeos', 'Top videos'), desc: t('Los vídeos con más vistas, likes y engagement de cualquier canal', 'The most viewed, liked and engaging videos from any channel') },
              { icon: '/icons/key.webp', title: t('Keywords y estrategia', 'Keywords & strategy'), desc: t('Las keywords que usa tu competencia para posicionar sus videos', 'The keywords your competition uses to rank their videos') },
            ].map(f => (
              <div key={f.title} className="yv-card p-5">
                <img src={f.icon} alt="" width={32} height={32} className="object-contain mb-3" />
                <h3 className="font-display font-bold text-sm mb-1">{f.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Mock URL input */}
          <div className="max-w-xl mx-auto mb-8">
            <div className="yv-card p-1.5 flex items-center gap-2" style={{ opacity: 0.6 }}>
              <div className="flex-1 px-4 py-3 text-sm text-left" style={{ color: 'var(--yv-text-4)' }}>https://www.youtube.com/@MrBeast</div>
              <div className="px-5 py-3 rounded-lg font-display font-bold text-sm" style={{ background: 'var(--yv-brand)', color: '#fff' }}>{t('Analizar', 'Analyze')}</div>
            </div>
          </div>

          <a href="/signup" className="btn-offset inline-flex px-8 py-3 text-sm font-display">
            {t('Empieza gratis →', 'Start free →')}
          </a>
          <p className="text-[13px] mt-4" style={{ color: 'var(--yv-text-4)' }}>{t('Sin tarjeta de crédito. 10 generaciones/mes gratis.', 'No credit card. 10 generations/month free.')}</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <main className="yv-page space-y-8">
        {/* Title */}
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">
              {t('Análisis', 'Analysis')}
            </span>
            <h1 className="yv-page-header__title">
              {t('Analiza a tu', 'Analyse your')} <span style={{ color: 'var(--yv-brand)' }}>{t('competencia', 'competition')}</span>
            </h1>
            <p className="yv-page-header__desc">
              {t('Introduce la URL de cualquier canal de YouTube para ver sus métricas, vídeos top y frecuencia de publicación.',
                 'Enter any YouTube channel URL to see their metrics, top videos, and upload frequency.')}
            </p>
            <p className="text-zinc-600 text-[12px] mt-1">
              {t('Las métricas derivadas (VPH, medias) son cálculos propios de YTubViral — no datos oficiales de YouTube.',
                 'Derived metrics (VPH, averages) are YTubViral\'s own calculations — not official YouTube data.')}
            </p>
          </div>
        </div>

        {/* Search form */}
        <form onSubmit={handleAnalyze} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder={t('https://www.youtube.com/@canal', 'https://www.youtube.com/@channel')}
              className="soft-field flex-1 py-3 px-4 text-sm font-mono-jb"
              style={{ borderRadius: '10px' }}
            />
            <button type="submit" disabled={loading || !url.trim()}
              className="btn-offset px-6 py-3 text-[13px] font-mono-jb tracking-wider disabled:opacity-50 flex items-center gap-2 whitespace-nowrap">
              {loading ? (
                <>
                  <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  {t('Analizando...', 'Analysing...')}
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  {t('Analizar', 'Analyse')}
                </>
              )}
            </button>
          </div>
          {/* Example URLs */}
          <div className="flex flex-wrap gap-2">
            <span className="font-mono-jb text-[13px] self-center" style={{ color: 'var(--yv-text-4)' }}>{t('Ejemplos:', 'Examples:')}</span>
            {EXAMPLE_URLS.map(u => (
              <button key={u} type="button" onClick={() => setUrl(u)}
                className="yv-chip font-mono-jb text-[13px] px-2 py-1 hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
                {u.replace('https://www.youtube.com/', '')}
              </button>
            ))}
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="yv-note yv-note--error font-mono-jb">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6 animate-fade-in">
            {/* Channel card */}
            <div className="yv-card p-6">
              <div className="flex items-start gap-4">
                {result.channel.thumbnail ? (
                  <img src={result.channel.thumbnail} alt="" className="w-16 h-16 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center text-2xl font-bold"
                    style={{ background: 'var(--yv-brand)' }}>
                    {result.channel.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display font-bold text-xl text-white">{result.channel.name}</h2>
                    {result.channel.country && (
                      <span className="font-mono-jb text-[13px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--yv-text-2)' }}>
                        {result.channel.country}
                      </span>
                    )}
                  </div>
                  {result.channel.description && (
                    <p className="text-[13px] mt-1 font-mono-jb line-clamp-2" style={{ color: 'var(--yv-text-3)' }}>{result.channel.description}</p>
                  )}
                </div>

                {/* Guardar como competidor seguido */}
                {status === 'authenticated' && (
                  <div className="flex-shrink-0 flex flex-col items-end gap-1.5 max-w-[220px]">
                    {trackState === 'tracked' ? (
                      <a href="/competitors/tracking"
                        className="yv-chip font-mono-jb text-[13px] px-3 py-2 flex items-center gap-2 whitespace-nowrap hover:text-white transition"
                        style={{ color: 'var(--yv-text-2)' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>
                        {t('Siguiendo — ver tracking', 'Tracking — view')}
                      </a>
                    ) : (
                      <button type="button" onClick={trackChannel} disabled={trackState === 'loading'}
                        className="btn-offset px-4 py-2 text-[13px] font-mono-jb tracking-wider disabled:opacity-50 flex items-center gap-2 whitespace-nowrap">
                        {trackState === 'loading' ? (
                          <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                          </svg>
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                        )}
                        {t('Seguir canal', 'Track channel')}
                      </button>
                    )}
                    {trackError && (
                      <p className="font-mono-jb text-[12px] text-right" style={{ color: 'var(--yv-text-3)' }}>
                        {trackError}{' '}
                        {trackUpgrade && (
                          <a href="/pricing" className="underline" style={{ color: 'var(--yv-brand)' }}>
                            {t('Ver planes', 'See plans')}
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                {[
                  { label: t('Suscriptores', 'Subscribers'), value: fmtNum(result.channel.subscribers, lang), color: '#e84d5b' },
                  { label: t('Vistas totales', 'Total views'),  value: fmtNum(result.channel.totalViews, lang),   color: '#00E5FF' },
                  { label: t('Vídeos',         'Videos'),       value: fmtNum(result.channel.videoCount, lang),   color: '#FFE800' },
                  { label: t('Media vistas top', 'Avg top views'), value: fmtNum(result.avgViews, lang),          color: '#7CFF00' },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3" style={{ borderRadius: 'var(--yv-radius)', background: 'var(--yv-glass-chip)' }}>
                    <p className="font-display font-black text-2xl" style={{ color: s.color }}>{s.value}</p>
                    <p className="font-mono-jb text-[13px] uppercase mt-0.5" style={{ color: 'var(--yv-text-4)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top videos */}
              <div className="lg:col-span-2 yv-card p-5 space-y-3">
                <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
                  <span style={{ color: 'var(--yv-brand)' }}>▶</span>
                  {t('Top vídeos por vistas', 'Top videos by views')}
                </h3>
                <div className="space-y-2">
                  {result.topVideos.map((v, i) => (
                    <a key={v.videoId} href={`https://www.youtube.com/watch?v=${v.videoId}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2.5 rounded-lg group hover:bg-white/5 transition">
                      <span className="font-mono-jb text-[13px] w-4 flex-shrink-0" style={{ color: 'var(--yv-text-4)' }}>{i + 1}</span>
                      <img src={v.thumbnail} alt="" className="w-16 h-9 rounded object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-zinc-300 truncate group-hover:text-white transition">{v.title}</p>
                        <p className="font-mono-jb text-[13px] mt-0.5" style={{ color: 'var(--yv-text-4)' }}>{fmtDate(v.publishedAt, lang)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-mono-jb text-[13px] font-bold text-white">{fmtNum(v.views, lang)}</p>
                        <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{t('vistas', 'views')}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                {/* Upload frequency */}
                <div className="yv-card p-5">
                  <h3 className="font-display font-bold text-base text-white flex items-center gap-2 mb-3">
                    <span style={{ color: '#FFE800' }}>⏱</span>
                    {t('Frecuencia', 'Frequency')}
                  </h3>
                  <div className="text-center py-4">
                    <p className="font-display font-black text-3xl" style={{ color: '#FFE800' }}>{result.uploadFrequency}</p>
                    <p className="font-mono-jb text-[13px] mt-1 uppercase" style={{ color: 'var(--yv-text-4)' }}>{t('publicación', 'publishing')}</p>
                  </div>
                </div>

                {/* Keywords */}
                <div className="yv-card p-5">
                  <h3 className="font-display font-bold text-base text-white flex items-center gap-2 mb-3">
                    <span style={{ color: '#00FFA3' }}>#</span>
                    {t('Palabras clave frecuentes', 'Frequent keywords')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {result.keywords.map((kw, i) => (
                      <button key={kw} onClick={() => router.push(`/research?q=${encodeURIComponent(kw)}`)}
                        className="yv-chip font-mono-jb text-[13px] px-2.5 py-1 hover:text-white cursor-pointer"
                        style={{
                          color: i < 3 ? '#00FFA3' : '#6b7280',
                          background: i < 3 ? 'rgba(0,255,163,0.1)' : 'var(--yv-glass-chip)',
                        }}>
                        {kw}
                      </button>
                    ))}
                  </div>
                  <p className="font-mono-jb text-[13px] mt-3" style={{ color: 'var(--yv-text-4)' }}>
                    {t('Haz clic en una keyword para investigarla', 'Click a keyword to research it')}
                  </p>
                </div>
              </div>
            </div>

            {/* Outlier Detection */}
            <div className="yv-card p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
                  <FlameIcon size={18} style={{ color: '#FF6B00' }} />
                  {t('Outlier Detection', 'Outlier Detection')}
                  {outliers && outliers.outliers.length > 0 && (
                    <span className="font-mono-jb text-[13px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,107,0,0.15)', color: '#FF6B00' }}>
                      {outliers.outliers.length} {t('detectados', 'detected')}
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-1 font-mono-jb text-[13px]">
                  {(['7d', '30d', '90d', 'all'] as const).map(p => (
                    <button key={p} onClick={() => setOutlierPeriod(p)}
                      className="px-2.5 py-1 transition"
                      style={{
                        borderRadius: 'var(--yv-radius-sm)',
                        background: outlierPeriod === p ? 'rgba(255,107,0,0.15)' : 'transparent',
                        color: outlierPeriod === p ? '#FF6B00' : '#6b7280',
                      }}>
                      {p === 'all' ? t('Todo', 'All') : p}
                    </button>
                  ))}
                </div>
              </div>

              {outliers?.medianViews ? (
                <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                  {t('Mediana de vistas', 'Median views')}: <span style={{ color: 'var(--yv-text-2)' }}>{fmtNum(outliers.medianViews, lang)}</span>
                  {' · '}{outliers.totalVideosAnalyzed} {t('vídeos analizados', 'videos analyzed')}
                  {' · '}{t('Umbral', 'Threshold')}: 10x
                </p>
              ) : null}

              {outliersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 rounded-full border-2 border-transparent spin-r" style={{ borderTopColor: '#FF6B00' }} />
                </div>
              ) : outliers && outliers.outliers.length > 0 ? (
                <div className="space-y-2">
                  {outliers.outliers.map((v) => (
                    <a key={v.videoId} href={`https://www.youtube.com/watch?v=${v.videoId}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 group hover:bg-white/5 transition"
                      style={{ borderRadius: 'var(--yv-radius)', boxShadow: 'inset 0 1px 0 rgba(255,107,0,.2)' }}>
                      <div className="relative flex-shrink-0">
                        <img src={v.thumbnail} alt="" className="w-20 h-[45px] rounded object-cover" />
                        <span className="absolute -top-1.5 -right-1.5 font-mono-jb text-[13px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: '#FF6B00', color: '#000' }}>
                          {v.multiplier}x
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-zinc-300 truncate group-hover:text-white transition">{v.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono-jb text-[13px] px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                            style={{
                              background: v.type === 'viral' ? 'rgba(232,77,91,0.12)' : 'rgba(0,229,255,0.12)',
                              color: v.type === 'viral' ? '#e84d5b' : '#00E5FF',
                            }}>
                            {v.type === 'viral' ? <><BoltIcon size={11} /> Viral</> : <><LeafIcon size={11} /> Evergreen</>}
                          </span>
                          <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{fmtDate(v.publishedAt, lang)}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-mono-jb text-[13px] font-bold" style={{ color: '#FF6B00' }}>{fmtNum(v.views, lang)}</p>
                        <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{t('vistas', 'views')}</p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : outliers ? (
                <div className="text-center py-8">
                  <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                    {t('No se detectaron outliers (10x+) en este período.', 'No outliers (10x+) detected in this period.')}
                  </p>
                  <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>
                    {t('Prueba con "Todo" para ver el historial completo.', 'Try "All" to see the full history.')}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </main>
    </DashboardShell>
  );
}
