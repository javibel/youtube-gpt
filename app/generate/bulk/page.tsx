'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useLang } from '@/components/LangProvider';
import { useBulkGeneration } from '@/lib/use-bulk-generation';
import { readBulkRecovery } from '@/lib/bulk-recovery';

type Lang = 'es' | 'en';

const TEMPLATES: Record<string, { label: Record<Lang, string>; icon: string; options: string[] }> = {
  title:       { label: { es: 'Titulos', en: 'Titles' },           icon: 'M4 6h16M4 12h16M4 18h8', options: ['tono'] },
  description: { label: { es: 'Descripciones', en: 'Descriptions' }, icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', options: ['keywords'] },
  caption:     { label: { es: 'Captions', en: 'Captions' },         icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', options: ['tono', 'plataforma'] },
  thumbnail:   { label: { es: 'Thumbnails', en: 'Thumbnails' },     icon: 'M5 3l14 9-14 9V3z', options: ['estilo'] },
  shorts_hook: { label: { es: 'Hooks Shorts', en: 'Shorts Hooks' }, icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8', options: ['nicho'] },
};

const TONE_OPTIONS = [
  { value: 'viral', label: { es: 'Viral', en: 'Viral' } },
  { value: 'profesional', label: { es: 'Profesional', en: 'Professional' } },
  { value: 'casual', label: { es: 'Casual', en: 'Casual' } },
  { value: 'educativo', label: { es: 'Educativo', en: 'Educational' } },
];

const PLATFORM_OPTIONS = ['youtube', 'youtube-shorts', 'tiktok', 'instagram'];
const STYLE_OPTIONS = [
  { value: 'viral', label: 'Viral' },
  { value: 'comico', label: { es: 'Comico', en: 'Comic' } },
  { value: 'dramatico', label: { es: 'Dramatico', en: 'Dramatic' } },
  { value: 'sorpresa', label: { es: 'Sorpresa', en: 'Surprise' } },
];
const NICHE_OPTIONS = [
  { value: 'tech', label: 'Tech' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'life', label: 'Lifestyle' },
  { value: 'edu', label: { es: 'Educacion', en: 'Education' } },
  { value: 'fit', label: 'Fitness' },
  { value: 'food', label: 'Food' },
];

export default function BulkGeneratePage() {
  const { data: session, status } = useSession();
  const lang = useLang();
  const [template, setTemplate] = useState('title');
  const [topicsText, setTopicsText] = useState('');
  const [tone, setTone] = useState('viral');
  const [platform, setPlatform] = useState('youtube');
  const [style, setStyle] = useState('viral');
  const [niche, setNiche] = useState('tech');
  const [keywords, setKeywords] = useState('');
  const [copyState, setCopyState] = useState<{ current: () => boolean; index: number; results: unknown } | null>(null);
  useEffect(()=>{
    const retained=readBulkRecovery(session?.user?.id,session?.user?.email,status,lang);
    const input=retained?.input;
    setTemplate(input?.template??'title');setTopicsText(input?.topics.join('\n')??'');
    setTone(input?.options.tono??'viral');setPlatform(input?.options.plataforma??'youtube');
    setStyle(input?.options.estilo??'viral');setNiche(input?.options.nicho??'tech');setKeywords(input?.options.keywords??'');
    setCopyState(null);
  },[session?.user?.id,session?.user?.email,status,lang]);
  const t = (es: string, en: string) => (lang === 'en' ? en : es);
  const topics = topicsText.split('\n').map(l => l.trim()).filter(Boolean);
  const tmpl = TEMPLATES[template];
  const options: Record<string, string> = {};
  if (tmpl.options.includes('tono')) options.tono = tone;
  if (tmpl.options.includes('plataforma')) options.plataforma = platform;
  if (tmpl.options.includes('estilo')) options.estilo = style;
  if (tmpl.options.includes('nicho')) options.nicho = niche;
  if (tmpl.options.includes('keywords') && keywords) options.keywords = keywords;
  const batch = useBulkGeneration(session?.user?.id, session?.user?.email, status, template, topics, options, lang);
  const { results, loading, generate } = batch;
  const progress = loading ? t(`Generando ${batch.pendingCount} contenidos...`, `Generating ${batch.pendingCount} items...`)
    : t(`${batch.generated}/${results.length} generados correctamente`, `${batch.generated}/${results.length} generated successfully`);
  const error = batch.error === 'pro' ? t('Necesitas el plan Pro.', 'You need the Pro plan.')
    : batch.error === 'limit' ? t('No hay créditos suficientes para esta selección.', 'Not enough credits for this selection.')
    : batch.error ? t('Resultado sin confirmar. Consulta tu historial antes de generar de nuevo; otra solicitud puede consumir nuevos créditos.',
      'Result unconfirmed. Check your history before generating again; another request may consume new credits.') : '';
  const copied = copyState?.current() && copyState.results === results ? copyState.index : null;

  async function copyOne(idx: number) {
    if (!batch.isCurrent() || !results[idx] || results[idx].error) return;
    try { await navigator.clipboard.writeText(results[idx].content); }
    catch { return; }
    if (batch.isCurrent()) setCopyState({ current: batch.isCurrent, index: idx, results });
  }

  async function copyAll() {
    if (!batch.isCurrent()) return;
    const text = results.filter(r => !r.error).map(r => `--- ${r.topic} ---\n${r.content}`).join('\n\n');
    try { await navigator.clipboard.writeText(text); }
    catch { return; }
    if (batch.isCurrent()) setCopyState({ current: batch.isCurrent, index: -1, results });
  }

  function exportCSV() {
    if (!batch.isCurrent()) return;
    const rows = results.filter(r => !r.error).map(r =>
      `"${r.topic.replace(/"/g, '""')}","${r.content.replace(/"/g, '""').replace(/\n/g, ' ')}"`).join('\n');
    const blob = new Blob(['Topic,Content\n' + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `ytubviral-bulk-${template}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Generación masiva', 'Bulk generation')}</h1>
          <p className="mb-6 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesión para usar esta herramienta.', 'Sign in to use this tool.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>

      <div className="yv-page">

        {/* Page title */}
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('GENERACION MASIVA', 'BULK GENERATION')}</span>
            <h1 className="yv-page-header__title">
              {t('Genera contenido', 'Generate content')}{' '}
              <span style={{ color: 'var(--yv-brand)' }}>{t('en lote.', 'in bulk.')}</span>
            </h1>
            <p className="yv-page-header__desc">
              {t(
                'Introduce hasta 10 temas y genera contenido para todos a la vez. Cada generacion usa 1 credito.',
                'Enter up to 10 topics and generate content for all at once. Each generation uses 1 credit.',
              )}
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" className="mb-8 p-4 rounded-lg border border-red-500/30" style={{ background: 'rgba(232,77,91,0.08)' }}>
            <p className="text-sm text-red-400 font-mono-jb">{error}</p>
          </div>
        )}

        {batch.recoverable && (
          <div className="mb-8">
            <button onClick={batch.recover} disabled={loading} className="btn-offset px-5 py-3 text-sm font-display">
              {t('Recuperar resultados', 'Recover results')}
            </button>
            <p className="mt-2 text-sm font-mono-jb" style={{ color: 'var(--yv-text-3)' }}>
              {t('Consulta los resultados de esta solicitud sin volver a generar. Los temas sin confirmar pueden seguir pendientes.',
                'Read results from this request without generating again. Unconfirmed topics may remain pending.')}
            </p>
            <p className="mt-2 text-sm font-mono-jb" style={{ color: 'var(--yv-text-3)' }}>
              {batch.reloadRecoveryAvailable
                ? t('Al recargar esta pestaña podrás recuperar la última selección pendiente. Los resultados se comprueban de nuevo.',
                    'After reloading this tab you can recover the last pending selection. Results are checked again.')
                : t('Mantén esta página abierta para conservar el reintento de esta solicitud.',
                    'Keep this page open to retain recovery for this request.')}
            </p>
          </div>
        )}

        {/* Form */}
        <div className="yv-card p-6 mb-8">

          {/* Template selector */}
          <p className="font-mono-jb text-[13px] uppercase tracking-wider mb-3" style={{ color: 'var(--yv-text-3)' }}>
            {t('Tipo de contenido', 'Content type')}
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(TEMPLATES).map(([key, tmpl]) => (
              <button
                key={key}
                onClick={() => setTemplate(key)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-mono-jb transition"
                style={{
                  borderColor: template === key ? 'var(--yv-brand-border)' : 'var(--yv-border)',
                  background: template === key ? 'var(--yv-brand-soft)' : 'var(--yv-bg-2)',
                  color: template === key ? 'white' : '#71717a',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d={tmpl.icon}/>
                </svg>
                {tmpl.label[lang]}
              </button>
            ))}
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-4 mb-6">
            {tmpl.options.includes('tono') && (
              <div>
                <p className="font-mono-jb text-[13px] mb-1.5" style={{ color: 'var(--yv-text-4)' }}>{t('Tono', 'Tone')}</p>
                <div className="flex gap-1.5">
                  {TONE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setTone(o.value)}
                      className="px-3 py-1.5 rounded text-[13px] font-mono-jb transition"
                      style={{
                        background: tone === o.value ? 'rgba(155,32,32,0.2)' : 'rgba(255,255,255,0.04)',
                        color: tone === o.value ? 'white' : '#52525b',
                        border: `1px solid ${tone === o.value ? 'rgba(155,32,32,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      {typeof o.label === 'string' ? o.label : o.label[lang]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tmpl.options.includes('plataforma') && (
              <div>
                <p className="font-mono-jb text-[13px] mb-1.5" style={{ color: 'var(--yv-text-4)' }}>{t('Plataforma', 'Platform')}</p>
                <div className="flex gap-1.5">
                  {PLATFORM_OPTIONS.map(p => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      className="px-3 py-1.5 rounded text-[13px] font-mono-jb transition capitalize"
                      style={{
                        background: platform === p ? 'rgba(155,32,32,0.2)' : 'rgba(255,255,255,0.04)',
                        color: platform === p ? 'white' : '#52525b',
                        border: `1px solid ${platform === p ? 'rgba(155,32,32,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tmpl.options.includes('estilo') && (
              <div>
                <p className="font-mono-jb text-[13px] mb-1.5" style={{ color: 'var(--yv-text-4)' }}>{t('Estilo', 'Style')}</p>
                <div className="flex gap-1.5">
                  {STYLE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setStyle(o.value)}
                      className="px-3 py-1.5 rounded text-[13px] font-mono-jb transition"
                      style={{
                        background: style === o.value ? 'rgba(155,32,32,0.2)' : 'rgba(255,255,255,0.04)',
                        color: style === o.value ? 'white' : '#52525b',
                        border: `1px solid ${style === o.value ? 'rgba(155,32,32,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      {typeof o.label === 'string' ? o.label : o.label[lang]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tmpl.options.includes('nicho') && (
              <div>
                <p className="font-mono-jb text-[13px] mb-1.5" style={{ color: 'var(--yv-text-4)' }}>{t('Nicho', 'Niche')}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {NICHE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setNiche(o.value)}
                      className="px-3 py-1.5 rounded text-[13px] font-mono-jb transition"
                      style={{
                        background: niche === o.value ? 'rgba(155,32,32,0.2)' : 'rgba(255,255,255,0.04)',
                        color: niche === o.value ? 'white' : '#52525b',
                        border: `1px solid ${niche === o.value ? 'rgba(155,32,32,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      {typeof o.label === 'string' ? o.label : o.label[lang]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tmpl.options.includes('keywords') && (
              <div className="w-full">
                <p className="font-mono-jb text-[13px] mb-1.5" style={{ color: 'var(--yv-text-4)' }}>Keywords</p>
                <input
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder={t('keyword1, keyword2, keyword3...', 'keyword1, keyword2, keyword3...')}
                  className="w-full px-4 py-2.5 yv-input text-sm font-mono-jb"
                />
              </div>
            )}
          </div>

          {/* Topics textarea */}
          <p className="font-mono-jb text-[13px] uppercase tracking-wider mb-2" style={{ color: 'var(--yv-text-3)' }}>
            {t('Temas (uno por linea)', 'Topics (one per line)')}
          </p>
          <textarea
            value={topicsText}
            onChange={e => setTopicsText(e.target.value)}
            rows={10}
            placeholder={t(
              'Como ganar dinero en YouTube\nMejor camara para YouTube 2026\n10 errores de YouTubers principiantes\n...',
              'How to make money on YouTube\nBest camera for YouTube 2026\n10 beginner YouTuber mistakes\n...',
            )}
            className="w-full px-4 py-3 yv-input text-sm font-mono-jb resize-none mb-2"
          />
          <p className="font-mono-jb text-[13px] mb-6" style={{ color: 'var(--yv-text-4)' }}>
            {topics.length}/10 {t('temas', 'topics')}
          </p>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={loading || topics.length === 0 || topics.length > 10}
            className="btn-offset inline-flex items-center gap-2 px-8 py-3 text-sm font-display disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {progress}
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8"/>
                </svg>
                {t(`Generar ${topics.length} contenidos`, `Generate ${topics.length} items`)}
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-bold text-lg text-white">
                {t('Resultados', 'Results')}
                <span className="ml-2 font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{progress}</span>
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={copyAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-mono-jb hover:text-white transition"
                  style={{ border: '1px solid var(--yv-border)', color: 'var(--yv-text-2)' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  {copied === -1 ? t('Copiado!', 'Copied!') : t('Copiar todo', 'Copy all')}
                </button>
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-mono-jb hover:text-white transition"
                  style={{ border: '1px solid var(--yv-border)', color: 'var(--yv-text-2)' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  CSV
                </button>
              </div>
            </div>

            {batch.failed > 0 && (
              <div className="mb-4">
                <button onClick={batch.generateFailed} disabled={loading}
                  className="btn-offset px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {t(`Generar temas fallidos (${batch.failed})`, `Generate failed topics (${batch.failed})`)}
                </button>
                <p className="text-sm mt-2" style={{ color: 'var(--yv-text-2)' }}>
                  {t('Son generaciones nuevas y pueden consumir nuevos créditos. Se conservan los resultados confirmados.',
                    'These are new generations and may consume new credits. Confirmed results are preserved.')}
                </p>
              </div>
            )}

            <div className="space-y-4">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="yv-card yv-card--flush overflow-hidden"
                >
                  <div className="yv-card__header">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-jb text-[13px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--yv-brand-soft)', color: 'var(--yv-brand)' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-sm text-white font-medium">{r.topic}</span>
                    </div>
                    {!r.error && (
                      <button
                        onClick={() => copyOne(i)}
                        className="font-mono-jb text-[13px] hover:text-white transition"
                        style={{ color: 'var(--yv-text-3)' }}
                      >
                        {copied === i ? t('Copiado!', 'Copied!') : t('Copiar', 'Copy')}
                      </button>
                    )}
                  </div>
                  <div className="yv-card__body">
                    {r.error ? (
                      <div>
                        <p className="text-sm text-red-400 font-mono-jb">Error: {r.error}</p>
                        {r.retryMayConsume === true && (
                          <p className="text-sm mt-2" style={{ color: 'var(--yv-text-2)' }}>
                            {t('Resultado sin confirmar. Generar de nuevo puede consumir otro crédito.',
                              'Result unconfirmed. Generating again may consume another credit.')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <pre className="text-sm whitespace-pre-wrap font-mono-jb leading-relaxed max-h-64 overflow-y-auto" style={{ color: 'var(--yv-text-2)' }}>
                        {r.content}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
