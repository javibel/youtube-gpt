'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAbTestRead, type AbVideo as Video, type AbTest } from '@/lib/use-ab-test-read';
import { useAbSuggestions } from '@/lib/use-ab-suggestions';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useLang } from '@/components/LangProvider';

type Lang = 'es' | 'en';

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
  const lang = useLang();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  const scope = useMemo(() => ({ active: true }), [userId, email, status, lang]);
  const active = useRef(scope); active.current = scope;
  useEffect(() => { scope.active = true; return () => { scope.active = false; }; }, [scope]);
  const isCurrent = () => active.current === scope && scope.active && status === 'authenticated';
  if (status === 'loading') return <p>{lang === 'en' ? 'Loading...' : 'Cargando...'}</p>;
  if (status !== 'authenticated' || !userId || !email) return <DashboardShell><p>{lang === 'en' ? 'Sign in to use A/B testing.' : 'Inicia sesión para usar A/B testing.'}</p><a href="/login">{lang === 'en' ? 'Sign in' : 'Iniciar sesión'}</a></DashboardShell>;
  return <AbTestSession key={JSON.stringify([userId, email])} userId={userId} email={email} lang={lang} isCurrent={isCurrent} />;
}

function AbTestSession({ userId, email, lang, isCurrent }: { userId: string; email: string; lang: Lang; isCurrent: () => boolean }) {
  const read = useAbTestRead(userId, email, lang);
  const { videos, tests, connected: channelConnected } = read;
  const suggestions = useAbSuggestions(JSON.stringify([userId, email]));
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(() => suggestions.selection?.lang === lang ? suggestions.selection.video : null);
  const [variantA, setVariantA] = useState('');
  const [variantB, setVariantB] = useState('');
  const [hours, setHours] = useState(48);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const selection = useRef<object>(suggestions.selection?.token ?? {});
  const selected = useRef(selectedVideo); selected.current = selectedVideo;
  const visibleSelection = selection.current;
  const applied = useRef<object | null>(null);
  const createFlight = useRef(false);
  const suggesting = suggestions.status === 'sending';
  const loadingVideos = read.status === 'loading';

  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  useEffect(() => {
    const original = suggestions.selection;
    if (isCurrent() && original && suggestions.variants && original.lang === lang
      && selection.current === original.token && applied.current !== original.token) {
      applied.current = original.token;
      setVariantA(suggestions.variants.variantA); setVariantB(suggestions.variants.variantB);
    }
  }, [suggestions.selection, suggestions.variants, lang, isCurrent]);

  const activeTests = tests.filter(t => t.status === 'variant_a' || t.status === 'variant_b');
  const pastTests = tests.filter(t => t.status === 'completed' || t.status === 'cancelled');
  const activeVideoIds = new Set(activeTests.map(t => t.videoId));

  async function suggestTitles() {
    if (!isCurrent() || read.status !== 'ready' || !selectedVideo || selected.current !== selectedVideo || suggestions.blocked) return;
    setError('');
    const wait = suggestions.start({ video: selectedVideo, lang, token: selection.current });
    if (wait) applied.current = null;
    await wait;
  }

  async function createTest() {
    if (!isCurrent() || read.status !== 'ready' || createFlight.current || !selectedVideo || selected.current !== selectedVideo || selection.current !== visibleSelection || !variantA.trim() || !variantB.trim()) return;
    createFlight.current = true;
    const originalSelection = selection.current;
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
      if (!isCurrent()) return;
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
          setError(t('Este vídeo ya tiene un test activo.', 'This video already has an active test.'));
        } else if (data.error === 'max_active_tests') {
          setError(t('Máximo 3 tests activos a la vez. Cancela o espera a que termine alguno.', 'Maximum 3 active tests at a time. Cancel or wait for one to finish.'));
        } else {
          setError(data.error || t('Error al crear el test', 'Error creating test'));
        }
        return;
      }
      read.updateTests(prev => [data.test, ...prev]);
      if (selection.current === originalSelection) {
        selection.current = {}; setSelectedVideo(null); setVariantA(''); setVariantB('');
      }
    } catch {
      if (isCurrent()) setError(t('Error de conexion', 'Connection error'));
    } finally {
      createFlight.current = false;
      setLoading(false);
    }
  }

  async function cancelTest(testId: string) {
    if (!isCurrent() || read.status !== 'ready') return;
    try {
      const response = await fetch('/api/youtube/ab-test', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId, action: 'cancel' }),
      });
      if (!response.ok) throw Error('Cancellation unavailable');
      if (isCurrent()) read.updateTests(prev => prev.map(t => t.id === testId ? { ...t, status: 'cancelled' } : t));
    } catch {
      if (isCurrent()) setError(t('Error al cancelar', 'Error cancelling'));
    }
  }

  return (
    <DashboardShell>

      <div className="yv-page">

        {/* Page header */}
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">A/B TESTING</span>
            <h1 className="yv-page-header__title">
              {t('Encuentra el ', 'Find the ')}
              <span style={{ color: 'var(--yv-brand)' }}>{t('título ganador.', 'winning title.')}</span>
            </h1>
            <p className="yv-page-header__desc">
              {t(
                'Prueba 2 variantes de título en un vídeo real. El sistema cambia automáticamente entre ellas y mide cuál consigue más vistas.',
                'Test 2 title variants on a real video. The system automatically switches between them and measures which gets more views.',
              )}
            </p>
          </div>
        </div>

        {/* Error */}
        {suggestions.selection && ['sending', 'unconfirmed', 'storage-unavailable'].includes(suggestions.status) && <p role="status">{t('Petición original: ', 'Original request: ')}{suggestions.selection.video.title} ({suggestions.selection.lang})</p>}
        {read.status === 'error' && <div role="alert"><p>{t('No se pudieron cargar el canal y los tests. Reintenta la lectura.', 'Channel and tests could not be loaded. Retry the read.')}</p><button onClick={() => { if (isCurrent()) void read.retry(); }}>{t('Reintentar lectura', 'Retry read')}</button></div>}
        {['unconfirmed', 'lost', 'storage-unavailable'].includes(suggestions.status) && <p role="status">{suggestions.variants
          ? t('Sugerencias recibidas. La continuidad está bloqueada y no se enviará otra petición.', 'Suggestions received. Continuity is blocked and another request will not be sent.')
          : t('Las sugerencias no están confirmadas. No se enviará otra petición.', 'Suggestions are unconfirmed. Another request will not be sent.')}</p>}
        {suggestions.status === 'rejected' && <p role="alert">{t('No se pudieron generar sugerencias. Comprueba tu acceso y el título.', 'Suggestions could not be generated. Check your access and title.')}</p>}
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
        {activeTests.length < 3 && read.status !== 'error' && (
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
                <p className="font-mono-jb text-[13px] mb-3 uppercase tracking-wider" style={{ color: 'var(--yv-text-3)' }}>{t('Selecciona un video', 'Select a video')}</p>
                <div className="grid gap-2 mb-6">
                  {videos.filter(v => !activeVideoIds.has(v.videoId)).map(v => (
                    <button
                      key={v.videoId}
                      onClick={() => {
                        if (!isCurrent() || read.status !== 'ready') return;
                        selection.current = {};
                        selected.current = v;
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
                        <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{fmtNum(v.views)} views</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Variant inputs */}
                {selectedVideo && (
                  <>
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="font-mono-jb text-[13px] uppercase tracking-wider block mb-2" style={{ color: 'var(--yv-text-3)' }}>
                          {t('Variante A', 'Variant A')}
                        </label>
                        <input
                          value={variantA}
                          onChange={e => { if (isCurrent() && selection.current === visibleSelection) { selection.current = {}; setVariantA(e.target.value); } }}
                          maxLength={100}
                          className="yv-input text-white text-sm font-mono-jb"
                          placeholder={t('Título variante A...', 'Variant A title...')}
                        />
                        <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>{variantA.length}/100</p>
                      </div>
                      <div>
                        <label className="font-mono-jb text-[13px] uppercase tracking-wider block mb-2" style={{ color: 'var(--yv-text-3)' }}>
                          {t('Variante B', 'Variant B')}
                        </label>
                        <input
                          value={variantB}
                          onChange={e => { if (isCurrent() && selection.current === visibleSelection) { selection.current = {}; setVariantB(e.target.value); } }}
                          maxLength={100}
                          className="yv-input text-white text-sm font-mono-jb"
                          placeholder={t('Título variante B...', 'Variant B title...')}
                        />
                        <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>{variantB.length}/100</p>
                      </div>
                    </div>

                    {/* AI suggest button */}
                    <button
                      onClick={suggestTitles}
                      disabled={suggestions.blocked}
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
                      <label className="font-mono-jb text-[13px] uppercase tracking-wider block mb-2" style={{ color: 'var(--yv-text-3)' }}>
                        {t('Duracion por variante', 'Duration per variant')}
                      </label>
                      <div className="flex gap-2">
                        {[24, 48, 72].map(h => (
                          <button
                            key={h}
                            onClick={() => { if (isCurrent()) setHours(h); }}
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
                      <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>
                        {t(`Test total: ${hours * 2}h (${Math.round(hours * 2 / 24)} días)`, `Total test: ${hours * 2}h (${Math.round(hours * 2 / 24)} days)`)}
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
                      <p className="text-red-400 font-mono-jb text-[13px] mt-2">
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
                'Selecciona un vídeo arriba para probar 2 títulos diferentes y descubrir cuál consigue más vistas.',
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
      <div className="flex items-center gap-4 p-5" style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,.05)' }}>
        {test.thumbnail && (
          <img src={test.thumbnail} alt="" className="w-28 h-16 rounded object-cover flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono-jb text-[13px] tracking-wider mb-1" style={{ color: 'var(--yv-brand)' }}>
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
            <span className="font-mono-jb text-[13px] font-bold px-2 py-0.5 rounded" style={{
              background: isA ? 'rgba(155,32,32,0.2)' : 'rgba(255,255,255,0.05)',
              color: isA ? 'var(--yv-brand)' : '#52525b',
            }}>A</span>
            {isA && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          </div>
          <p className="text-sm text-white">{test.variantA}</p>
        </div>
        <div className={`p-5 ${!isA ? 'bg-white/[0.03]' : ''}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono-jb text-[13px] font-bold px-2 py-0.5 rounded" style={{
              background: !isA ? 'rgba(155,32,32,0.2)' : 'rgba(255,255,255,0.05)',
              color: !isA ? 'var(--yv-brand)' : '#52525b',
            }}>B</span>
            {!isA && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          </div>
          <p className="text-sm text-white">{test.variantB}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="p-5" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
            {isA ? t('Fase 1/2', 'Phase 1/2') : t('Fase 2/2', 'Phase 2/2')}
          </span>
          <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-2)' }}>
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
            className="font-mono-jb text-[13px] hover:text-red-400 transition"
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
              className="font-mono-jb text-[13px] font-bold px-2 py-0.5 rounded"
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
          <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
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
              <span className="font-mono-jb text-[13px] font-bold" style={{ color: 'var(--yv-text-3)' }}>A</span>
              <span className="font-mono-jb text-[13px] font-bold" style={{ color: test.winner === 'A' ? '#22c55e' : '#71717a' }}>
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
              <span className="font-mono-jb text-[13px] font-bold" style={{ color: 'var(--yv-text-3)' }}>B</span>
              <span className="font-mono-jb text-[13px] font-bold" style={{ color: test.winner === 'B' ? '#22c55e' : '#71717a' }}>
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
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
              {lang === 'en' ? test.aiInsight.en : test.aiInsight.es}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
