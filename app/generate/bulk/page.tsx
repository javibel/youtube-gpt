'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface Result {
  topic: string;
  content: string;
  error?: string;
}

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
  const [lang, setLang] = useState<Lang>('es');
  const [template, setTemplate] = useState('title');
  const [topicsText, setTopicsText] = useState('');
  const [tone, setTone] = useState('viral');
  const [platform, setPlatform] = useState('youtube');
  const [style, setStyle] = useState('viral');
  const [niche, setNiche] = useState('tech');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  useEffect(() => { setLang(getLangClient()); }, []);

  const topics = topicsText.split('\n').map(l => l.trim()).filter(Boolean);
  const tmpl = TEMPLATES[template];

  async function generate() {
    if (topics.length === 0) return;
    setLoading(true);
    setError('');
    setResults([]);
    setProgress(t(`Generando ${topics.length} contenidos...`, `Generating ${topics.length} items...`));

    const options: Record<string, string> = {};
    if (tmpl.options.includes('tono')) options.tono = tone;
    if (tmpl.options.includes('plataforma')) options.plataforma = platform;
    if (tmpl.options.includes('estilo')) options.estilo = style;
    if (tmpl.options.includes('nicho')) options.nicho = niche;
    if (tmpl.options.includes('keywords') && keywords) options.keywords = keywords;

    try {
      const res = await fetch('/api/generate/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, topics, options, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'pro_required') {
          setError(t('Necesitas el plan Pro.', 'You need the Pro plan.'));
        } else {
          setError(data.error || t('Error al generar', 'Generation error'));
        }
        return;
      }
      setResults(data.results || []);
      setProgress(t(
        `${data.generated}/${data.total} generados correctamente`,
        `${data.generated}/${data.total} generated successfully`,
      ));
    } catch {
      setError(t('Error de conexion', 'Connection error'));
    } finally {
      setLoading(false);
    }
  }

  function copyOne(idx: number) {
    navigator.clipboard.writeText(results[idx].content);
    setCopied(idx);
    setTimeout(() => setCopied(null), 1500);
  }

  function copyAll() {
    const text = results
      .filter(r => !r.error)
      .map(r => `--- ${r.topic} ---\n${r.content}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(-1);
    setTimeout(() => setCopied(null), 1500);
  }

  function exportCSV() {
    const header = 'Topic,Content\n';
    const rows = results
      .filter(r => !r.error)
      .map(r => `"${r.topic.replace(/"/g, '""')}","${r.content.replace(/"/g, '""').replace(/\n/g, ' ')}"`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ytubviral-bulk-${template}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Generacion masiva', 'Bulk generation')}</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesion para usar esta herramienta.', 'Sign in to use this tool.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesion', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>

      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Page title */}
        <div className="mb-10">
          <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
            {t('GENERACION MASIVA', 'BULK GENERATION')}
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl text-white leading-tight">
            {t('Genera contenido', 'Generate content')}<br />
            <span style={{ color: 'var(--red)' }}>{t('en lote.', 'in bulk.')}</span>
          </h1>
          <p className="text-zinc-500 mt-3 text-sm font-mono-jb max-w-xl">
            {t(
              'Introduce hasta 10 temas y genera contenido para todos a la vez. Cada generacion usa 1 credito.',
              'Enter up to 10 topics and generate content for all at once. Each generation uses 1 credit.',
            )}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 p-4 rounded-lg border border-red-500/30" style={{ background: 'rgba(232,77,91,0.08)' }}>
            <p className="text-sm text-red-400 font-mono-jb">{error}</p>
          </div>
        )}

        {/* Form */}
        <div className="rounded-xl border border-white/10 p-6 mb-8" style={{ background: 'rgba(255,255,255,0.02)' }}>

          {/* Template selector */}
          <p className="font-mono-jb text-[11px] text-zinc-500 uppercase tracking-wider mb-3">
            {t('Tipo de contenido', 'Content type')}
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(TEMPLATES).map(([key, tmpl]) => (
              <button
                key={key}
                onClick={() => setTemplate(key)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-mono-jb transition"
                style={{
                  borderColor: template === key ? 'var(--red)' : 'rgba(255,255,255,0.08)',
                  background: template === key ? 'rgba(155,32,32,0.15)' : 'rgba(255,255,255,0.02)',
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
                <p className="font-mono-jb text-[10px] text-zinc-600 mb-1.5">{t('Tono', 'Tone')}</p>
                <div className="flex gap-1.5">
                  {TONE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setTone(o.value)}
                      className="px-3 py-1.5 rounded text-[11px] font-mono-jb transition"
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
                <p className="font-mono-jb text-[10px] text-zinc-600 mb-1.5">{t('Plataforma', 'Platform')}</p>
                <div className="flex gap-1.5">
                  {PLATFORM_OPTIONS.map(p => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      className="px-3 py-1.5 rounded text-[11px] font-mono-jb transition capitalize"
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
                <p className="font-mono-jb text-[10px] text-zinc-600 mb-1.5">{t('Estilo', 'Style')}</p>
                <div className="flex gap-1.5">
                  {STYLE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setStyle(o.value)}
                      className="px-3 py-1.5 rounded text-[11px] font-mono-jb transition"
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
                <p className="font-mono-jb text-[10px] text-zinc-600 mb-1.5">{t('Nicho', 'Niche')}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {NICHE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setNiche(o.value)}
                      className="px-3 py-1.5 rounded text-[11px] font-mono-jb transition"
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
                <p className="font-mono-jb text-[10px] text-zinc-600 mb-1.5">Keywords</p>
                <input
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder={t('keyword1, keyword2, keyword3...', 'keyword1, keyword2, keyword3...')}
                  className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm font-mono-jb focus:outline-none focus:border-white/30"
                />
              </div>
            )}
          </div>

          {/* Topics textarea */}
          <p className="font-mono-jb text-[11px] text-zinc-500 uppercase tracking-wider mb-2">
            {t('Temas (uno por linea)', 'Topics (one per line)')}
          </p>
          <textarea
            value={topicsText}
            onChange={e => setTopicsText(e.target.value)}
            rows={6}
            placeholder={t(
              'Como ganar dinero en YouTube\nMejor camara para YouTube 2026\n10 errores de YouTubers principiantes\n...',
              'How to make money on YouTube\nBest camera for YouTube 2026\n10 beginner YouTuber mistakes\n...',
            )}
            className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 text-white text-sm font-mono-jb focus:outline-none focus:border-white/30 resize-none mb-2"
          />
          <p className="font-mono-jb text-[10px] text-zinc-600 mb-6">
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
                <span className="ml-2 font-mono-jb text-[11px] text-zinc-500">{progress}</span>
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={copyAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] font-mono-jb text-zinc-400 hover:text-white hover:border-white/25 transition"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  {copied === -1 ? t('Copiado!', 'Copied!') : t('Copiar todo', 'Copy all')}
                </button>
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] font-mono-jb text-zinc-400 hover:text-white hover:border-white/25 transition"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  CSV
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/10 overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-jb text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(155,32,32,0.15)', color: 'var(--red)' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-sm text-white font-medium">{r.topic}</span>
                    </div>
                    {!r.error && (
                      <button
                        onClick={() => copyOne(i)}
                        className="font-mono-jb text-[10px] text-zinc-500 hover:text-white transition"
                      >
                        {copied === i ? t('Copiado!', 'Copied!') : t('Copiar', 'Copy')}
                      </button>
                    )}
                  </div>
                  <div className="p-4">
                    {r.error ? (
                      <p className="text-sm text-red-400 font-mono-jb">Error: {r.error}</p>
                    ) : (
                      <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono-jb leading-relaxed max-h-64 overflow-y-auto">
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
