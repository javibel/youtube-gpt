'use client';

import { useState, useEffect, Suspense, lazy } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useRouter } from 'next/navigation';
import LimitReachedModal from '@/components/LimitReachedModal';
import { TEMPLATES } from '@/utils/prompts';
import { callClaudeAPI, continueGeneration } from '@/utils/claudeAPI';
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
  next_video:     { icon: '/icons/magnifying-glass.webp', color: '#FF6B35', est: '30s' },
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

  const [selectedTemplate, setSelectedTemplate] = useState<string>('title');
  const [formData, setFormData] = useState<Record<string, string>>({ tema: '', tono: 'viral', duracion: '10', plataforma: 'youtube', estilo: 'viral', num_videos: '5', nicho: '', keywords: '', cta: '' });
  const [output, setOutput] = useState<string>('');
  const [truncated, setTruncated] = useState<boolean>(false);
  const [continuing, setContinuing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [slowHint, setSlowHint] = useState<boolean>(false);
  const [reviewNudge, setReviewNudge] = useState<boolean>(false);
  const [ytConnected, setYtConnected] = useState<boolean | null>(null);
  const [connectNudgeDismissed, setConnectNudgeDismissed] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [usageCount, setUsageCount] = useState<number>(0);
  const [limit, setLimit] = useState<number>(10);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [isPro, setIsPro] = useState<boolean>(false);
  const lang = useLang();
  const [showLimitModal, setShowLimitModal] = useState<boolean>(false);
  const [modalReason, setModalReason] = useState<'limit' | 'pro_feature'>('limit');
  const [copied, setCopied] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [videoPreviewId, setVideoPreviewId] = useState('');
  const [previewScript, setPreviewScript] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewSaved, setPreviewSaved] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const [thumbnailPrompt, setThumbnailPrompt] = useState<string>('');
  const [facePhoto, setFacePhoto] = useState<File | null>(null);
  const [facePhotoPreview, setFacePhotoPreview] = useState<string>('');
  const [facePosition, setFacePosition] = useState<'left' | 'right'>('right');
  const [thumbnailText, setThumbnailText] = useState('');
  const [removingBg, setRemovingBg] = useState(false);
  const [bgRemovalFailed, setBgRemovalFailed] = useState(false);
  const [faceScale, setFaceScale] = useState<number>(80);

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
  }, []);

  useEffect(() => {
    fetch('/api/user/stats')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.stats) {
          setUsageCount(data.stats.generationsThisMonth);
          setLimit(data.stats.limit);
          setRemaining(data.stats.remaining);
          setIsPro(data.stats.isPro);
        }
      })
      .catch(() => toast(lang === 'en' ? 'Could not load your plan limits. Reload the page.' : 'No se pudieron cargar los límites de tu plan. Recarga la página.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gancho de retención (13/07): conectar canal es gratis desde ahora — ver
  // project_channel_connect_free.md. Se ofrece tras el primer resultado.
  useEffect(() => {
    fetch('/api/youtube/channel').then(r => r.ok ? r.json() : null).then(d => {
      setYtConnected(!!d?.connected);
    }).catch(() => setYtConnected(false));
    try { if (localStorage.getItem('ytv_connect_nudge_off') === '1') setConnectNudgeDismissed(true); } catch {}
  }, []);

  const currentTpl = TEMPLATES[selectedTemplate as keyof typeof TEMPLATES];
  const meta = TPL_META[selectedTemplate] ?? { icon: '/icons/description.webp', color: '#e84d5b', est: '~' };
  const isProTpl = (currentTpl as { proOnly?: boolean })?.proOnly ?? false;
  const inputs: string[] = (currentTpl as { inputs: string[] })?.inputs ?? [];

  const handleSelect = (key: string) => {
    if ((key === 'video_preview' || key === 'thumbnail') && !isPro) { setModalReason('pro_feature'); setShowLimitModal(true); return; }
    const tpl = TEMPLATES[key as keyof typeof TEMPLATES] as { proOnly?: boolean };
    if (tpl?.proOnly && !isPro) { setModalReason('pro_feature'); setShowLimitModal(true); return; }
    setSelectedTemplate(key);
    setOutput('');
    setError('');
    setTruncated(false);
    setThumbnailUrl('');
    setThumbnailPrompt('');
  };

  const handleGenerate = async () => {
    // Video Preview is client-side — no API call needed
    if (selectedTemplate === 'video_preview') {
      setPreviewScript(formData.tema);
      setPreviewTitle(formData.tema.slice(0, 60) || 'Video Tips');
      setVideoPreviewId(`vp-${Date.now()}`);
      setPreviewSaved(false);
      setShowVideoPreview(true);
      return;
    }
    if (usageCount >= limit) { setModalReason('limit'); setShowLimitModal(true); return; }
    setLoading(true);
    setError('');
    setOutput('');
    setTruncated(false);
    setThumbnailUrl('');
    setThumbnailPrompt('');
    // Aviso "está tardando" a los 15s (E1 #3) — el timeout duro vive en claudeAPI.js (90s)
    setSlowHint(false);
    const slowTimer = setTimeout(() => setSlowHint(true), 15_000);

    // Thumbnail uses a separate image generation endpoint
    if (selectedTemplate === 'thumbnail') {
      try {
        const body = new FormData();
        body.append('tema', formData.tema);
        body.append('estilo', formData.estilo || 'viral');
        body.append('lang', lang);
        body.append('facePosition', facePosition);
        if (thumbnailText.trim()) body.append('thumbnailText', thumbnailText.trim());
        if (facePhoto) body.append('facePhoto', facePhoto);
        body.append('faceScale', String(faceScale));
        const res = await fetch('/api/generate-thumbnail', {
          method: 'POST',
          body,
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.limitReached) { setShowLimitModal(true); return; }
          throw new Error(data.error || 'Error generating thumbnail');
        }
        setThumbnailUrl(data.imageUrl);
        setThumbnailPrompt(data.prompt);
        setUsageCount((prev) => prev + 1);
        setRemaining((prev) => prev !== null ? Math.max(0, prev - 1) : null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        clearTimeout(slowTimer);
        setSlowHint(false);
        setLoading(false);
      }
      return;
    }

    try {
      const result = await callClaudeAPI(selectedTemplate, formData, lang);
      setOutput(result.content);
      setTruncated(result.truncated);
      setUsageCount((prev) => prev + 1);
      setRemaining((prev) => prev !== null ? Math.max(0, prev - 1) : null);
      // Recogida de reseñas reales (B5): tras 3 generaciones exitosas, invitación única
      try {
        const n = parseInt(localStorage.getItem('ytv_gen_ok') || '0', 10) + 1;
        localStorage.setItem('ytv_gen_ok', String(n));
        if (n >= 3 && !localStorage.getItem('ytv_review_nudge_off')) setReviewNudge(true);
      } catch {}
    } catch (err: unknown) {
      if (err instanceof Error && (err as Error & { limitReached?: boolean }).limitReached) {
        setShowLimitModal(true);
      } else {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      }
    } finally {
      clearTimeout(slowTimer);
      setSlowHint(false);
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setContinuing(true);
    setError('');
    try {
      const result = await continueGeneration(selectedTemplate, formData, output, lang);
      setOutput((prev) => prev + result.content);
      setTruncated(result.truncated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setContinuing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const set = (field: string, value: string) => setFormData((prev) => ({ ...prev, [field]: value }));

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-bg-0)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent spin-r" style={{ borderTopColor: 'var(--yv-brand)' }} />
      </div>
    );
  }

  const isBusiness = limit >= 999999;
  const remainingDisplay = remaining ?? Math.max(0, limit - usageCount);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <DashboardShell>

      {showLimitModal && <LimitReachedModal onClose={() => setShowLimitModal(false)} reason={modalReason} lang={lang} />}

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
              {isBusiness
                ? <><span className="text-white font-semibold">∞</span> {t('Ilimitado', 'Unlimited')}</>
                : <>{t('Te quedan', 'You have')} <span className="text-white font-semibold">{remainingDisplay}</span> {t('créditos', 'credits')}</>}
            </p>
          </div>
        </header>

        {/* Template picker */}
        <div className="mb-8">
          <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-3" style={{ color: 'var(--yv-text-3)' }}>01 · {t('¿Qué necesitas?', 'What do you need?')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* 'reply' is extension-only (needs a specific comment + video, not a free-text idea) — never show it here */}
            {([...Object.keys(TEMPLATES).filter((k) => k !== 'reply'), 'video_preview'] as string[]).map((key) => {
              const tplMeta = TPL_META[key] ?? { icon: '/icons/description.webp', color: '#e84d5b', est: '~' };
              const tpl = TEMPLATES[key as keyof typeof TEMPLATES] as { proOnly?: boolean } | undefined;
              const locked = (key === 'video_preview' || key === 'thumbnail') ? !isPro : (tpl?.proOnly && !isPro);
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
                    <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>Canvas · local</p>
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
                <ThumbnailEditor lang={lang} isPro={isPro} />
              </Suspense>
            )}

            {/* Generate — hidden when the canvas editor is active (it has its own save button) */}
            <div className={`flex items-center gap-4 flex-wrap${selectedTemplate === 'thumbnail' ? ' hidden' : ''}`}>
              <button
                onClick={handleGenerate}
                disabled={loading || !formData.tema.trim()}
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
                    {t('Generar ahora', 'Generate now')}
                  </>
                )}
              </button>
              {selectedTemplate === 'video_preview' ? (
                <p className="font-mono-jb text-[13px] inline-flex items-center gap-1.5" style={{ color: 'var(--yv-text-3)' }}>
                  <VideoIcon size={13} /> {t('Sin créditos · local', '0 credits · local')}
                </p>
              ) : isBusiness ? (
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
            {output && !loading && ytConnected === false && !connectNudgeDismissed && (
              <div className="yv-card p-5 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: 'rgba(124,255,0,0.25)' }}>
                <p className="text-sm" style={{ color: 'var(--yv-text-2)' }}>
                  {t('¿Ideas de vídeo para TU canal? Conéctalo (gratis) y mañana tienes ideas nuevas basadas en tus datos reales.', 'Want video ideas for YOUR channel? Connect it (free) and get fresh ideas tomorrow, based on your real data.')}
                </p>
                <div className="flex items-center gap-3">
                  <button onClick={() => { window.location.href = '/api/youtube/auth'; }} className="btn-offset px-4 py-2 text-[13px] font-display">
                    {t('Conectar canal →', 'Connect channel →')}
                  </button>
                  <button
                    onClick={() => { setConnectNudgeDismissed(true); try { localStorage.setItem('ytv_connect_nudge_off', '1'); } catch {} }}
                    className="text-zinc-600 text-[13px] font-mono-jb hover:text-zinc-400 transition"
                  >
                    {t('Ahora no', 'Not now')}
                  </button>
                </div>
              </div>
            )}

            {/* Invitación a reseña real tras 3 generaciones (B5) */}
            {reviewNudge && output && !loading && !(ytConnected === false && !connectNudgeDismissed) && (
              <div className="yv-card p-5 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: 'rgba(255,232,0,0.25)' }}>
                <p className="text-sm" style={{ color: 'var(--yv-text-2)' }}>
                  {t('¿Te está sirviendo YTubViral? Una reseña honesta (buena o mala) nos ayuda más que nada.', 'Is YTubViral helping you? An honest review (good or bad) helps us more than anything.')}
                </p>
                <div className="flex items-center gap-3">
                  <a href="/dashboard#review" className="btn-offset btn-offset-ghost px-4 py-2 text-[13px] font-display">
                    {t('Dejar reseña', 'Leave a review')}
                  </a>
                  <button
                    onClick={() => { setReviewNudge(false); try { localStorage.setItem('ytv_review_nudge_off', '1'); } catch {} }}
                    className="text-zinc-600 text-[13px] font-mono-jb hover:text-zinc-400 transition"
                  >
                    {t('Ahora no', 'Not now')}
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="yv-note yv-note--error flex items-center justify-between gap-4 flex-wrap">
                <span className="inline-flex items-center gap-1.5"><WarningIcon size={14} /> {error}</span>
                <button onClick={handleGenerate} disabled={loading} className="btn-offset shrink-0 px-4 py-1.5 text-[13px] font-display disabled:opacity-40">
                  {t('Reintentar', 'Retry')}
                </button>
              </div>
            )}

            {/* Thumbnail image output */}
            {(selectedTemplate === 'thumbnail' && (loading || thumbnailUrl)) && (
              <div className="yv-card overflow-hidden page-enter">
                <div className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--yv-bg-1)', boxShadow: 'inset 0 -1px 0 rgba(255,255,255,.08)' }}>
                  <div className="flex items-center gap-3">
                    <span className="live-dot" />
                    <p className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-2)' }}>
                      {loading ? t('Generando miniatura...', 'Generating thumbnail...') : t('Tu miniatura', 'Your thumbnail')}
                    </p>
                  </div>
                </div>
                <div className="p-5">
                  {loading && (
                    <div className="space-y-2 font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
                      <p><span style={{ color: '#7CFF00' }}>▸</span> {t('Analizando tema y estilo...', 'Analysing topic and style...')}</p>
                      <p><span style={{ color: '#7CFF00' }}>▸</span> {t('Diseñando composición visual...', 'Designing visual composition...')}</p>
                      <p style={{ color: 'var(--yv-text-2)' }}><span style={{ color: '#7CFF00' }}>▸</span> {t('Generando imagen con IA', 'Generating image with AI')}<span className="typing-cursor" /></p>
                    </div>
                  )}
                  {thumbnailUrl && (
                    <div className="space-y-4">
                      <div className="yv-glass overflow-hidden" style={{ maxWidth: 640 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumbnailUrl} alt="Generated thumbnail" className="w-full h-auto" style={{ aspectRatio: '16/9', objectFit: 'cover' }} />
                      </div>
                      {thumbnailPrompt && (
                        <details className="text-[13px] font-mono-jb" style={{ color: 'var(--yv-text-4)' }}>
                          <summary className="cursor-pointer hover:text-white transition">{t('Ver prompt utilizado', 'View prompt used')}</summary>
                          <p className="mt-2 p-3 rounded-lg" style={{ background: 'var(--yv-bg-0)', color: 'var(--yv-text-3)' }}>{thumbnailPrompt}</p>
                        </details>
                      )}
                    </div>
                  )}
                </div>
                {thumbnailUrl && (
                  <div className="flex items-center gap-2 px-5 pb-4 pt-2 flex-wrap" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }}>
                    <a
                      href={thumbnailUrl}
                      download="thumbnail.png"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-offset px-4 py-2 text-[13px] font-display"
                      style={{ borderColor: '#7CFF00', color: '#7CFF00' }}
                    >
                      {t('Descargar imagen', 'Download image')}
                    </a>
                    <button onClick={handleGenerate} className="btn-offset btn-offset-ghost px-4 py-2 text-[13px] font-display">
                      {t('Generar otra', 'Generate another')}
                    </button>
                    <a href="/dashboard" className="ml-auto font-mono-jb text-[13px] tracking-wider uppercase hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
                      {t('Ver en panel', 'View in dashboard')} →
                    </a>
                  </div>
                )}
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
                        disabled={continuing}
                        className="btn-offset px-4 py-2 text-[13px] font-display"
                        style={{ borderColor: 'var(--yv-brand)', color: 'var(--yv-brand)' }}
                      >
                        {continuing
                          ? t('Continuando...', 'Continuing...')
                          : t('▸ Continuar generando', '▸ Continue generating')}
                      </button>
                    )}
                    <button onClick={handleGenerate} className="btn-offset btn-offset-ghost px-4 py-2 text-[13px] font-display">
                      ⟳ {t('Regenerar', 'Regenerate')}
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
                          setPreviewScript(output);
                          setPreviewTitle(formData.tema.slice(0, 60) || 'Script Preview');
                          setVideoPreviewId(`vp-${Date.now()}`);
                          setPreviewSaved(false);
                          setShowVideoPreview(true);
                        }}
                        className="btn-offset btn-offset-ghost px-4 py-2 text-[13px] font-display inline-flex items-center gap-1.5"
                        style={{ borderColor: '#00D9FF', color: '#00D9FF' }}
                      >
                        <VideoIcon size={14} /> {t('Generar Preview', 'Generate Preview')}
                      </button>
                    )}
                    {previewSaved && (
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
      {showVideoPreview && (
        <Suspense fallback={null}>
          <VideoPreviewGenerator
            scriptContent={previewScript}
            generationId={videoPreviewId}
            scriptTitle={previewTitle}
            lang={lang}
            onClose={() => setShowVideoPreview(false)}
            onSaved={() => setPreviewSaved(true)}
          />
        </Suspense>
      )}
    </DashboardShell>
  );
}
