'use client';

import { useState, useEffect, Suspense, lazy } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LimitReachedModal from '@/components/LimitReachedModal';
import { TEMPLATES } from '@/utils/prompts';
import { callClaudeAPI } from '@/utils/claudeAPI';
import { getLangClient } from '@/lib/get-lang-client';

const VideoPreviewGenerator = lazy(() => import('@/components/VideoPreviewGenerator'));

// Template metadata for the new UI
const TPL_META: Record<string, { icon: string; color: string; est: string }> = {
  title:          { icon: '🎯', color: '#e84d5b', est: '8s' },
  description:    { icon: '📄', color: '#00E5FF', est: '12s' },
  script:         { icon: '📝', color: '#FFE800', est: '30s' },
  caption:        { icon: '💬', color: '#FF00AA', est: '10s' },
  thumbnail:      { icon: '🖼️', color: '#7CFF00', est: '5s' },
  niche_analysis: { icon: '🔍', color: '#B388FF', est: '45s' },
  series:         { icon: '📚', color: '#FF8A00', est: '60s' },
  shorts_hook:    { icon: '⚡', color: '#00FFA3', est: '6s' },
  video_preview:  { icon: '📺', color: '#00D9FF', est: '~30s' },
};

const TPL_NAMES: Record<string, Record<'es'|'en', string>> = {
  title:          { es: 'Título',           en: 'Title' },
  description:    { es: 'Descripción',      en: 'Description' },
  script:         { es: 'Script',           en: 'Script' },
  caption:        { es: 'Captions',         en: 'Captions' },
  thumbnail:      { es: 'Miniatura',        en: 'Thumbnail' },
  niche_analysis: { es: 'Análisis de nicho',en: 'Niche Analysis' },
  series:         { es: 'Plan de serie',    en: 'Series Plan' },
  shorts_hook:    { es: 'Hook para Shorts', en: 'Shorts Hook' },
  video_preview:  { es: 'Video Tips',        en: 'Video Tips' },
};

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
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [usageCount, setUsageCount] = useState<number>(0);
  const [limit, setLimit] = useState<number>(10);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [isPro, setIsPro] = useState<boolean>(false);
  const [lang, setLang] = useState<'es'|'en'>('es');
  const [showLimitModal, setShowLimitModal] = useState<boolean>(false);
  const [modalReason, setModalReason] = useState<'limit' | 'pro_feature'>('limit');
  const [copied, setCopied] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [videoPreviewId, setVideoPreviewId] = useState('');
  const [previewScript, setPreviewScript] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewSaved, setPreviewSaved] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => { setLang(getLangClient()); }, []);

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
      .catch(() => {});
  }, []);

  const currentTpl = TEMPLATES[selectedTemplate as keyof typeof TEMPLATES];
  const meta = TPL_META[selectedTemplate] ?? { icon: '📄', color: '#e84d5b', est: '~' };
  const isProTpl = (currentTpl as { proOnly?: boolean })?.proOnly ?? false;
  const inputs: string[] = (currentTpl as { inputs: string[] })?.inputs ?? [];

  const handleSelect = (key: string) => {
    if (key === 'video_preview' && !isPro) { setModalReason('pro_feature'); setShowLimitModal(true); return; }
    const tpl = TEMPLATES[key as keyof typeof TEMPLATES] as { proOnly?: boolean };
    if (tpl?.proOnly && !isPro) { setModalReason('pro_feature'); setShowLimitModal(true); return; }
    setSelectedTemplate(key);
    setOutput('');
    setError('');
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
    try {
      const result = await callClaudeAPI(selectedTemplate, formData, lang);
      setOutput(result);
      setUsageCount((prev) => prev + 1);
      setRemaining((prev) => prev !== null ? Math.max(0, prev - 1) : null);
    } catch (err: unknown) {
      if (err instanceof Error && (err as Error & { limitReached?: boolean }).limitReached) {
        setShowLimitModal(true);
      } else {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      }
    } finally {
      setLoading(false);
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent spin-r" style={{ borderTopColor: 'var(--red)' }} />
      </div>
    );
  }

  const remainingDisplay = remaining ?? Math.max(0, limit - usageCount);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <div className="min-h-screen grain grid-bg" style={{ background: 'var(--ink)', color: 'var(--text)' }}>

      {showLimitModal && <LimitReachedModal onClose={() => setShowLimitModal(false)} reason={modalReason} />}

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
              <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
            </svg>
            <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </a>
          <div className="flex items-center gap-4">
            <span className="font-mono-jb text-[11px] font-semibold px-2.5 py-1 rounded-full border" style={{ borderColor: remainingDisplay > 3 ? 'rgba(255,255,255,0.12)' : 'rgba(232,77,91,0.4)', color: remainingDisplay > 3 ? '#a1a1aa' : '#e84d5b', background: remainingDisplay > 3 ? 'transparent' : 'rgba(232,77,91,0.08)' }}>
              {remainingDisplay} / {limit} {t('créditos', 'credits')}
            </span>
            <a href="/research" className="soft-pill px-3 py-1.5 font-mono-jb text-[11px] tracking-wider uppercase text-zinc-500 hover:text-white">{t('Investigar', 'Research')}</a>
            <a href="/dashboard" className="soft-pill px-3 py-1.5 font-mono-jb text-[11px] tracking-wider uppercase text-zinc-300 hover:text-white">{t('Panel', 'Dashboard')}</a>
            <a href="/profile" title={t('Mi perfil', 'My profile')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-white/30 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            </a>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="font-mono-jb text-[11px] text-zinc-500 hover:text-zinc-300 transition">{t('Salir', 'Sign out')}</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-3 font-mono-jb text-[11px] tracking-wider uppercase text-zinc-500 mb-8">
          <a href="/dashboard" className="hover:text-white transition">{t('Panel', 'Dashboard')}</a>
          <span>/</span>
          <span className="text-white">{t('Nueva generación', 'New generation')}</span>
        </div>

        {/* Template picker */}
        <div className="mb-8">
          <p className="font-mono-jb text-[11px] tracking-wider uppercase text-zinc-500 mb-3">01 · {t('¿Qué necesitas?', 'What do you need?')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([...Object.keys(TEMPLATES), 'video_preview'] as string[]).map((key) => {
              const tplMeta = TPL_META[key] ?? { icon: '📄', color: '#e84d5b', est: '~' };
              const tpl = TEMPLATES[key as keyof typeof TEMPLATES] as { proOnly?: boolean } | undefined;
              const locked = key === 'video_preview' ? !isPro : (tpl?.proOnly && !isPro);
              const active = selectedTemplate === key;
              const isVideoPreview = key === 'video_preview';
              return (
                <button
                  key={key}
                  onClick={() => handleSelect(key)}
                  className="soft-card p-4 text-left transition relative group"
                  style={active ? { borderColor: tplMeta.color, boxShadow: `0 0 0 2px ${tplMeta.color}22, 0 12px 30px -8px ${tplMeta.color}66` } : {}}
                >
                  {locked && (
                    <div className="absolute inset-0 rounded-[14px] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.28)' }}>
                      <div className="text-center">
                        <div className="text-xl mb-1">🔒</div>
                        <span className="red-tape text-[9px]">PRO</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xl">{tplMeta.icon}</span>
                    <span className="font-mono-jb text-[9px] text-zinc-600">~{tplMeta.est}</span>
                  </div>
                  <p className="font-display font-semibold text-sm" style={{ color: active ? '#fff' : '#d4d4d8' }}>
                    {TPL_NAMES[key]?.[lang] ?? key}
                  </p>
                  {isVideoPreview && (
                    <p className="font-mono-jb text-[9px] text-zinc-600 mt-1">Canvas · local</p>
                  )}
                  {active && <span className="absolute top-3 right-3 live-dot" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main layout */}
        <div className="max-w-3xl space-y-5">
            {/* Topic */}
            <div className="soft-card p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono-jb text-[11px] tracking-wider uppercase text-zinc-500">02 · {t('Cuéntanos tu idea', 'Tell us your idea')}</p>
                <p className="font-mono-jb text-[10px] text-zinc-600">{(formData.tema || '').length} / 500</p>
              </div>
              <textarea
                rows={5}
                value={formData.tema}
                onChange={(e) => set('tema', e.target.value.slice(0, 500))}
                className="soft-field resize-none leading-relaxed"
                placeholder={t('Describe tu vídeo, canal o idea. Cuanto más específico, mejor.', 'Describe your video, channel or idea. The more specific, the better.')}
              />
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="font-mono-jb text-[10px] text-zinc-500">{t('Prueba:', 'Try:')}</span>
                {(lang === 'en'
                  ? ['Morning routine', 'Office tour', 'Q&A with followers']
                  : ['Rutina de mañana', 'Tour de mi oficina', 'Q&A con seguidores']
                ).map((s) => (
                  <button key={s} onClick={() => set('tema', s)} className="soft-pill font-mono-jb text-[10px] px-3 py-1 text-zinc-300 hover:text-white">
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Secondary fields based on template */}
            {(inputs.includes('tono') || inputs.includes('nicho') || inputs.includes('plataforma') || inputs.includes('duracion') || inputs.includes('estilo') || inputs.includes('num_videos') || inputs.includes('keywords') || inputs.includes('cta')) && (
              <div className="soft-card p-6">
                <p className="font-mono-jb text-[11px] tracking-wider uppercase text-zinc-500 mb-4">03 · {t('Ajustes', 'Settings')}</p>
                <div className="space-y-5">
                  {inputs.includes('tono') && (
                    <div>
                      <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Tono', 'Tone')}</p>
                      <div className="flex flex-wrap gap-2">
                        {(lang === 'en' ? TONES_EN : TONES_ES).map(([k, label]) => (
                          <button key={k} onClick={() => set('tono', k)}
                            className={`soft-chip px-3 py-2 text-[11px] font-mono-jb tracking-wider uppercase ${formData.tono === k ? 'soft-chip-active' : 'text-zinc-400 hover:text-white'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {inputs.includes('nicho') && (
                    <div>
                      <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Nicho', 'Niche')}</p>
                      <div className="flex flex-wrap gap-2">
                        {(lang === 'en' ? NICHES_EN : NICHES_ES).map(([k, label]) => (
                          <button key={k} onClick={() => set('nicho', k)}
                            className={`soft-chip px-3 py-2 text-[11px] font-mono-jb tracking-wider uppercase ${formData.nicho === k ? 'soft-chip-active' : 'text-zinc-400 hover:text-white'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {inputs.includes('plataforma') && (
                    <div>
                      <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Plataforma', 'Platform')}</p>
                      <select value={formData.plataforma} onChange={(e) => set('plataforma', e.target.value)} className="soft-field py-2 px-3 text-sm">
                        <option value="youtube">YouTube</option>
                        <option value="youtube-shorts">YouTube Shorts</option>
                        <option value="tiktok">TikTok</option>
                        <option value="instagram">Instagram Reels</option>
                      </select>
                    </div>
                  )}
                  {inputs.includes('estilo') && (
                    <div>
                      <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Estilo visual', 'Visual style')}</p>
                      <select value={formData.estilo} onChange={(e) => set('estilo', e.target.value)} className="soft-field py-2 px-3 text-sm">
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
                      <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Duración (minutos)', 'Duration (minutes)')}</p>
                      <input type="number" min={1} max={240} value={formData.duracion} onChange={(e) => set('duracion', e.target.value)} className="soft-field py-2 px-3 text-sm w-28" />
                    </div>
                  )}
                  {inputs.includes('num_videos') && (
                    <div>
                      <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">{t('Nº de episodios', 'No. of episodes')}</p>
                      <input type="number" min={3} max={20} value={formData.num_videos} onChange={(e) => set('num_videos', e.target.value)} className="soft-field py-2 px-3 text-sm w-28" />
                    </div>
                  )}
                  {inputs.includes('keywords') && (
                    <div>
                      <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">Keywords</p>
                      <textarea rows={2} value={formData.keywords} onChange={(e) => set('keywords', e.target.value)} className="soft-field resize-none text-sm" placeholder={t('Ej: programación, tutorial, principiantes', 'E.g. programming, tutorial, beginners')} />
                    </div>
                  )}
                  {inputs.includes('cta') && (
                    <div>
                      <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">Call to Action</p>
                      <textarea rows={2} value={formData.cta} onChange={(e) => set('cta', e.target.value)} className="soft-field resize-none text-sm" placeholder={t('Ej: Suscribirse, ver la parte 2...', 'E.g. Subscribe, watch part 2...')} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generate */}
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handleGenerate}
                disabled={loading || !formData.tema.trim()}
                className="btn-offset px-8 py-4 font-display font-bold text-[15px] gap-3"
                style={selectedTemplate === 'video_preview' ? { background: '#00D9FF', borderColor: '#00D9FF', color: '#000' } : {}}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />
                    {t('Generando...', 'Generating...')}
                  </>
                ) : selectedTemplate === 'video_preview' ? (
                  <>
                    <span>📺</span>
                    {t('Crear Video Tips', 'Create Video Tips')}
                  </>
                ) : (
                  <>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
                    {t('Generar ahora', 'Generate now')}
                  </>
                )}
              </button>
              {selectedTemplate === 'video_preview' ? (
                <p className="font-mono-jb text-[11px] text-zinc-500">
                  📺 {t('Sin créditos · local', '0 credits · local')}
                </p>
              ) : remainingDisplay === 0 ? (
                <p className="font-mono-jb text-[11px]" style={{ color: '#e84d5b' }}>
                  ⚠ {t('Sin créditos este mes', 'No credits left this month')}
                </p>
              ) : (
                <p className="font-mono-jb text-[11px] text-zinc-500">
                  {t('Te quedan', 'You have')} <span className="text-white font-semibold">{remainingDisplay}</span> {t('créditos', 'credits')}
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(232,77,91,0.08)', border: '1px solid rgba(232,77,91,0.3)', color: '#f87171' }}>
                ⚠️ {error}
              </div>
            )}

            {/* Output */}
            {(loading || output) && (
              <div className="soft-card overflow-hidden page-enter">
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/10" style={{ background: '#0B0B0D' }}>
                  <div className="flex items-center gap-3">
                    <span className="live-dot" />
                    <p className="font-mono-jb text-[11px] tracking-wider uppercase text-zinc-400">
                      {loading ? t('Procesando', 'Processing') : t('Resultado', 'Result')}
                    </p>
                  </div>
                  {output && (
                    <button onClick={handleCopy} className="btn-offset btn-offset-white px-3 py-1.5 text-[11px] font-display gap-1.5">
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>
                      {copied ? t('¡Copiado!', 'Copied!') : t('Copiar', 'Copy')}
                    </button>
                  )}
                </div>
                <div className="p-5">
                  {loading && (
                    <div className="space-y-2 font-mono-jb text-xs text-zinc-500">
                      <p><span style={{ color: 'var(--red)' }}>▸</span> {t('Analizando nicho y tono...', 'Analysing niche and tone...')}</p>
                      <p><span style={{ color: 'var(--red)' }}>▸</span> {t('Aplicando frameworks virales...', 'Applying viral frameworks...')}</p>
                      <p className="text-zinc-300"><span style={{ color: 'var(--red)' }}>▸</span> {t('Optimizando para el algoritmo', 'Optimising for the algorithm')}<span className="typing-cursor" /></p>
                    </div>
                  )}
                  {output && (
                    <pre className="text-[14px] leading-relaxed whitespace-pre-wrap font-sans text-zinc-200 max-h-[520px] overflow-y-auto">
                      {output}
                    </pre>
                  )}
                </div>
                {output && (
                  <div className="flex items-center gap-2 px-5 pb-4 pt-2 border-t border-white/10 flex-wrap">
                    <button onClick={handleGenerate} className="btn-offset btn-offset-ghost px-4 py-2 text-[12px] font-display">
                      ⟳ {t('Regenerar', 'Regenerate')}
                    </button>
                    {selectedTemplate === 'script' && isPro && (
                      <button
                        onClick={() => {
                          setPreviewScript(output);
                          setPreviewTitle(formData.tema.slice(0, 60) || 'Script Preview');
                          setVideoPreviewId(`vp-${Date.now()}`);
                          setPreviewSaved(false);
                          setShowVideoPreview(true);
                        }}
                        className="btn-offset btn-offset-ghost px-4 py-2 text-[12px] font-display"
                        style={{ borderColor: '#00D9FF', color: '#00D9FF' }}
                      >
                        📺 {t('Generar Preview', 'Generate Preview')}
                      </button>
                    )}
                    {previewSaved && (
                      <span className="text-[11px] font-mono-jb" style={{ color: '#7CFF00' }}>
                        ✓ {t('Preview guardada', 'Preview saved')}
                      </span>
                    )}
                    <a href="/dashboard" className="ml-auto font-mono-jb text-[11px] tracking-wider uppercase text-zinc-500 hover:text-white transition">
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
    </div>
  );
}
