'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface DropOff { time: number; drop: number; retentionBefore: number; retentionAfter: number }
interface DropOffReason { timestamp: string; reason: string }

interface VideoRetention {
  videoId: string;
  title: string;
  views: number;
  duration: number;
  retention: number[];
  avgRetention: number;
  hookScore: number;
  dropOffPoints: DropOff[];
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function retentionColor(pct: number): string {
  if (pct >= 50) return '#22c55e';
  if (pct >= 30) return '#eab308';
  return '#ef4444';
}

function hookScoreLabel(score: number, lang: Lang): string {
  if (score >= 80) return lang === 'en' ? 'Excellent hook' : 'Hook excelente';
  if (score >= 60) return lang === 'en' ? 'Good hook' : 'Buen hook';
  if (score >= 40) return lang === 'en' ? 'Average hook' : 'Hook medio';
  return lang === 'en' ? 'Weak hook' : 'Hook débil';
}

const COMPARE_COLORS = ['#9B2020', '#818cf8', '#22c55e', '#eab308', '#f472b6'];

function InteractiveRetentionCurve({
  videos,
  compareMode,
  duration,
  lang,
}: {
  videos: VideoRetention[];
  compareMode: boolean;
  duration: number;
  lang: Lang;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; pct: number; values: { title: string; ret: number; color: string }[] } | null>(null);

  const w = 700;
  const h = 180;
  const padL = 40;
  const padR = 10;
  const padT = 10;
  const padB = 25;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const xInChart = xRatio * w - padL;
    if (xInChart < 0 || xInChart > chartW) { setHover(null); return; }
    const pct = xInChart / chartW;

    const values = (compareMode ? videos : videos.slice(0, 1)).map((v, i) => {
      const idx = Math.min(Math.floor(pct * v.retention.length), v.retention.length - 1);
      return { title: v.title, ret: v.retention[idx], color: COMPARE_COLORS[i % COMPARE_COLORS.length] };
    });

    setHover({ x: padL + pct * chartW, pct, values });
  }, [videos, compareMode, chartW, w]);

  const renderCurve = (retention: number[], color: string, fill: boolean) => {
    if (retention.length < 2) return null;
    const pts = retention.map((v, i) => {
      const x = padL + (i / (retention.length - 1)) * chartW;
      const y = padT + chartH - (v / 100) * chartH;
      return `${x},${y}`;
    }).join(' ');

    return (
      <>
        {fill && (
          <polyline
            points={`${padL},${padT + chartH} ${pts} ${padL + chartW},${padT + chartH}`}
            fill={color.replace(')', ',0.12)').replace('rgb', 'rgba').replace('#', '')}
            style={{ fill: `${color}15` }}
            stroke="none"
          />
        )}
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      </>
    );
  };

  const displayVideos = compareMode ? videos : videos.slice(0, 1);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ height: 220 }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid lines + labels */}
        {[0, 25, 50, 75, 100].map(pct => {
          const y = padT + chartH - (pct / 100) * chartH;
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={padL - 6} y={y + 3} fill="rgba(255,255,255,0.25)" fontSize="9" textAnchor="end" fontFamily="monospace">{pct}%</text>
            </g>
          );
        })}

        {/* 50% reference dashed */}
        <line x1={padL} y1={padT + chartH / 2} x2={padL + chartW} y2={padT + chartH / 2} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4,4" />

        {/* Curves */}
        {displayVideos.map((v, i) => (
          <g key={v.videoId}>
            {renderCurve(v.retention, COMPARE_COLORS[i % COMPARE_COLORS.length], i === 0 && !compareMode)}
          </g>
        ))}

        {/* Time labels */}
        <text x={padL} y={h - 4} fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="monospace">0:00</text>
        <text x={padL + chartW / 2} y={h - 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="middle" fontFamily="monospace">{fmtTime(duration / 2)}</text>
        <text x={padL + chartW} y={h - 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end" fontFamily="monospace">{fmtTime(duration)}</text>

        {/* Hover line */}
        {hover && (
          <>
            <line x1={hover.x} y1={padT} x2={hover.x} y2={padT + chartH} stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="3,3" />
            {hover.values.map((v, i) => {
              const y = padT + chartH - (v.ret / 100) * chartH;
              return <circle key={i} cx={hover.x} cy={y} r="4" fill={v.color} stroke="#111" strokeWidth="1.5" />;
            })}
          </>
        )}
      </svg>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="absolute pointer-events-none px-3 py-2 rounded-lg border"
          style={{
            left: `${(hover.x / w) * 100}%`,
            top: 8,
            transform: hover.x > w * 0.7 ? 'translateX(-100%)' : 'translateX(0)',
            background: 'rgba(15,15,17,0.95)',
            borderColor: 'rgba(255,255,255,0.12)',
            zIndex: 10,
          }}
        >
          <div className="font-mono-jb text-[13px] mb-1" style={{ color: 'var(--yv-text-3)' }}>
            {fmtTime(Math.round(hover.pct * duration))}
          </div>
          {hover.values.map((v, i) => (
            <div key={i} className="flex items-center gap-2 text-[13px]">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: v.color }} />
              <span className="text-white font-display font-bold">{v.ret}%</span>
              {compareMode && <span className="truncate max-w-[120px] text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{v.title}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Compare legend */}
      {compareMode && displayVideos.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-2 px-1">
          {displayVideos.map((v, i) => (
            <div key={v.videoId} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COMPARE_COLORS[i % COMPARE_COLORS.length] }} />
              <span className="font-mono-jb text-[13px] truncate max-w-[180px]" style={{ color: 'var(--yv-text-3)' }}>{v.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RetentionPage() {
  const { data: session, status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videos, setVideos] = useState<VideoRetention[]>([]);
  const [aiTips, setAiTips] = useState<string[]>([]);
  const [dropOffReasons, setDropOffReasons] = useState<Record<string, DropOffReason[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  async function analyze() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/youtube/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === 'pro_required') setError(t('Plan Pro requerido.', 'Pro plan required.'));
        else if (json.error === 'youtube_not_connected') setError(t('Conecta tu canal primero.', 'Connect your channel first.'));
        else if (json.error === 'no_retention_data') setError(t('No hay datos de retención disponibles.', 'No retention data available.'));
        else setError(json.error || 'Error');
        return;
      }
      setVideos(json.videos || []);
      setAiTips(json.aiTips || []);
      setDropOffReasons(json.dropOffReasons || {});
      if (json.videos?.length > 0) setSelected(json.videos[0].videoId);
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'authenticated') analyze();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const selectedVideo = videos.find(v => v.videoId === selected);
  const compareVideos = compareMode ? videos.filter(v => compareIds.includes(v.videoId)) : [];

  function toggleCompare(videoId: string) {
    setCompareIds(prev =>
      prev.includes(videoId) ? prev.filter(id => id !== videoId) : [...prev, videoId].slice(0, 5)
    );
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
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Retención', 'Retention')}</h1>
          <p className="font-mono-jb text-sm mb-6" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesión para analizar retención.', 'Sign in to analyze retention.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="yv-page">
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('Optimizador de retención', 'Retention Optimizer')}</span>
            <h1 className="yv-page-header__title">
              {t('¿Dónde pierdes audiencia?', 'Where are you losing viewers?')}
            </h1>
            <p className="yv-page-header__desc">
              {t('Hook Score + curva interactiva + AI drop-off analysis — datos privados OAuth.', 'Hook Score + interactive curve + AI drop-off analysis — private OAuth data.')}
            </p>
          </div>
        </header>
        {loading && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Analizando retención...', 'Analyzing retention...')}</span>
          </div>
        )}

        {error && (
          <div className="text-center py-12">
            <p className="text-red-400 font-mono-jb text-sm">{error}</p>
            <button onClick={analyze} className="btn-offset px-6 py-2 text-sm font-display mt-4">
              {t('Reintentar', 'Retry')}
            </button>
          </div>
        )}

        {!loading && !error && videos.length > 0 && (
          <div className="space-y-6">

            {/* Hook Score cards row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {videos.map(v => (
                <button
                  key={v.videoId}
                  onClick={() => { setSelected(v.videoId); setCompareMode(false); }}
                  className="text-left rounded-xl border p-4 transition group"
                  style={{
                    background: selected === v.videoId && !compareMode ? 'rgba(155,32,32,0.08)' : 'rgba(255,255,255,0.02)',
                    borderColor: selected === v.videoId && !compareMode ? 'rgba(155,32,32,0.3)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  {/* Hook Score badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="font-display font-bold text-2xl" style={{ color: retentionColor(v.hookScore) }}>
                      {v.hookScore}
                    </div>
                    <div className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-4)' }}>Hook</div>
                  </div>
                  <div className="font-mono-jb text-[13px] truncate" style={{ color: 'var(--yv-text-3)' }} title={v.title}>
                    {v.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1 font-mono-jb text-[13px]">
                    <span style={{ color: retentionColor(v.avgRetention) }}>{v.avgRetention}% avg</span>
                    <span style={{ color: 'var(--yv-text-5)' }}>{fmtNum(v.views)}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Compare toggle */}
            {videos.length > 1 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setCompareMode(!compareMode);
                    if (!compareMode) setCompareIds(videos.slice(0, 2).map(v => v.videoId));
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border font-mono-jb text-[13px] tracking-wider transition"
                  style={{
                    background: compareMode ? 'rgba(129,140,248,0.1)' : 'rgba(255,255,255,0.02)',
                    borderColor: compareMode ? 'rgba(129,140,248,0.3)' : 'rgba(255,255,255,0.08)',
                    color: compareMode ? '#818cf8' : 'var(--text-dim)',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
                  </svg>
                  {t('Comparar curvas', 'Compare curves')}
                </button>

                {compareMode && (
                  <div className="flex gap-2 flex-wrap">
                    {videos.map(v => (
                      <button
                        key={v.videoId}
                        onClick={() => toggleCompare(v.videoId)}
                        className="px-3 py-1 rounded-full border font-mono-jb text-[13px] transition"
                        style={{
                          background: compareIds.includes(v.videoId) ? 'rgba(129,140,248,0.12)' : 'transparent',
                          borderColor: compareIds.includes(v.videoId) ? 'rgba(129,140,248,0.3)' : 'rgba(255,255,255,0.08)',
                          color: compareIds.includes(v.videoId) ? '#818cf8' : 'var(--text-dim)',
                        }}
                      >
                        {v.title.slice(0, 25)}{v.title.length > 25 ? '...' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Interactive retention curve */}
            {(compareMode ? compareVideos.length > 0 : selectedVideo) && (
              <div className="yv-card p-6">
                {!compareMode && selectedVideo && (
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <a
                        href={`https://www.youtube.com/watch?v=${selectedVideo.videoId}`}
                        target="_blank"
                        rel="noopener"
                        className="font-display font-bold text-lg hover:underline"
                        style={{ color: 'var(--yv-text-1)' }}
                      >
                        {selectedVideo.title}
                      </a>
                      <div className="flex gap-4 mt-1 font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
                        <span>{fmtNum(selectedVideo.views)} {t('vistas', 'views')}</span>
                        <span>{fmtTime(selectedVideo.duration)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      {/* Hook Score */}
                      <div className="text-center">
                        <div className="font-display font-bold text-3xl" style={{ color: retentionColor(selectedVideo.hookScore) }}>
                          {selectedVideo.hookScore}%
                        </div>
                        <div className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
                          {hookScoreLabel(selectedVideo.hookScore, lang)}
                        </div>
                      </div>
                      {/* Avg Retention */}
                      <div className="text-center">
                        <div className="font-display font-bold text-3xl" style={{ color: retentionColor(selectedVideo.avgRetention) }}>
                          {selectedVideo.avgRetention}%
                        </div>
                        <div className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{t('Retención media', 'Avg retention')}</div>
                      </div>
                    </div>
                  </div>
                )}

                {compareMode && (
                  <div className="mb-4">
                    <h3 className="font-display font-bold text-lg" style={{ color: 'var(--yv-text-1)' }}>{t('Comparación de curvas', 'Curve comparison')}</h3>
                    <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-3)' }}>{t('Hover para ver retención en cada punto', 'Hover to see retention at each point')}</p>
                  </div>
                )}

                <InteractiveRetentionCurve
                  videos={compareMode ? compareVideos : (selectedVideo ? [selectedVideo] : [])}
                  compareMode={compareMode}
                  duration={compareMode ? Math.max(...compareVideos.map(v => v.duration)) : (selectedVideo?.duration || 0)}
                  lang={lang}
                />
              </div>
            )}

            {/* Drop-off points with AI reasons */}
            {!compareMode && selectedVideo && selectedVideo.dropOffPoints.length > 0 && (
              <div className="yv-card p-6">
                <h3 className="font-mono-jb text-[13px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--yv-text-3)' }}>
                  {t('PUNTOS DE ABANDONO', 'DROP-OFF POINTS')}
                </h3>
                <div className="space-y-3">
                  {selectedVideo.dropOffPoints.map((d, i) => {
                    const reasons = dropOffReasons[selectedVideo.videoId] || [];
                    const reason = reasons.find(r => r.timestamp === fmtTime(d.time));
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-4 p-3 rounded-lg border"
                        style={{ background: 'rgba(239,68,68,0.04)', borderColor: 'rgba(239,68,68,0.15)' }}
                      >
                        <div className="flex-shrink-0 text-center w-16">
                          <div className="font-display font-bold text-lg text-red-400">{fmtTime(d.time)}</div>
                          <div className="font-mono-jb text-[13px] text-red-400/60">-{d.drop}%</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-2)' }}>
                            <span>{d.retentionBefore}%</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                            <span style={{ color: retentionColor(d.retentionAfter) }}>{d.retentionAfter}%</span>
                          </div>
                          {reason && (
                            <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
                              <span className="text-purple-400 font-mono-jb text-[13px] mr-1">AI:</span>
                              {reason.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI Tips */}
            {aiTips.length > 0 && (
              <div className="yv-card p-6" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
                <h3 className="font-display font-bold text-sm text-purple-300 mb-4 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
                  {t('Consejos para mejorar retención', 'Tips to improve retention')}
                </h3>
                <ul className="space-y-3">
                  {aiTips.map((tip, i) => (
                    <li key={i} className="text-sm flex items-start gap-3" style={{ color: 'var(--yv-text-2)' }}>
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-mono-jb text-[13px] font-bold" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Private data badge */}
            <div className="text-center py-4">
              <span className="inline-flex items-center gap-2 font-mono-jb text-[13px] border border-white/8 rounded-full px-4 py-1.5" style={{ color: 'var(--yv-text-4)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {t('Datos privados de retención — inaccesibles para herramientas sin OAuth', 'Private retention data — inaccessible to tools without OAuth')}
              </span>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
