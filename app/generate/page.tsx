'use client';

import { useEffect, Suspense, lazy } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useRouter } from 'next/navigation';
import LimitReachedModal from '@/components/LimitReachedModal';
import { TEMPLATES } from '@/utils/prompts';
import { useGenericGeneration } from '@/lib/use-generic-generation';
import { useDashboardStats } from '@/lib/use-dashboard-stats';
import { useGeneratorChannelStatus } from '@/lib/use-generator-channel-status';
import { useGeneratorScreenScope, useGeneratorScreenState } from '@/lib/use-generator-screen-scope';
import { useGeneratorMediaLaunch } from '@/lib/use-generator-media-launch';
import { useLang } from '@/components/LangProvider';
import { toast } from '@/components/Toaster';
import { LockIcon, VideoIcon, WarningIcon, BoltIcon, CheckIcon } from '@/components/icons';

const VideoPreviewGenerator = lazy(() => import('@/components/VideoPreviewGenerator'));
const ThumbnailEditor = lazy(() => import('@/components/ThumbnailEditor'));

// Template metadata for the new UI
const TPL_META: Record<string, { icon: string; color: string; est: string }> = {
  title:          { icon: '/icons/title.webp', color: '#e84d5b', est: '8s' },
  description:    { icon: '/icons/description.webp', color: '#00E5FF', est: '12s' },
  script:         { icon: '/icons/script.webp', color: '#FFE800', est: '30s' },
  caption:        { icon: '/icons/caption.webp', color: '#FF00AA', est: '10s' },
  thumbnail:      { icon: '/icons/thumbnail.webp', color: '#7CFF00', est: '15s' },
  niche_analysis: { icon: '/icons/magnifying-glass.webp', color: '#B388FF', est: '45s' },
  next_video:     { icon: '/icons/question.webp', color: '#FF6B35', est: '30s' },
  series:         { icon: '/icons/clapperboard.webp', color: '#FF8A00', est: '60s' },
  shorts_hook:    { icon: '/icons/lightning.webp', color: '#00FFA3', est: '6s' },
  video_preview:  { icon: '/icons/yt-play.webp', color: '#00D9FF', est: '~30s' },
};

const TPL_NAMES: Record<string, Record<'es'|'en', string>> = {
  title:          { es: 'Título',           en: 'Title' },
  description:    { es: 'Descripción',      en: 'Description' },
  script:         { es: 'Script',           en: 'Script' },
  caption:        { es: 'Captions',         en: 'Captions' },
  thumbnail:      { es: 'Miniatura',        en: 'Thumbnail' },
  niche_analysis: { es: 'Análisis de nicho',en: 'Niche Analysis' },
  next_video:     { es: 'Qué grabar',      en: 'Next Video' },
  series:         { es: 'Plan de serie',    en: 'Series Plan' },
  shorts_hook:    { es: 'Hook para Shorts', en: 'Shorts Hook' },
  video_preview:  { es: 'Video Tips',        en: 'Video Tips' },
};

// E2: guided creation pipeline — after a result, suggest the natural next step (same topic carries
// over), so the user flows title → description → script → thumbnail instead of hunting tabs.
const PIPELINE_NEXT: Record<string, string> = { title: 'description', description: 'script', script: 'thumbnail' };

const NICHES_ES = [['tech','Tech'],['gaming','Gaming'],['life','Lifestyle'],['edu','EDU'],['fit','Fitness'],['food','Cocina']];
const NICHES_EN = [['tech','Tech'],['gaming','Gaming'],['life','Lifestyle'],['edu','EDU'],['fit','Fitness'],['food','Cooking']];
const TONES_ES  = [['viral','Viral'],['profesional','Pro'],['casual','Casual'],['educativo','EDU']];
const TONES_EN  = [['viral','Viral'],['profesional','Pro'],['casual','Casual'],['educativo','EDU']];

export default function GeneratePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const lang = useLang();
  const screen = useGeneratorScreenScope(session?.user?.id,session?.user?.email,status,lang);
  const [selectedTemplate, setSelectedTemplate] = useGeneratorScreenState(screen,'title');
  const [formData, setFormData] = useGeneratorScreenState<Record<string, string>>(screen,{ tema: '', tono: 'viral', duracion: '10', plataforma: 'youtube', estilo: 'viral', num_videos: '5', nicho: '', keywords: '', cta: '' });
  const [reviewNudge, setReviewNudge] = useGeneratorScreenState(screen,false);
  const [connectNudgeDismissed, setConnectNudgeDismissed] = useGeneratorScreenState(screen,false);
  const accountStats = useDashboardStats(session?.user?.id,session?.user?.email,status);
  const channelStatus = useGeneratorChannelStatus(session?.user?.id,session?.user?.email,status);
  const planStats = accountStats.data?.stats;
  const isPro = planStats?.isPro === true;
  const videoTipsRemaining = planStats?.videoTipsRemaining;
  const ytConnected = channelStatus.connected;

  const textGeneration = useGenericGeneration(session?.user?.id, session?.user?.email, status,
    selectedTemplate, formData, lang, () => {
      // Confirmed continuations also create a history entry and consume a generation.
      void accountStats.refreshStats();
      try {
        const n=parseInt(localStorage.getItem('ytv_gen_ok') || '0',10)+1;
        localStorage.setItem('ytv_gen_ok',String(n));
        if (n >= 3 && !localStorage.getItem('ytv_review_nudge_off')) setReviewNudge(true);
      } catch {}
    });
  const {output,truncated,continuing,copied} = textGeneration;
  const media = useGeneratorMediaLaunch(screen,selectedTemplate,formData,output,
    () => { void accountStats.refreshStats(); });
  const loading = textGeneration.loading;
  const slowHint = textGeneration.slow;
  const textError = textGeneration.error ? (lang === 'en'
    ? ({unconfirmed:'The result is unconfirmed. Retry the same request or check your history.',timeout:'The response took too long. The server may still have completed it; retry the same request.',limit:'Your plan limit was reached. Retry to check an already saved result, or review your plan.',conflict:'This request conflicts with its saved result. Check your history before starting another generation.',length:'This text exceeds the 32,000-character continuation limit. Your full result is preserved; you can copy it or check your history.'})[textGeneration.error]
    : ({unconfirmed:'El resultado no está confirmado. Reintenta la misma solicitud o consulta tu historial.',timeout:'La respuesta tardó demasiado. El servidor puede haberla completado; reintenta la misma solicitud.',limit:'Se alcanzó el límite del plan. Reintenta para recuperar un resultado ya guardado o revisa tu plan.',conflict:'La solicitud no coincide con su resultado guardado. Consulta tu historial antes de generar de nuevo.',length:'Este texto supera el límite de 32.000 caracteres para continuar. Tu resultado completo se conserva; puedes copiarlo o consultar tu historial.'})[textGeneration.error]) : '';
  const error = textError;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Pre-fill topic and template from query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topic = params.get('topic');
    const template = params.get('template');
    if (topic) setFormData(prev => ({ ...prev, tema: topic }));
    if (template) setSelectedTemplate(template);
  }, [screen.scope]);

  // Gancho de retención (13/07): conectar canal es gratis desde ahora — ver
  // project_channel_connect_free.md. Se ofrece tras el primer resultado.
  useEffect(() => {
    try { if (localStorage.getItem('ytv_connect_nudge_off') === '1') setConnectNudgeDismissed(true); } catch {}
  }, [screen.scope]);

  const currentTpl = TEMPLATES[selectedTemplate as keyof typeof TEMPLATES];
  const meta = TPL_META[selectedTemplate] ?? { icon: '/icons/description.webp', color: '#e84d5b', est: '~' };
  const isProTpl = (currentTpl as { proOnly?: boolean })?.proOnly ?? false;
  const inputs: string[] = (currentTpl as { inputs: string[] })?.inputs ?? [];

  const handleSelect = (key: string) => {
    if (!media.current()) return;
    if ((key === 'thumbnail' || (TEMPLATES[key as keyof typeof TEMPLATES] as {proOnly?:boolean})?.proOnly)
      && (!planStats || accountStats.statsError)) {void accountStats.retryStats();return;}
    if (key === 'thumbnail' && !isPro) { media.showLimit('pro_feature'); return; }
    const tpl = TEMPLATES[key as keyof typeof TEMPLATES] as { proOnly?: boolean };
    if (tpl?.proOnly && !isPro) { media.showLimit('pro_feature'); return; }
    setSelectedTemplate(key);
  };

  const handleGenerate = async () => {
    if (!media.current()) return;
    if (selectedTemplate !== 'thumbnail' && selectedTemplate !== 'video_preview') {
      // The server checks quota after replay; a retry must not be blocked by a stale local count.
      await textGeneration.generate();
      return;
    }
    // Video Preview: el render es client-side, pero el storyboard IA cuenta como
    // una generacion mas (26/08 — free incluye 1/mes, dentro del pool de 10).
    if (selectedTemplate === 'video_preview') {
      if (!planStats || accountStats.statsError) {void accountStats.retryStats();return;}
      if (planStats.remaining === 0) { media.showLimit('limit'); return; }
      if (!isPro && videoTipsRemaining === 0) {
        media.showLimit('video_tips_limit'); return;
      }
      media.openPreview(formData.tema,formData.tema.slice(0,60) || 'Video Tips');
      return;
    }
    // The visible canvas editor owns thumbnail generation and saving.
  };

  const handleContinue = textGeneration.continueGeneration;

  const handleCopy = textGeneration.copyOutput;

  const set = (field: string, value: string) => setFormData((prev) => ({ ...prev, [field]: value }));

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-bg-0)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent spin-r" style={{ borderTopColor: 'var(--yv-brand)' }} />
      </div>
    );
  }
  if (!screen.current()) return null;

  const isBusiness = planStats?.plan === 'business';
  const remainingDisplay = planStats?.remaining;

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <DashboardShell>

      {media.limit && <LimitReachedModal {...media.limit} lang={lang} />}

      <div className="yv-page">
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">
              <a href="/dashboard" className="hover:text-white transition">{t('Panel', 'Dashboard')}</a>
              {' / '}
              {t('Nueva generación', 'New generation')}
            </span>
            <h1 className="yv-page-header__title">{t('Nueva generación', 'New generation')}</h1>
            <p className="yv-page-header__desc">{t('Elige una plantilla y describe tu idea', 'Pick a template and describe your idea')}</p>
          </div>
          <div className="yv-page-header__actions">
            <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
              {!planStats ? (accountStats.statsError ? t('Plan sin confirmar', 'Plan unconfirmed') : t('Comprobando plan…', 'Checking plan…')) : isBusiness
                ? <><span className="text-white font-semibold">∞</span> {t('Ilimitado', 'Unlimited')}</>
                : <>{t('Te quedan', 'You have')} <span className="text-white font-semibold">{remainingDisplay}</span> {t('créditos', 'credits')}</>}
            </p>
          </div>
        </header>

        {!!planStats?.generationsReserved && <p role="status" className="mb-4">
          {planStats.generationsReserved} {t('créditos reservados para generaciones pendientes. Ya están descontados del cupo disponible.', 'credits reserved for pending generations. They are already deducted from available quota.')}
        </p>}

        {accountStats.statsError && <div role="alert" className="yv-card p-4 mb-4">
          <p>{planStats ? t('No se pudo actualizar el plan. Los últimos datos confirmados pueden estar desactualizados.', 'Could not refresh your plan. Last confirmed data may be outdated.') : t('No se pudo comprobar tu plan. No hay límites confirmados.', 'Could not check your plan. Limits are unconfirmed.')}</p>
          <button onClick={accountStats.retryStats} disabled={accountStats.statsRefreshing}>{t('Reintentar plan', 'Retry plan')}</button>
        </div>}
        {!accountStats.statsError && accountStats.statsRefreshing && planStats && <p role="status">{t('Actualizando plan…', 'Refreshing plan…')}</p>}
        {channelStatus.error && <div role="alert" className="yv-card p-4 mb-4">
          <p>{ytConnected === null ? t('No se pudo comprobar la conexión del canal.', 'Could not check channel connection.') : t('No se pudo actualizar la conexión. Se conserva el último estado confirmado.', 'Could not refresh connection. Last confirmed status is retained.')}</p>
          <button onClick={channelStatus.retryChannel} disabled={channelStatus.loading}>{t('Reintentar canal', 'Retry channel')}</button>
        </div>}
        {channelStatus.loading && ytConnected === null && <p role="status">{t('Comprobando canal…', 'Checking channel…')}</p>}
        {channelStatus.cached && ytConnected === true && <p>{t('Conexión según el último estado guardado del canal.', 'Connection reflects the last stored channel status.')}</p>}

        {/* Template picker */}
        <div className="mb-8">
          <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-3" style={{ color: 'var(--yv-text-3)' }}>01 · {t('¿Qué necesitas?', 'What do you need?')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* 'reply' is extension-only (needs a specific comment + video, not a free-text idea) — never show it here */}
            {([...Object.keys(TEMPLATES).filter((k) => k !== 'reply'), 'video_preview'] as string[]).map((key) => {
              const tplMeta = TPL_META[key] ?? { icon: '/icons/description.webp', color: '#e84d5b', est: '~' };
              const tpl = TEMPLATES[key as keyof typeof TEMPLATES] as { proOnly?: boolean } | undefined;
              const locked = !!planStats && (key === 'thumbnail' ? !isPro : (tpl?.proOnly && !isPro));
              const active = selectedTemplate === key;
              const isVideoPreview = key === 'video_preview';
              return (
                <button
                  key={key}
                  onClick={() => handleSelect(key)}
                  className="yv-card p-4 text-left transition relative group"
                  style={active ? { borderColor: tplMeta.color, boxShadow: `0 0 0 2px ${tplMeta.color}22, 0 12px 30px -8px ${tplMeta.color}66` } : {}}
                >
                  {locked && (
                    <div className="absolute inset-0 rounded-[14px] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.28)' }}>
                      <div className="text-center">
                        <div className="mb-1 flex justify-center"><LockIcon size={20} /></div>
                        <span className="red-tape text-[13px]">PRO</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <img src={tplMeta.icon} alt="" width={72} height={72} />
                    <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>~{tplMeta.est}</span>
                  </div>
                  <p className="font-display font-semibold text-sm" style={{ color: active ? '#fff' : '#d4d4d8' }}>
                    {TPL_NAMES[key]?.[lang] ?? key}
                  </p>
                  {isVideoPreview && (
                    <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>
                      {isPro ? 'Canvas · local' : t('1 gratis/mes', '1 free/mo')}
                    </p>
                  )}
                  {active && <span className="absolute top-3 right-3 live-dot" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main layout */}
        <div className="space-y-5">
            {/* Topic — not used by the thumbnail canvas editor, which has its own "Fondo" input below */}
            {selectedTemplate !== 'thumbnail' && (
            <div className="yv-card p-6">
              <div className="flex items-center justify-between mb-3">
                <label htmlFor="gen-tema" className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-3)' }}>02 · {t('Cuéntanos tu idea', 'Tell us your idea')}</label>
                <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{(formData.tema || '').length} / 500</p>
              </div>
              <textarea
                id="gen-tema"
                rows={5}
                value={formData.tema}
                onChange={(e) => set('tema', e.target.value.slice(0, 500))}
                className="soft-field resize-none leading-relaxed"
                placeholder={t('Describe tu vídeo, canal o idea. Cuanto más específico, mejor.', 'Describe your video, channel or idea. The more specific, the better.')}
              />
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{t('Prueba:', 'Try:')}</span>
                {(lang === 'en'
                  ? ['Morning routine', 'Office tour', 'Q&A with followers']
                  : ['Rutina de mañana', 'Tour de mi oficina', 'Q&A con seguidores']
                ).map((s) => (
                  <button key={s} onClick={() => set('tema', s)} className="soft-pill font-mono-jb text-[13px] px-3 py-1 hover:text-white" style={{ color: 'var(--yv-text-2)' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* Secondary fields based on template — hidden for thumbnail (superseded by the canvas editor's own controls) */}
            {selectedTemplate !== 'thumbnail' && (inputs.includes('tono') || inputs.includes('nicho') || inputs.includes('plataforma') || inputs.includes('duracion') || inputs.includes('estilo') || inputs.includes('num_videos') || inputs.includes('keywords') || inputs.includes('cta')) && (
              <div className="yv-card p-6">
                <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-4" style={{ color: 'var(--yv-text-3)' }}>03 · {t('Ajustes', 'Settings')}</p>
                <div className="space-y-5">
                  {inputs.includes('tono') && (
                    <div>
                      <p id="gen-tono-label" className="font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-text-3)' }}>{t('Tono', 'Tone')}</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="gen-tono-label">
                        {(lang === 'en' ? TONES_EN : TONES_ES).map(([k, label]) => (
                          <button key={k} onClick={() => set('tono', k)}
                            className={`soft-chip px-3 py-2 text-[13px] font-mono-jb tracking-wider uppercase ${formData.tono === k ? 'soft-chip-active' : 'hover:text-white'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {inputs.includes('nicho') && (
                    <div>
                      <p id="gen-nicho-label" className="font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-text-3)' }}>{t('Nicho', 'Niche')}</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="gen-nicho-label">
                        {(lang === 'en' ? NICHES_EN : NICHES_ES).map(([k, label]) => (
                          <button key={k} onClick={() => set('nicho', k)}
                            className={`soft-chip px-3 py-2 text-[13px] font-mono-jb tracking-wider uppercase ${formData.nicho === k ? 'soft-chip-active' : 'hover:text-white'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {inputs.includes('plataforma') && (
                    <div>
                      <label htmlFor="gen-plataforma" className="block font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-text-3)' }}>{t('Plataforma', 'Platform')}</label>
                      <select id="gen-plataforma" value={formData.plataforma} onChange={(e) => set('plataforma', e.target.value)} className="soft-field py-2 px-3 text-sm">
                        <option value="youtube">YouTube</option>
                        <option value="youtube-shorts">YouTube Shorts</option>
                        <option value="tiktok">TikTok</option>
                        <option value="instagram">Instagram Reels</option>
                      </select>
                    </div>
                  )}
                  {inputs.includes('estilo') && (
                    <div>
                      <label htmlFor="gen-estilo" className="block font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-text-3)' }}>{t('Estilo visual', 'Visual style')}</label>
                      <select id="gen-estilo" value={formData.estilo} onChange={(e) => set('estilo', e.target.value)} className="soft-field py-2 px-3 text-sm">
                        {(lang === 'en'
                          ? [['viral','Viral'],['cómico','Comic'],['dramático','Dramatic'],['sorpresa','Surprise'],['mysterious','Mysterious']]
                          : [['viral','Viral'],['cómico','Cómico'],['dramático','Dramático'],['sorpresa','Sorpresa'],['mysterious','Misterioso']]
                        ).map(([v, label]) => (
                          <option key={v} value={v}>{label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {inputs.includes('duracion') && (
                    <div>
                      <label htmlFor="gen-duracion" className="block font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-text-3)' }}>{t('Duración (minutos)', 'Duration (minutes)')}</label>
                      <input id="gen-duracion" type="number" min={1} max={240} value={formData.duracion} onChange={(e) => set('duracion', e.target.value)} className="soft-field py-2 px-3 text-sm w-28" />
                    </div>
                  )}
                  {inputs.includes('num_videos') && (
                    <div>
                      <label htmlFor="gen-num-videos" className="block font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-text-3)' }}>{t('Nº de episodios', 'No. of episodes')}</label>
                      <input id="gen-num-videos" type="number" min={3} max={20} value={formData.num_videos} onChange={(e) => set('num_videos', e.target.value)} className="soft-field py-2 px-3 text-sm w-28" />
                    </div>
                  )}
                  {inputs.includes('keywords') && (
                    <div>
                      <label htmlFor="gen-keywords" className="block font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-text-3)' }}>Keywords</label>
                      <textarea id="gen-keywords" rows={2} value={formData.keywords} onChange={(e) => set('keywords', e.target.value)} className="soft-field resize-none text-sm" placeholder={t('Ej: programación, tutorial, principiantes', 'E.g. programming, tutorial, beginners')} />
                    </div>
                  )}
                  {inputs.includes('cta') && (
                    <div>
                      <label htmlFor="gen-cta" className="block font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-text-3)' }}>Call to Action</label>
                      <textarea id="gen-cta" rows={2} value={formData.cta} onChange={(e) => set('cta', e.target.value)} className="soft-field resize-none text-sm" placeholder={t('Ej: Suscribirse, ver la parte 2...', 'E.g. Subscribe, watch part 2...')} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Thumbnail: canvas editor */}
            {selectedTemplate === 'thumbnail' && (
              <Suspense fallback={<div className="yv-card p-8 text-center text-sm" style={{ color: 'var(--yv-text-4)' }}>{t('Cargando editor…', 'Loading editor…')}</div>}>
                <ThumbnailEditor key={screen.scope.key} lang={lang} isPro={isPro} onSaved={() => { if (screen.current()) void accountStats.refreshStats(); }} />
              </Suspense>
            )}

            {/* Generate — hidden when the canvas editor is active (it has its own save button) */}
            <div className={`flex items-center gap-4 flex-wrap${selectedTemplate === 'thumbnail' ? ' hidden' : ''}`}>
              <button
                onClick={handleGenerate}
                disabled={loading || continuing || !formData.tema.trim()}
                className="btn-offset px-8 py-4 font-display font-bold text-[15px] gap-3 disabled:cursor-not-allowed disabled:opacity-40"
                style={selectedTemplate === 'video_preview' ? { background: '#00D9FF', borderColor: '#00D9FF', color: '#000' } : {}}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />
                    {t('Generando...', 'Generating...')}
                  </>
                ) : selectedTemplate === 'video_preview' ? (
                  <>
                    <VideoIcon size={16} />
                    {t('Crear Vídeo Tips', 'Create Video Tips')}
                  </>
                ) : selectedTemplate === 'thumbnail' ? (
                  <>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="white"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    {t('Generar miniatura', 'Generate thumbnail')}
                  </>
                ) : (
                  <>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
                    {textGeneration.retry ? t('Reintentar solicitud', 'Retry request') : t('Generar ahora', 'Generate now')}
                  </>
                )}
              </button>
              {!planStats ? <p>{accountStats.statsError ? t('Plan sin confirmar', 'Plan unconfirmed') : t('Comprobando plan…', 'Checking plan…')}</p> : isBusiness ? (
                <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
                  <span className="text-white font-semibold">∞</span> {t('Ilimitado', 'Unlimited')}
                </p>
              ) : remainingDisplay === 0 ? (
                <p className="font-mono-jb text-[13px] inline-flex items-center gap-1.5" style={{ color: 'var(--yv-brand)' }}>
                  <WarningIcon size={13} /> {t('Sin créditos este mes', 'No credits left this month')}
                </p>
              ) : (
                <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
                  {t('Te quedan', 'You have')} <span className="text-white font-semibold">{remainingDisplay}</span> {t('créditos', 'credits')}
                </p>
              )}
            </div>

            {/* Gancho de retención: conectar canal (gratis) — prioridad sobre el nudge de reseña */}
            {output && !loading && ytConnected === false && !channelStatus.error && !connectNudgeDismissed && (
              <div className="yv-card p-5 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: 'rgba(124,255,0,0.25)' }}>
                <p className="text-sm" style={{ color: 'var(--yv-text-2)' }}>
                  {t('Conecta tu canal (gratis) y cada mañana recibes 5 ideas de vídeo calculadas con tus datos reales y las tendencias de tu nicho.', "Connect your channel (free) and get 5 video ideas every morning, calculated from your real data and your niche's trends.")}
                </p>
                <div className="flex items-center gap-3">
                  <button onClick={() => { if (screen.current()) window.location.href = '/api/youtube/auth'; }} className="btn-offset px-4 py-2 text-[13px] font-display">
                    {t('Conectar canal →', 'Connect channel →')}
                  </button>
                  <button
                    onClick={() => { if (!screen.current()) return; setConnectNudgeDismissed(true); try { localStorage.setItem('ytv_connect_nudge_off', '1'); } catch {} }}
                    className="text-zinc-600 text-[13px] font-mono-jb hover:text-zinc-400 transition"
                  >
                    {t('Ahora no', 'Not now')}
                  </button>
                </div>
              </div>
            )}

            {/* Invitación a reseña real tras 3 generaciones (B5) */}
            {reviewNudge && output && !loading && !(ytConnected === false && !channelStatus.error && !connectNudgeDismissed) && (
              <div className="yv-card p-5 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: 'rgba(255,232,0,0.25)' }}>
                <p className="text-sm" style={{ color: 'var(--yv-text-2)' }}>
                  {t('¿Te está sirviendo YTubViral? Una reseña honesta (buena o mala) nos ayuda más que nada.', 'Is YTubViral helping you? An honest review (good or bad) helps us more than anything.')}
                </p>
                <div className="flex items-center gap-3">
                  <a href="/dashboard#review" className="btn-offset btn-offset-ghost px-4 py-2 text-[13px] font-display">
                    {t('Dejar reseña', 'Leave a review')}
                  </a>
                  <button
                    onClick={() => { if (!screen.current()) return; setReviewNudge(false); try { localStorage.setItem('ytv_review_nudge_off', '1'); } catch {} }}
                    className="text-zinc-600 text-[13px] font-mono-jb hover:text-zinc-400 transition"
                  >
                    {t('Ahora no', 'Not now')}
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {textGeneration.recoveryAvailable && !textGeneration.retry && !loading && !continuing && (
              <div role="status" className="yv-note flex items-center justify-between gap-4 flex-wrap">
                <span>{t('Hay una solicitud de texto pendiente guardada en esta pestaña. Puedes restaurar sus campos para consultar el resultado original.', 'A pending text request is saved in this tab. Restore its fields to check the original result.')}</span>
                <button className="btn-offset px-4 py-1.5 text-[13px]" onClick={() => {
                  if(!screen.current())return;
                  const form=textGeneration.restoreRequest();if(!form)return;
                  setSelectedTemplate(form.template);setFormData(form.inputs);
                }}>{t('Restaurar solicitud pendiente', 'Restore pending request')}</button>
              </div>
            )}
            {textGeneration.restored && <p role="status" className="yv-note">{t('Solicitud restaurada desde esta pestaña, sin enviar nada. El texto parcial procede del almacenamiento local; el resultado pendiente requiere confirmación del servidor.', 'Request restored from this tab without sending anything. Partial text comes from local storage; the pending result needs server confirmation.')}</p>}
            {textGeneration.storageUnavailable && <p role="status" className="yv-note">{t('No se pudo guardar esta solicitud en la pestaña. Conserva la página abierta para reintentar; al recargar se perderá este intento.', 'This request could not be saved in the tab. Keep the page open to retry; reloading will lose this attempt.')}</p>}
            {error && (
              <div role="alert" className="yv-note yv-note--error flex items-center justify-between gap-4 flex-wrap">
                <span className="inline-flex items-center gap-1.5"><WarningIcon size={14} /> {error}</span>
                {textGeneration.retry && <button onClick={textGeneration.retryGeneration} disabled={loading || continuing} className="btn-offset shrink-0 px-4 py-1.5 text-[13px] font-display disabled:opacity-40">
                  {t('Reintentar', 'Retry')}
                </button>}
                {textGeneration.retry && <>
                  <p className="w-full text-sm">{t('Reintentar consulta únicamente el resultado de la solicitud original. Descartar no cancela el trabajo del servidor; generar o continuar después será una nueva solicitud y puede consumir créditos.', 'Retry only checks the original request result. Discarding does not cancel server work; generating or continuing afterwards starts a new request and may consume credits.')}</p>
                  <button onClick={textGeneration.discardGeneration} disabled={loading || continuing} className="btn-offset shrink-0 px-4 py-1.5 text-[13px] font-display disabled:opacity-40">{t('Descartar solicitud', 'Discard request')}</button>
                </>}
                <a href="/dashboard" className="underline">{t('Consultar historial', 'Check history')}</a>
              </div>
            )}

            {/* Text output (all templates except thumbnail) */}
            {(selectedTemplate !== 'thumbnail' && (loading || output)) && (
              <div className="yv-card overflow-hidden page-enter">
                <div className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--yv-bg-1)', boxShadow: 'inset 0 -1px 0 rgba(255,255,255,.08)' }}>
                  <div className="flex items-center gap-3">
                    <span className="live-dot" />
                    <p className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-2)' }}>
                      {loading ? t('Procesando', 'Processing') : t('Resultado', 'Result')}
                    </p>
                  </div>
                  {output && (
                    <button onClick={handleCopy} className="btn-offset btn-offset-white px-3 py-1.5 text-[13px] font-display gap-1.5">
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>
                      {copied ? t('¡Copiado!', 'Copied!') : t('Copiar', 'Copy')}
                    </button>
                  )}
                </div>
                <div className="p-5">
                  {loading && (
                    <div className="space-y-2 font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
                      <p><span style={{ color: 'var(--yv-brand)' }}>▸</span> {t('Analizando nicho y tono...', 'Analysing niche and tone...')}</p>
                      <p><span style={{ color: 'var(--yv-brand)' }}>▸</span> {t('Aplicando frameworks virales...', 'Applying viral frameworks...')}</p>
                      <p style={{ color: 'var(--yv-text-2)' }}><span style={{ color: 'var(--yv-brand)' }}>▸</span> {t('Optimizando para el algoritmo', 'Optimising for the algorithm')}<span className="typing-cursor" /></p>
                      {slowHint && (
                        <p className="pt-2" style={{ color: 'var(--yv-text-2)' }}>
                          {t('Está tardando más de lo normal — los guiones largos pueden llevar hasta un minuto. Seguimos en ello...', 'Taking longer than usual — long scripts can take up to a minute. Still working on it...')}
                        </p>
                      )}
                    </div>
                  )}
                  {output && (
                    <>
                      <pre className="text-base leading-relaxed whitespace-pre-wrap font-sans max-h-[1200px] overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full" style={{ color: 'var(--yv-text-1)' }}>
                        {output}
                      </pre>
                      {truncated && (
                        <p className="mt-3 text-[13px] font-mono-jb inline-flex items-start gap-1.5" style={{ color: 'var(--yv-brand)' }}>
                          <BoltIcon size={13} className="shrink-0 mt-0.5" /> {t('El contenido fue cortado por longitud. Pulsa "Continuar generando" para obtener el resto.', 'Content was cut short due to length. Click "Continue generating" to get the rest.')}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {output && (
                  <div className="flex items-center gap-2 px-5 pb-4 pt-2 flex-wrap" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }}>
                    {truncated && (
                      <button
                        onClick={handleContinue}
                        disabled={continuing || loading}
                        className="btn-offset px-4 py-2 text-[13px] font-display"
                        style={{ borderColor: 'var(--yv-brand)', color: 'var(--yv-brand)' }}
                      >
                        {continuing
                          ? t('Continuando...', 'Continuing...')
                          : t('▸ Continuar generando', '▸ Continue generating')}
                      </button>
                    )}
                    <button onClick={handleGenerate} disabled={loading || continuing} className="btn-offset btn-offset-ghost px-4 py-2 text-[13px] font-display">
                      ⟳ {textGeneration.retry ? t('Reintentar solicitud', 'Retry request') : t('Regenerar', 'Regenerate')}
                    </button>
                    {PIPELINE_NEXT[selectedTemplate] && (
                      <button
                        onClick={() => { handleSelect(PIPELINE_NEXT[selectedTemplate]); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className="btn-offset px-4 py-2 text-[13px] font-display"
                        style={{ borderColor: 'var(--yv-brand)', color: 'var(--yv-brand)' }}
                        title={t('Mismo tema, siguiente paso', 'Same topic, next step')}
                      >
                        {t('Siguiente', 'Next')}: {TPL_NAMES[PIPELINE_NEXT[selectedTemplate]]?.[lang]} →
                      </button>
                    )}
                    {selectedTemplate === 'script' && isPro && (
                      <button
                        onClick={() => {
                          if (!media.current()) return;
                          if (!planStats || accountStats.statsError) {void accountStats.retryStats();return;}
                          if (planStats.remaining === 0) {media.showLimit('limit');return;}
                          if (!isPro) {media.showLimit('pro_feature');return;}
                          media.openPreview(output,formData.tema.slice(0,60) || 'Script Preview');
                        }}
                        className="btn-offset btn-offset-ghost px-4 py-2 text-[13px] font-display inline-flex items-center gap-1.5"
                        style={{ borderColor: '#00D9FF', color: '#00D9FF' }}
                      >
                        <VideoIcon size={14} /> {t('Generar Preview', 'Generate Preview')}
                      </button>
                    )}
                    {media.saved && (
                      <span className="text-[13px] font-mono-jb inline-flex items-center gap-1.5" style={{ color: '#7CFF00' }}>
                        <CheckIcon size={13} /> {t('Preview guardada', 'Preview saved')}
                      </span>
                    )}
                    <a href="/dashboard" className="ml-auto font-mono-jb text-[13px] tracking-wider uppercase hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
                      {t('Ver en panel', 'View in dashboard')} →
                    </a>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
      {/* Video Preview Modal */}
      {media.preview && (
        <Suspense fallback={null}>
          <VideoPreviewGenerator
            key={media.preview.generationId}
            {...media.preview}
            lang={lang}
          />
        </Suspense>
      )}
    </DashboardShell>
  );
}
