'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface DropOff { time: number; drop: number }

interface VideoRetention {
  videoId: string;
  title: string;
  views: number;
  duration: number;
  retention: number[];
  avgRetention: number;
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

export default function RetentionPage() {
  const { data: session, status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videos, setVideos] = useState<VideoRetention[]>([]);
  const [aiTips, setAiTips] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

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
      if (json.videos?.length > 0) setSelected(json.videos[0].videoId);
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'authenticated') analyze();
  }, [status]);

  const selectedVideo = videos.find(v => v.videoId === selected);

  function renderRetentionCurve(retention: number[]) {
    if (retention.length < 2) return null;
    const w = 600;
    const h = 150;
    const pts = retention.map((v, i) => {
      const x = (i / (retention.length - 1)) * w;
      const y = h - (v / 100) * h;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40" preserveAspectRatio="none">
        {/* Grid lines */}
        {[25, 50, 75].map(pct => (
          <line key={pct} x1="0" y1={h - (pct / 100) * h} x2={w} y2={h - (pct / 100) * h} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {/* Fill */}
        <polyline points={`0,${h} ${pts} ${w},${h}`} fill="rgba(155,32,32,0.15)" stroke="none" />
        {/* Line */}
        <polyline points={pts} fill="none" stroke="#9B2020" strokeWidth="2.5" />
        {/* 50% reference line */}
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4,4" />
      </svg>
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
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para analizar retención.', 'Sign in to analyze retention.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/dashboard" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
              <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
            </svg>
            <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </a>
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              {t('Panel', 'Dashboard')}
            </a>
            <a href="/analytics" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
              Analytics
            </a>
            <a href="/predictor" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              Predictor
            </a>
            <a href="/profile" title={t('Mi perfil', 'My profile')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-white/30 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </a>
            <button onClick={() => signOut({ callbackUrl: '/' })} title={t('Cerrar sesión', 'Sign out')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-red-500/50 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Header */}
      <div className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
        <div className="max-w-5xl mx-auto px-6 py-8">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--red)' }}>
            {t('OPTIMIZADOR DE RETENCIÓN', 'RETENTION OPTIMIZER')}
          </p>
          <h1 className="font-display font-bold text-3xl text-white">
            {t('¿Dónde pierdes audiencia?', 'Where are you losing viewers?')}
          </h1>
          <p className="text-zinc-500 font-mono-jb text-xs mt-1">
            {t('Datos privados de retención — solo accesibles con OAuth.', 'Private retention data — only accessible with OAuth.')}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-zinc-500 font-mono-jb text-sm">{t('Analizando retención...', 'Analyzing retention...')}</span>
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
            {/* Video selector */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {videos.map(v => (
                <button
                  key={v.videoId}
                  onClick={() => setSelected(v.videoId)}
                  className={`flex-shrink-0 text-left px-4 py-2.5 rounded-lg border transition text-xs font-mono-jb ${
                    selected === v.videoId ? 'border-red-500/40 text-white' : 'border-white/8 text-zinc-500 hover:text-white hover:border-white/20'
                  }`}
                  style={{
                    background: selected === v.videoId ? 'rgba(155,32,32,0.12)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div className="truncate max-w-[200px]">{v.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span style={{ color: retentionColor(v.avgRetention) }}>{v.avgRetention}%</span>
                    <span className="text-zinc-600">{fmtNum(v.views)} {t('vistas', 'views')}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Selected video retention */}
            {selectedVideo && (
              <div className="rounded-xl border border-white/10 p-6" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <a
                      href={`https://www.youtube.com/watch?v=${selectedVideo.videoId}`}
                      target="_blank"
                      rel="noopener"
                      className="font-display font-bold text-lg text-white hover:underline"
                    >
                      {selectedVideo.title}
                    </a>
                    <div className="flex gap-4 mt-1 font-mono-jb text-[11px] text-zinc-500">
                      <span>{fmtNum(selectedVideo.views)} {t('vistas', 'views')}</span>
                      <span>{fmtTime(selectedVideo.duration)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold text-2xl" style={{ color: retentionColor(selectedVideo.avgRetention) }}>
                      {selectedVideo.avgRetention}%
                    </div>
                    <div className="font-mono-jb text-[10px] text-zinc-500">{t('Retención media', 'Avg retention')}</div>
                  </div>
                </div>

                {/* Retention curve */}
                <div className="mb-2">
                  {renderRetentionCurve(selectedVideo.retention)}
                  <div className="flex justify-between font-mono-jb text-[10px] text-zinc-600 mt-1">
                    <span>0:00</span>
                    <span className="text-zinc-700">— 50% —</span>
                    <span>{fmtTime(selectedVideo.duration)}</span>
                  </div>
                </div>

                {/* Drop-off points */}
                {selectedVideo.dropOffPoints.length > 0 && (
                  <div className="mt-4">
                    <h3 className="font-mono-jb text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                      {t('Puntos de abandono', 'Drop-off points')}
                    </h3>
                    <div className="flex gap-2 flex-wrap">
                      {selectedVideo.dropOffPoints.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono-jb border"
                          style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}
                        >
                          <span className="text-red-400">{fmtTime(d.time)}</span>
                          <span className="text-zinc-600">-{d.drop}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Retention overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {videos.map(v => (
                <div
                  key={v.videoId}
                  className="rounded-lg border border-white/8 p-3 text-center cursor-pointer hover:border-white/20 transition"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                  onClick={() => setSelected(v.videoId)}
                >
                  <div className="font-display font-bold text-xl" style={{ color: retentionColor(v.avgRetention) }}>
                    {v.avgRetention}%
                  </div>
                  <div className="font-mono-jb text-[9px] text-zinc-600 truncate mt-0.5" title={v.title}>
                    {v.title}
                  </div>
                </div>
              ))}
            </div>

            {/* AI Tips */}
            {aiTips.length > 0 && (
              <div className="rounded-lg border p-5" style={{ background: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.2)' }}>
                <h3 className="font-display font-bold text-sm text-purple-300 mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
                  {t('Consejos para mejorar retención', 'Tips to improve retention')}
                </h3>
                <ul className="space-y-2">
                  {aiTips.map((tip, i) => (
                    <li key={i} className="text-sm font-mono-jb text-zinc-300 flex items-start gap-2">
                      <span className="text-purple-400 mt-0.5">{i + 1}.</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Private data badge */}
            <div className="text-center py-4">
              <span className="inline-flex items-center gap-2 font-mono-jb text-[10px] text-zinc-600 border border-white/8 rounded-full px-4 py-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {t('Datos privados de retención — inaccesibles para herramientas sin OAuth', 'Private retention data — inaccessible to tools without OAuth')}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
