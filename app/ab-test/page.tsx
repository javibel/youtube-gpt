'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface Video {
  videoId: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
  likes: number;
}

interface AbTest {
  id: string;
  videoId: string;
  thumbnail: string | null;
  originalTitle: string;
  variantA: string;
  variantB: string;
  status: string;
  hoursPerVariant: number;
  startedAt: string;
  switchedAt: string | null;
  completedAt: string | null;
  initialViews: number;
  switchViews: number | null;
  endViews: number | null;
  winner: string | null;
  aiInsight: { es: string; en: string } | null;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function timeLeft(target: Date): string {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return '0h';
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function progressPct(start: Date, end: Date): number {
  const total = end.getTime() - start.getTime();
  const elapsed = Date.now() - start.getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

export default function AbTestPage() {
  const { data: session, status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [videos, setVideos] = useState<Video[]>([]);
  const [tests, setTests] = useState<AbTest[]>([]);
  const [channelConnected, setChannelConnected] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [variantA, setVariantA] = useState('');
  const [variantB, setVariantB] = useState('');
  const [hours, setHours] = useState(48);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState('');
  const [loadingVideos, setLoadingVideos] = useState(true);

  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  useEffect(() => { setLang(getLangClient()); }, []);

  // Load videos and tests on mount
  useEffect(() => {
    if (status !== 'authenticated') return;
    Promise.all([
      fetch('/api/youtube/channel').then(r => r.json()),
      fetch('/api/youtube/ab-test').then(r => r.json()),
    ]).then(async ([ch, ab]) => {
      if (ab.tests) setTests(ab.tests);
      if (ch.connected) {
        setChannelConnected(true);
        if (ch.videos && ch.videos.length > 0) {
          setVideos(ch.videos);
        } else {
          // Cached response has no videos — fetch fresh
          const fresh = await fetch('/api/youtube/channel?fresh=1').then(r => r.json());
          if (fresh.videos) setVideos(fresh.videos);
        }
      }
      setLoadingVideos(false);
    }).catch(() => setLoadingVideos(false));
  }, [status]);

  const activeTests = tests.filter(t => t.status === 'variant_a' || t.status === 'variant_b');
  const pastTests = tests.filter(t => t.status === 'completed' || t.status === 'cancelled');
  const activeVideoIds = new Set(activeTests.map(t => t.videoId));

  async function suggestTitles() {
    if (!selectedVideo) return;
    setSuggesting(true);
    try {
      const res = await fetch('/api/youtube/ab-test/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: selectedVideo.title, lang }),
      });
      const data = await res.json();
      if (data.variantA) setVariantA(data.variantA);
      if (data.variantB) setVariantB(data.variantB);
    } catch {
      setError(t('Error generando sugerencias', 'Error generating suggestions'));
    } finally {
      setSuggesting(false);
    }
  }

  async function createTest() {
    if (!selectedVideo || !variantA.trim() || !variantB.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/youtube/ab-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: selectedVideo.videoId,
          variantA: variantA.trim(),
          variantB: variantB.trim(),
          hoursPerVariant: hours,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'pro_required') {
          setError(t('Necesitas el plan Pro.', 'You need the Pro plan.'));
        } else if (data.error === 'youtube_not_connected') {
          setError(t('Conecta tu canal de YouTube primero.', 'Connect your YouTube channel first.'));
        } else if (data.error === 'youtube_reconnect_required') {
          setError(t(
            'Necesitas reconectar tu canal de YouTube para habilitar A/B testing. Ve a tu panel, desconecta el canal y vuelve a conectarlo.',
            'You need to reconnect your YouTube channel to enable A/B testing. Go to your dashboard, disconnect and reconnect your channel.',
          ));
        } else if (data.error === 'active_test_exists') {
          setError(t('Este video ya tiene un test activo.', 'This video already has an active test.'));
        } else if (data.error === 'max_active_tests') {
          setError(t('Máximo 3 tests activos a la vez. Cancela o espera a que termine alguno.', 'Maximum 3 active tests at a time. Cancel or wait for one to finish.'));
        } else {
          setError(data.error || t('Error al crear el test', 'Error creating test'));
        }
        return;
      }
      setTests(prev => [data.test, ...prev]);
      setSelectedVideo(null);
      setVariantA('');
      setVariantB('');
    } catch {
      setError(t('Error de conexion', 'Connection error'));
    } finally {
      setLoading(false);
    }
  }

  async function cancelTest(testId: string) {
    try {
      await fetch('/api/youtube/ab-test', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId, action: 'cancel' }),
      });
      setTests(prev => prev.map(t => t.id === testId ? { ...t, status: 'cancelled' } : t));
    } catch {
      setError(t('Error al cancelar', 'Error cancelling'));
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
          <h1 className="font-display font-bold text-3xl text-white mb-4">A/B Testing</h1>
          <p className="mb-6 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesion para usar A/B testing.', 'Sign in to use A/B testing.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesion', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>

      <div className="yv-page yv-page--wide">

        {/* Page header */}
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">A/B TESTING</span>
            <h1 className="yv-page-header__title">
              {t('Encuentra el ', 'Find the ')}
              <span style={{ color: 'var(--yv-brand)' }}>{t('titulo ganador.', 'winning title.')}</span>
            </h1>
            <p className="yv-page-header__desc">
              {t(
                'Prueba 2 variantes de titulo en un video real. El sistema cambia automaticamente entre ellas y mide cual consigue mas vistas.',
                'Test 2 title variants on a real video. The system automatically switches between them and measures which gets more views.',
              )}
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 p-4 rounded-lg border border-red-500/30" style={{ background: 'rgba(232,77,91,0.08)' }}>
            <p className="text-sm text-red-400 font-mono-jb">{error}</p>
          </div>
        )}

        {/* Active Tests */}
        {activeTests.length > 0 && (
          <div className="mb-10">
            <h2 className="font-display font-bold text-lg text-white mb-4">{t('Tests activos', 'Active tests')} <span className="text-sm font-mono-jb" style={{ color: 'var(--yv-text-3)' }}>({activeTests.length}/3)</span></h2>
            <div className="space-y-4">
              {activeTests.map(at => (
                <ActiveTestCard key={at.id} test={at} lang={lang} t={t} onCancel={cancelTest} />
              ))}
            </div>
          </div>
        )}

        {/* Create new test */}
        {activeTests.length < 3 && (
          <div className="yv-card mb-10">
            <h2 className="font-display font-bold text-lg text-white mb-6">{t('Nuevo test', 'New test')}</h2>

            {/* Video selector */}
            {loadingVideos ? (
              <div className="flex items-center gap-2 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('Cargando videos...', 'Loading videos...')}
              </div>
            ) : !channelConnected ? (
              <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>
                {t('Conecta tu canal de YouTube desde el panel para ver tus videos.', 'Connect your YouTube channel from the dashboard to see your videos.')}
              </p>
            ) : (
              <>
                <p className="font-mono-jb text-[11px] mb-3 uppercase tracking-wider" style={{ color: 'var(--yv-text-3)' }}>{t('Selecciona un video', 'Select a video')}</p>
                <div className="grid gap-2 mb-6">
                  {videos.filter(v => !activeVideoIds.has(v.videoId)).map(v => (
                    <button
                      key={v.videoId}
                      onClick={() => {
                        setSelectedVideo(v);
                        setVariantA(v.title);
                        setVariantB('');
                      }}
                      className="flex items-center gap-3 p-3 rounded-lg border transition text-left"
                      style={{
                        borderColor: selectedVideo?.videoId === v.videoId ? 'var(--yv-brand)' : 'rgba(255,255,255,0.08)',
                        background: selectedVideo?.videoId === v.videoId ? 'rgba(155,32,32,0.1)' : 'rgba(255,255,255,0.02)',
                      }}
                    >
                      {v.thumbnail && (
                        <img src={v.thumbnail} alt="" className="w-24 h-14 rounded object-cover flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white font-medium truncate">{v.title}</p>
                        <p className="font-mono-jb text-[11px]" style={{ color: 'var(--yv-text-4)' }}>{fmtNum(v.views)} views</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Variant inputs */}
                {selectedVideo && (
                  <>
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="font-mono-jb text-[11px] uppercase tracking-wider block mb-2" style={{ color: 'var(--yv-text-3)' }}>
                          {t('Variante A', 'Variant A')}
                        </label>
                        <input
                          value={variantA}
                          onChange={e => setVariantA(e.target.value)}
                          maxLength={100}
                          className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 text-white text-sm font-mono-jb focus:outline-none focus:border-white/30"
                          placeholder={t('Titulo variante A...', 'Variant A title...')}
                        />
                        <p className="font-mono-jb text-[10px] mt-1" style={{ color: 'var(--yv-text-4)' }}>{variantA.length}/100</p>
                      </div>
                      <div>
                        <label className="font-mono-jb text-[11px] uppercase tracking-wider block mb-2" style={{ color: 'var(--yv-text-3)' }}>
                          {t('Variante B', 'Variant B')}
                        </label>
                        <input
                          value={variantB}
                          onChange={e => setVariantB(e.target.value)}
                          maxLength={100}
                          className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 text-white text-sm font-mono-jb focus:outline-none focus:border-white/30"
                          placeholder={t('Titulo variante B...', 'Variant B title...')}
                        />
                        <p className="font-mono-jb text-[10px] mt-1" style={{ color: 'var(--yv-text-4)' }}>{variantB.length}/100</p>
                      </div>
                    </div>

                    {/* AI suggest button */}
                    <button
                      onClick={suggestTitles}
                      disabled={suggesting}
                      className="mb-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-500/30 text-purple-400 text-sm font-mono-jb hover:bg-purple-500/10 transition disabled:opacity-50"
                    >
                      {suggesting ? (
                        <div className="w-3 h-3 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                        </svg>
                      )}
                      {t('Sugerir con IA', 'AI suggestions')}
                    </button>

                    {/* Duration selector */}
                    <div className="mb-6">
                      <label className="font-mono-jb text-[11px] uppercase tracking-wider block mb-2" style={{ color: 'var(--yv-text-3)' }}>
                        {t('Duracion por variante', 'Duration per variant')}
                      </label>
                      <div className="flex gap-2">
                        {[24, 48, 72].map(h => (
                          <button
                            key={h}
                            onClick={() => setHours(h)}
                            className="px-4 py-2 rounded-lg border text-sm font-mono-jb transition"
                            style={{
                              borderColor: hours === h ? 'var(--yv-brand)' : 'rgba(255,255,255,0.08)',
                              background: hours === h ? 'rgba(155,32,32,0.15)' : 'rgba(255,255,255,0.02)',
                              color: hours === h ? 'white' : '#71717a',
                            }}
                          >
                            {h}h
                          </button>
                        ))}
                      </div>
                      <p className="font-mono-jb text-[10px] mt-1" style={{ color: 'var(--yv-text-4)' }}>
                        {t(`Test total: ${hours * 2}h (${Math.round(hours * 2 / 24)} dias)`, `Total test: ${hours * 2}h (${Math.round(hours * 2 / 24)} days)`)}
                      </p>
                    </div>

                    {/* Start button */}
                    <button
                      onClick={createTest}
                      disabled={loading || !variantA.trim() || !variantB.trim() || variantA.trim() === variantB.trim()}
                      className="btn-offset inline-flex items-center gap-2 px-8 py-3 text-sm font-display disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          {t('Iniciando test...', 'Starting test...')}
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M5 3l14 9-14 9V3z"/>
                          </svg>
                          {t('Iniciar A/B test', 'Start A/B test')}
                        </>
                      )}
                    </button>

                    {variantA.trim() && variantB.trim() && variantA.trim() === variantB.trim() && (
                      <p className="text-red-400 font-mono-jb text-[11px] mt-2">
                        {t('Las variantes deben ser diferentes.', 'Variants must be different.')}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Past tests */}
        {pastTests.length > 0 && (
          <div>
            <h2 className="font-display font-bold text-lg text-white mb-4">{t('Historial', 'History')}</h2>
            <div className="space-y-4">
              {pastTests.map(test => (
                <PastTestCard key={test.id} test={test} lang={lang} t={t} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {activeTests.length === 0 && pastTests.length === 0 && !loadingVideos && videos.length > 0 && !selectedVideo && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(155,32,32,0.1)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--yv-brand)" strokeWidth="1.5">
                <path d="M16 3H8a2 2 0 0 0-2 2v14l6-3 6 3V5a2 2 0 0 0-2-2z"/>
                <path d="M10 8h4"/><path d="M12 6v4"/>
              </svg>
            </div>
            <h3 className="font-display font-bold text-xl text-white mb-2">
              {t('Tu primer A/B test', 'Your first A/B test')}
            </h3>
            <p className="font-mono-jb text-sm max-w-md mx-auto" style={{ color: 'var(--yv-text-3)' }}>
              {t(
                'Selecciona un video arriba para probar 2 titulos diferentes y descubrir cual consigue mas vistas.',
                'Select a video above to test 2 different titles and discover which gets more views.',
              )}
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

// ── Active Test Card ──────────────────────────────────────────────────────

function ActiveTestCard({
  test,
  lang,
  t,
  onCancel,
}: {
  test: AbTest;
  lang: Lang;
  t: (es: string, en: string) => string;
  onCancel: (id: string) => void;
}) {
  const isA = test.status === 'variant_a';
  const startTime = new Date(test.startedAt);
  const switchTime = new Date(startTime.getTime() + test.hoursPerVariant * 3600_000);
  const endTime = test.switchedAt
    ? new Date(new Date(test.switchedAt).getTime() + test.hoursPerVariant * 3600_000)
    : new Date(startTime.getTime() + test.hoursPerVariant * 2 * 3600_000);

  const currentPhaseEnd = isA ? switchTime : endTime;
  const currentPhaseStart = isA ? startTime : new Date(test.switchedAt!);
  const pct = progressPct(currentPhaseStart, currentPhaseEnd);
  const left = timeLeft(currentPhaseEnd);

  return (
    <div className="yv-card yv-card--flush overflow-hidden">
      <div className="flex items-center gap-4 p-5 border-b border-white/5">
        {test.thumbnail && (
          <img src={test.thumbnail} alt="" className="w-28 h-16 rounded object-cover flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono-jb text-[10px] tracking-wider mb-1" style={{ color: 'var(--yv-brand)' }}>
            {isA ? t('VARIANTE A EN CURSO', 'VARIANT A RUNNING') : t('VARIANTE B EN CURSO', 'VARIANT B RUNNING')}
          </p>
          <p className="text-sm font-mono-jb truncate" style={{ color: 'var(--yv-text-2)' }}>
            {t('Original:', 'Original:')} {test.originalTitle}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-0 divide-x divide-white/5">
        <div className={`p-5 ${isA ? 'bg-white/[0.03]' : ''}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono-jb text-[10px] font-bold px-2 py-0.5 rounded" style={{
              background: isA ? 'rgba(155,32,32,0.2)' : 'rgba(255,255,255,0.05)',
              color: isA ? 'var(--yv-brand)' : '#52525b',
            }}>A</span>
            {isA && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          </div>
          <p className="text-sm text-white">{test.variantA}</p>
        </div>
        <div className={`p-5 ${!isA ? 'bg-white/[0.03]' : ''}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono-jb text-[10px] font-bold px-2 py-0.5 rounded" style={{
              background: !isA ? 'rgba(155,32,32,0.2)' : 'rgba(255,255,255,0.05)',
              color: !isA ? 'var(--yv-brand)' : '#52525b',
            }}>B</span>
            {!isA && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          </div>
          <p className="text-sm text-white">{test.variantB}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="p-5 border-t border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono-jb text-[11px]" style={{ color: 'var(--yv-text-3)' }}>
            {isA ? t('Fase 1/2', 'Phase 1/2') : t('Fase 2/2', 'Phase 2/2')}
          </span>
          <span className="font-mono-jb text-[11px]" style={{ color: 'var(--yv-text-2)' }}>
            {left} {t('restante', 'remaining')}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/5">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${pct}%`, background: 'var(--yv-brand)' }}
          />
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={() => onCancel(test.id)}
            className="font-mono-jb text-[11px] hover:text-red-400 transition"
            style={{ color: 'var(--yv-text-4)' }}
          >
            {t('Cancelar test', 'Cancel test')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Past Test Card ────────────────────────────────────────────────────────

function PastTestCard({
  test,
  lang,
  t,
}: {
  test: AbTest;
  lang: Lang;
  t: (es: string, en: string) => string;
}) {
  const cancelled = test.status === 'cancelled';
  const viewsA = (test.switchViews ?? 0) - test.initialViews;
  const viewsB = (test.endViews ?? 0) - (test.switchViews ?? 0);

  return (
    <div className="yv-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {test.thumbnail && (
            <img src={test.thumbnail} alt="" className="w-20 h-11 rounded object-cover" />
          )}
          <div>
            <span
              className="font-mono-jb text-[10px] font-bold px-2 py-0.5 rounded"
              style={{
                background: cancelled ? 'rgba(255,255,255,0.05)' : 'rgba(155,32,32,0.15)',
                color: cancelled ? '#52525b' : 'var(--yv-brand)',
              }}
            >
              {cancelled ? t('CANCELADO', 'CANCELLED') : `${t('GANADOR', 'WINNER')}: ${test.winner}`}
            </span>
          </div>
        </div>
        {test.completedAt && (
          <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-4)' }}>
            {new Date(test.completedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
      </div>

      {!cancelled && (
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div
            className="p-3 rounded-lg border"
            style={{
              borderColor: test.winner === 'A' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)',
              background: test.winner === 'A' ? 'rgba(34,197,94,0.05)' : 'transparent',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono-jb text-[10px] font-bold" style={{ color: 'var(--yv-text-3)' }}>A</span>
              <span className="font-mono-jb text-[12px] font-bold" style={{ color: test.winner === 'A' ? '#22c55e' : '#71717a' }}>
                +{fmtNum(viewsA)} views
              </span>
            </div>
            <p className="text-sm text-white">{test.variantA}</p>
          </div>
          <div
            className="p-3 rounded-lg border"
            style={{
              borderColor: test.winner === 'B' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)',
              background: test.winner === 'B' ? 'rgba(34,197,94,0.05)' : 'transparent',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono-jb text-[10px] font-bold" style={{ color: 'var(--yv-text-3)' }}>B</span>
              <span className="font-mono-jb text-[12px] font-bold" style={{ color: test.winner === 'B' ? '#22c55e' : '#71717a' }}>
                +{fmtNum(viewsB)} views
              </span>
            </div>
            <p className="text-sm text-white">{test.variantB}</p>
          </div>
        </div>
      )}

      {cancelled && (
        <p className="text-sm mb-2" style={{ color: 'var(--yv-text-3)' }}>
          <span style={{ color: 'var(--yv-text-4)' }}>A:</span> {test.variantA} <span className="mx-2" style={{ color: 'var(--yv-text-5)' }}>|</span> <span style={{ color: 'var(--yv-text-4)' }}>B:</span> {test.variantB}
        </p>
      )}

      {/* AI insight */}
      {test.aiInsight && !cancelled && (
        <div className="p-3 rounded-lg border border-purple-500/20" style={{ background: 'rgba(168,85,247,0.05)' }}>
          <div className="flex items-start gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" className="mt-0.5 flex-shrink-0">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
              {lang === 'en' ? test.aiInsight.en : test.aiInsight.es}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
