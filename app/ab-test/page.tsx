'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAbTestRead, type AbVideo as Video, type AbTest } from '@/lib/use-ab-test-read';
import { useAbSuggestions } from '@/lib/use-ab-suggestions';
import { observeAbWindows } from '@/lib/ab-observation';
import { useAbMutation } from '@/lib/use-ab-mutation';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useLang } from '@/components/LangProvider';

type Lang = 'es' | 'en';

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—';
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
  const { videos, connected: channelConnected } = read;
  const mutations = useAbMutation(userId, email);
  // Original acknowledgments can supply a missing row after remount. A newer
  // terminal GET row wins over the original creation; GET never releases a send.
  const acknowledged = new Map(mutations.confirmed.map(test => [test.id, test]));
  const tests = read.tests.map(test => {
    const ack = acknowledged.get(test.id); acknowledged.delete(test.id);
    return ack?.status === 'cancelled' && ['variant_a', 'variant_b'].includes(test.status) ? ack : test;
  }).concat([...acknowledged.values()]);
  const suggestions = useAbSuggestions(JSON.stringify([userId, email]));
  const capturedCreate = mutations.mutation?.kind === 'create' && mutations.mutation.lang === lang ? mutations.mutation : null;
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(() => capturedCreate?.video ?? (suggestions.selection?.lang === lang ? suggestions.selection.video : null));
  const [variantA, setVariantA] = useState(() => capturedCreate?.variantA ?? '');
  const [variantB, setVariantB] = useState(() => capturedCreate?.variantB ?? '');
  const [hours, setHours] = useState(() => capturedCreate?.hours ?? 48);
  const loading = mutations.status === 'sending' && mutations.mutation?.kind === 'create';
  const [error, setError] = useState('');
  const selection = useRef<object>(capturedCreate?.token ?? suggestions.selection?.token ?? {});
  const selected = useRef(selectedVideo); selected.current = selectedVideo;
  const visibleSelection = selection.current;
  const applied = useRef<object | null>(null);
  const suggesting = suggestions.status === 'sending';
  const loadingVideos = read.status === 'loading';

  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  useEffect(() => {
    const original = suggestions.selection;
    if (isCurrent() && original && suggestions.variants && original.lang === lang
      && selection.current === original.token && applied.current !== original.token) {
      applied.current = original.token;
      selection.current = {};
      setVariantA(suggestions.variants.variantA); setVariantB(suggestions.variants.variantB);
    }
  }, [suggestions.selection, suggestions.variants, lang, isCurrent]);

  useEffect(() => {
    if (isCurrent() && mutations.received && capturedCreate && selection.current === capturedCreate.token) {
      selection.current = {}; selected.current = null;
      setSelectedVideo(null); setVariantA(''); setVariantB('');
    }
  }, [mutations.received, capturedCreate, lang, isCurrent]);

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
    if (!isCurrent() || read.status !== 'ready' || mutations.blocked || !selectedVideo || selected.current !== selectedVideo
      || selection.current !== visibleSelection || !variantA.trim() || !variantB.trim() || variantA.trim() === variantB.trim()) return;
    setError('');
    await mutations.start({ kind: 'create', video: selectedVideo, variantA: variantA.trim(), variantB: variantB.trim(), hours, lang, token: selection.current });
  }

  async function cancelTest(testId: string) {
    if (!isCurrent() || read.status !== 'ready' || mutations.blocked) return;
    const test = tests.find(test => test.id === testId && ['variant_a', 'variant_b'].includes(test.status));
    if (test) { setError(''); await mutations.start({ kind: 'cancel', test, lang }); }
  }

  return (
    <DashboardShell>

      <div className="yv-page">

        {/* Page header */}
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">A/B TESTING</span>
            <h1 className="yv-page-header__title">
              {t('Compara ', 'Compare ')}
              <span style={{ color: 'var(--yv-brand)' }}>{t('dos títulos.', 'two titles.')}</span>
            </h1>
            <p className="yv-page-header__desc">
              {t(
                'Observa incrementos de vistas acumuladas en dos periodos sucesivos. El sistema selecciona el título del periodo con mayor incremento bruto; en empate conserva A. Los periodos pueden durar más de lo programado. No es una prueba aleatoria, una medición de CTR ni evidencia del efecto del título.',
                'Observe lifetime-view increases in two successive periods. The system selects the title from the period with the larger raw increase; a tie keeps A. Periods can run longer than scheduled. This is not a randomized test, a CTR measurement or evidence of the title’s effect.',
              )}
            </p>
          </div>
        </div>

        {/* Error */}
        {mutations.mutation && ['sending', 'unconfirmed', 'storage-unavailable'].includes(mutations.status) && <p role="status">{mutations.mutation.kind === 'create'
          ? t('Creación original: ', 'Original creation: ') + mutations.mutation.video.title
          : t('Cancelación original: ', 'Original cancellation: ') + mutations.mutation.test.originalTitle} ({mutations.mutation.lang})</p>}
        {mutations.status === 'sending' && mutations.mutation?.kind === 'cancel' && <p role="status">{t('Cancelando test...', 'Cancelling test...')}</p>}
        {['unconfirmed', 'lost', 'storage-unavailable'].includes(mutations.status) && <p role="status">{mutations.received
          ? t('Cambio recibido. La continuidad está bloqueada y no se enviará otra modificación.', 'Change received. Continuity is blocked and another mutation will not be sent.')
          : t('El cambio del test no está confirmado. No se enviará otra modificación.', 'The test change is unconfirmed. Another mutation will not be sent.')}</p>}
        {mutations.status === 'rejected' && <p role="alert">{mutations.error === 'pro_required' ? t('Necesitas el plan Pro.', 'You need the Pro plan.')
          : mutations.error === 'youtube_not_connected' ? t('Conecta tu canal de YouTube primero.', 'Connect your YouTube channel first.')
          : mutations.error === 'active_test_exists' ? t('Este vídeo ya tiene un test activo.', 'This video already has an active test.')
          : mutations.error === 'max_active_tests' ? t('Máximo 3 tests activos a la vez.', 'Maximum 3 active tests at a time.')
          : t('No se pudo modificar el test. Comprueba tu acceso y los datos.', 'The test could not be changed. Check your access and data.')}</p>}
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
                <ActiveTestCard key={at.id} test={at} lang={lang} t={t} onCancel={cancelTest} blocked={mutations.blocked} />
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

                    <p className="text-[13px] mb-4" style={{ color: 'var(--yv-text-4)' }}>
                      {t('Las sugerencias son alternativas editoriales sin validar. Revisa que sean veraces; no se ha demostrado una mejora de clics o vistas.', 'Suggestions are untested editorial alternatives. Check their factual accuracy; improved clicks or views have not been demonstrated.')}
                    </p>

                    {/* Duration selector */}
                    <div className="mb-6">
                      <label className="font-mono-jb text-[13px] uppercase tracking-wider block mb-2" style={{ color: 'var(--yv-text-3)' }}>
                        {t('Duracion por variante', 'Duration per variant')}
                      </label>
                      <div className="flex gap-2">
                        {[24, 48, 72].map(h => (
                          <button
                            key={h}
                            onClick={() => { if (isCurrent() && selection.current === visibleSelection) { selection.current = {}; setHours(h); } }}
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
                      disabled={mutations.blocked || !variantA.trim() || !variantB.trim() || variantA.trim() === variantB.trim()}
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
            <h2 className="font-display font-bold text-lg text-white mb-4">{t('Historial', 'History')}</h2><p className="text-[13px] mb-4" style={{ color: 'var(--yv-text-4)' }}>{t('Hasta 20 registros almacenados más recientes. Estas fechas y estados no confirman actividad actual en YouTube ni permiten repetir un cambio pendiente.', 'Up to 20 most recent stored records. These dates and states do not confirm current YouTube activity or permit repeating a pending change.')}</p>
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
                'Selecciona un vídeo para observar dos títulos en periodos sucesivos.',
                'Select a video to observe two titles in successive periods.',
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
  blocked,
}: {
  test: AbTest;
  lang: Lang;
  t: (es: string, en: string) => string;
  onCancel: (id: string) => void;
  blocked: boolean;
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
            disabled={blocked}
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
  const observation = cancelled ? null : observeAbWindows(test);
  const leading = observation?.leadingWindow;
  const viewsA = observation?.viewsA;
  const viewsB = observation?.viewsB;
  const observedAt = (value: string) => new Date(value).toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES');

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
              {cancelled ? t('CANCELADO', 'CANCELLED') : !observation ? t('OBSERVACIÓN INCOMPLETA', 'INCOMPLETE OBSERVATION') : leading === 'tie' ? t('IGUAL INCREMENTO', 'EQUAL INCREASE') : `${t('MAYOR INCREMENTO BRUTO', 'LARGER RAW INCREASE')}: ${leading}`}
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
              borderColor: leading === 'A' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)',
              background: leading === 'A' ? 'rgba(34,197,94,0.05)' : 'transparent',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono-jb text-[13px] font-bold" style={{ color: 'var(--yv-text-3)' }}>A</span>
              <span className="font-mono-jb text-[13px] font-bold" style={{ color: leading === 'A' ? '#22c55e' : '#71717a' }}>
                {viewsA === undefined ? '—' : `+${viewsA.toLocaleString()}`} {t('vistas', 'views')}
              </span>
            </div>
            <p className="text-sm text-white">{test.variantA}</p>
          </div>
          <div
            className="p-3 rounded-lg border"
            style={{
              borderColor: leading === 'B' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)',
              background: leading === 'B' ? 'rgba(34,197,94,0.05)' : 'transparent',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono-jb text-[13px] font-bold" style={{ color: 'var(--yv-text-3)' }}>B</span>
              <span className="font-mono-jb text-[13px] font-bold" style={{ color: leading === 'B' ? '#22c55e' : '#71717a' }}>
                {viewsB === undefined ? '—' : `+${viewsB.toLocaleString()}`} {t('vistas', 'views')}
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

      {!cancelled && <div className="text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
        {observation ? <>
          <p>A: {observedAt(observation.start)} → {observedAt(observation.switch)} ({observation.hoursA.toFixed(2)}h)</p>
          <p>B: {observedAt(observation.switch)} → {observedAt(observation.end)} ({observation.hoursB.toFixed(2)}h)</p>
          <p>{t('Fechas de los registros; no prueban exposición continua. Los periodos son sucesivos y pueden tener distinta duración. Tráfico, edad del vídeo y otros cambios pueden influir. No se midieron impresiones, CTR ni significación estadística y no se atribuye el incremento al título.', 'Record timestamps do not prove continuous exposure. Periods are successive and can differ in duration. Traffic, video age and other changes can affect counts. Impressions, CTR and statistical significance were not measured; the increase is not attributed to the title.')}</p>
        </> : <p>{t('Faltan contadores o fechas coherentes para comparar periodos; los valores ausentes no son cero.', 'Coherent counters or timestamps are missing; absent values are not zero.')}</p>}
        {test.aiInsight && <p>{t('El comentario de IA heredado se conserva en el registro y se omite aquí porque no demuestra una causa.', 'The inherited AI comment remains in the record and is omitted here because it does not establish a cause.')}</p>}
      </div>}
    </div>
  );
}
