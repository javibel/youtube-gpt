'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useRouter } from 'next/navigation';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface TopSlot {
  day: number;
  hour: number;
  score: number;
  videoCount: number;
}

interface AnalysisData {
  heatmap: number[][];
  topSlots: TopSlot[];
  videoCount: number;
  aiTip: { es: string; en: string } | null;
  analyzedAt: string;
}

const DAY_LABELS: Record<Lang, string[]> = {
  es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

const DAY_FULL: Record<Lang, string[]> = {
  es: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const MEDAL_LABELS = ['1st', '2nd', '3rd'];

function cellColor(val: number): string {
  if (val === 0) return 'rgba(255,255,255,0.03)';
  const alpha = 0.1 + (val / 100) * 0.85;
  return `rgba(155, 32, 32, ${alpha.toFixed(2)})`;
}

export default function BestTimePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('es');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalysisData | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ day: number; hour: number } | null>(null);

  useEffect(() => { setLang(getLangClient()); }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  // Load cached data on mount
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/youtube/best-time')
      .then(r => r.json())
      .then(res => { if (res.data) setData(res.data); })
      .catch(() => {});
  }, [status]);

  async function analyze() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/youtube/best-time', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === 'pro_required') {
          setError(t('Necesitas el plan Pro para usar esta función.', 'You need the Pro plan to use this feature.'));
        } else if (json.error === 'youtube_not_connected') {
          setError(t('Conecta tu canal de YouTube primero desde el panel.', 'Connect your YouTube channel first from the dashboard.'));
        } else if (json.error === 'no_videos') {
          setError(t('No se encontraron vídeos en tu canal.', 'No videos found on your channel.'));
        } else if (json.error === 'not_enough_videos') {
          setError(t(`Necesitas al menos 3 vídeos para analizar (tienes ${json.videoCount}).`, `You need at least 3 videos to analyze (you have ${json.videoCount}).`));
        } else {
          setError(json.error || t('Error de conexión', 'Connection error'));
        }
        return;
      }
      setData(json.data);
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
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Mejor Hora', 'Best Time')}</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para analizar tu canal.', 'Sign in to analyze your channel.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="yv-page yv-page--wide">

        {/* Page title */}
        <div className="mb-10">
          <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
            {t('MEJOR HORA PARA PUBLICAR', 'BEST TIME TO PUBLISH')}
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl text-white leading-tight">
            {t('Mejor hora', 'Best time')}<br />
            <span style={{ color: 'var(--red)' }}>{t('para publicar.', 'to publish.')}</span>
          </h1>
          <p className="text-zinc-500 mt-3 text-sm font-mono-jb max-w-xl">
            {t(
              'Analiza cuándo tus vídeos consiguen más vistas según el día y la hora de publicación. Basado en datos reales de tu canal.',
              'Analyze when your videos get the most views based on publish day and time. Based on real data from your channel.'
            )}
          </p>
        </div>

        {/* Analyze button */}
        <div className="mb-10">
          <button
            onClick={analyze}
            disabled={loading}
            className="btn-offset inline-flex items-center gap-2 px-8 py-3 text-sm font-display disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('Analizando...', 'Analyzing...')}
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
                {t('Analizar mi canal', 'Analyze my channel')}
              </>
            )}
          </button>
          {data && (
            <span className="ml-4 text-zinc-600 font-mono-jb text-[11px]">
              {t(`${data.videoCount} vídeos analizados`, `${data.videoCount} videos analyzed`)}
              {' · '}
              {new Date(data.analyzedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 p-4 rounded-lg border border-red-500/30" style={{ background: 'rgba(232,77,91,0.08)' }}>
            <p className="text-sm text-red-400 font-mono-jb">{error}</p>
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-8">

            {/* Heatmap */}
            <div className="rounded-xl border border-white/10 p-6" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <h2 className="font-display font-bold text-lg text-white mb-6">
                {t('Mapa de rendimiento', 'Performance heatmap')}
              </h2>

              {/* Heatmap grid */}
              <div className="overflow-x-auto">
                <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(24, 1fr)', gap: '2px', minWidth: '600px' }}>
                  {/* Header row: hours */}
                  <div />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="text-center font-mono-jb text-[9px] text-zinc-600 pb-1">
                      {h}
                    </div>
                  ))}

                  {/* Data rows */}
                  {data.heatmap.map((row, di) => (
                    <>
                      <div key={`label-${di}`} className="font-mono-jb text-[10px] text-zinc-500 pr-2 flex items-center justify-end">
                        {DAY_LABELS[lang][di]}
                      </div>
                      {row.map((val, hi) => {
                        const isTop = data.topSlots.some(s => s.day === di && s.hour === hi);
                        const isHovered = hoveredCell?.day === di && hoveredCell?.hour === hi;
                        return (
                          <div
                            key={`${di}-${hi}`}
                            onMouseEnter={() => setHoveredCell({ day: di, hour: hi })}
                            onMouseLeave={() => setHoveredCell(null)}
                            style={{
                              background: cellColor(val),
                              borderRadius: '3px',
                              aspectRatio: '1',
                              minWidth: '14px',
                              border: isTop ? '1.5px solid rgba(255,215,0,0.6)' : isHovered ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                              cursor: 'default',
                              position: 'relative',
                            }}
                            title={`${DAY_FULL[lang][di]} ${hi}:00 — ${val > 0 ? `Score: ${val}` : t('Sin datos', 'No data')}`}
                          />
                        );
                      })}
                    </>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 mt-4">
                <span className="font-mono-jb text-[10px] text-zinc-600">{t('Bajo', 'Low')}</span>
                <div className="flex gap-[2px]">
                  {[0, 20, 40, 60, 80, 100].map(v => (
                    <div
                      key={v}
                      style={{ background: cellColor(v), width: '16px', height: '10px', borderRadius: '2px' }}
                    />
                  ))}
                </div>
                <span className="font-mono-jb text-[10px] text-zinc-600">{t('Alto', 'High')}</span>
                <span className="ml-4 font-mono-jb text-[10px] text-zinc-600 flex items-center gap-1">
                  <span style={{ width: '10px', height: '10px', border: '1.5px solid rgba(255,215,0,0.6)', borderRadius: '2px', display: 'inline-block' }} />
                  Top 3
                </span>
              </div>

              {/* Hovered cell info */}
              {hoveredCell && (
                <div className="mt-3 font-mono-jb text-[11px] text-zinc-400">
                  {DAY_FULL[lang][hoveredCell.day]} {hoveredCell.hour}:00 UTC — Score: {data.heatmap[hoveredCell.day][hoveredCell.hour]}
                </div>
              )}
            </div>

            {/* Top 3 slots */}
            <div>
              <h2 className="font-display font-bold text-lg text-white mb-4">
                {t('Mejores ventanas de publicación', 'Best publishing windows')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.topSlots.map((slot, i) => (
                  <div
                    key={i}
                    className="rounded-xl border p-5"
                    style={{
                      borderColor: `${MEDAL_COLORS[i]}33`,
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono-jb text-[11px] font-bold px-2 py-0.5 rounded"
                          style={{ background: `${MEDAL_COLORS[i]}22`, color: MEDAL_COLORS[i] }}
                        >
                          {MEDAL_LABELS[i]}
                        </span>
                      </div>
                      <span
                        className="font-mono-jb text-[20px] font-bold"
                        style={{ color: MEDAL_COLORS[i] }}
                      >
                        {slot.score}
                      </span>
                    </div>
                    <p className="font-display font-bold text-white text-lg">
                      {DAY_FULL[lang][slot.day]}
                    </p>
                    <p className="font-mono-jb text-zinc-400 text-sm">
                      {slot.hour}:00 — {(slot.hour + 2) % 24}:00 UTC
                    </p>
                    {slot.videoCount > 0 && (
                      <p className="font-mono-jb text-[11px] text-zinc-600 mt-2">
                        {t(`${slot.videoCount} vídeo${slot.videoCount > 1 ? 's' : ''} publicado${slot.videoCount > 1 ? 's' : ''}`, `${slot.videoCount} video${slot.videoCount > 1 ? 's' : ''} published`)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* AI Tip */}
            {data.aiTip && (
              <div className="rounded-xl border border-purple-500/20 p-5" style={{ background: 'rgba(168,85,247,0.05)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(168,85,247,0.15)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-mono-jb text-[10px] tracking-wider text-purple-400 mb-1">AI INSIGHT</p>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      {lang === 'en' ? data.aiTip.en : data.aiTip.es}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Note about UTC */}
            <p className="font-mono-jb text-[11px] text-zinc-600">
              {t(
                'Las horas se muestran en UTC. Ajusta a tu zona horaria local.',
                'Times are shown in UTC. Adjust to your local timezone.'
              )}
            </p>
          </div>
        )}

        {/* Empty state */}
        {!data && !error && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(155,32,32,0.1)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <h3 className="font-display font-bold text-xl text-white mb-2">
              {t('Descubre tu mejor hora', 'Discover your best time')}
            </h3>
            <p className="text-zinc-500 font-mono-jb text-sm max-w-md mx-auto">
              {t(
                'Pulsa "Analizar mi canal" para descubrir cuándo tus vídeos funcionan mejor según los datos reales de tu canal.',
                'Click "Analyze my channel" to discover when your videos perform best based on your real channel data.'
              )}
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
