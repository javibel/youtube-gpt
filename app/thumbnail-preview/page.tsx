'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';
type ViewMode = 'search' | 'home' | 'suggested';

interface CompetitorThumb {
  videoId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  views: number;
  publishedAt: string;
}

interface CtrBreakdown {
  category: string;
  score: number;
  tip: string;
}

interface CtrAnalysis {
  score: number;
  breakdown: CtrBreakdown[];
  summary: string;
}

function fmtViews(n: number, lang: Lang): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + (lang === 'en' ? 'M views' : 'M vistas');
  if (n >= 1_000) return (n / 1_000).toFixed(1) + (lang === 'en' ? 'K views' : 'K vistas');
  return n + (lang === 'en' ? ' views' : ' vistas');
}

function timeAgo(iso: string, lang: Lang): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return lang === 'en' ? 'Today' : 'Hoy';
    if (days < 30) return lang === 'en' ? `${days} days ago` : `hace ${days} días`;
    const months = Math.floor(days / 30);
    if (months < 12) return lang === 'en' ? `${months} months ago` : `hace ${months} meses`;
    const years = Math.floor(months / 12);
    return lang === 'en' ? `${years} years ago` : `hace ${years} años`;
  } catch { return ''; }
}

function scoreColor(s: number): string {
  if (s >= 75) return '#22c55e';
  if (s >= 50) return '#eab308';
  return '#ef4444';
}

/* ── YouTube Layout Simulators ── */

function YTSearchResult({ thumb, title, channel, views, date, isUser, lang }: {
  thumb: string; title: string; channel: string; views: number; date: string; isUser: boolean; lang: Lang;
}) {
  return (
    <div className="flex gap-3 py-2.5 group" style={{ opacity: isUser ? 1 : 0.85 }}>
      <div className="relative flex-shrink-0" style={{ width: 246, height: 138 }}>
        <img src={thumb} alt="" className="w-full h-full object-cover rounded-xl" style={{ border: isUser ? '2px solid var(--yv-brand)' : '1px solid rgba(255,255,255,0.06)' }} />
        {isUser && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono-jb font-bold tracking-wider" style={{ background: 'var(--yv-brand)', color: '#fff' }}>
            YOU
          </span>
        )}
        <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded text-[10px] font-mono-jb" style={{ background: 'rgba(0,0,0,0.8)', color: '#fff' }}>
          12:34
        </span>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <h3 className="text-[13px] font-medium text-white leading-snug line-clamp-2 mb-1">{title}</h3>
        <p className="text-[11px] yv-muted mb-0.5">{channel}</p>
        <p className="text-[11px]" style={{ color: 'var(--yv-text-4)' }}>{fmtViews(views, lang)} · {timeAgo(date, lang)}</p>
      </div>
    </div>
  );
}

function YTHomeCard({ thumb, title, channel, views, date, isUser, lang }: {
  thumb: string; title: string; channel: string; views: number; date: string; isUser: boolean; lang: Lang;
}) {
  return (
    <div className="group" style={{ opacity: isUser ? 1 : 0.85 }}>
      <div className="relative aspect-video rounded-xl overflow-hidden mb-2" style={{ border: isUser ? '2px solid var(--yv-brand)' : '1px solid rgba(255,255,255,0.04)' }}>
        <img src={thumb} alt="" className="w-full h-full object-cover" />
        {isUser && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono-jb font-bold tracking-wider" style={{ background: 'var(--yv-brand)', color: '#fff' }}>
            YOU
          </span>
        )}
        <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded text-[10px] font-mono-jb" style={{ background: 'rgba(0,0,0,0.8)', color: '#fff' }}>
          12:34
        </span>
      </div>
      <div className="flex gap-2.5">
        <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ background: isUser ? 'var(--yv-brand)' : 'rgba(255,255,255,0.08)' }} />
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-white leading-snug line-clamp-2 mb-0.5">{title}</h3>
          <p className="text-[11px] yv-muted">{channel}</p>
          <p className="text-[11px]" style={{ color: 'var(--yv-text-4)' }}>{fmtViews(views, lang)} · {timeAgo(date, lang)}</p>
        </div>
      </div>
    </div>
  );
}

function YTSuggestedItem({ thumb, title, channel, views, date, isUser, lang }: {
  thumb: string; title: string; channel: string; views: number; date: string; isUser: boolean; lang: Lang;
}) {
  return (
    <div className="flex gap-2 py-1 group" style={{ opacity: isUser ? 1 : 0.85 }}>
      <div className="relative flex-shrink-0" style={{ width: 168, height: 94 }}>
        <img src={thumb} alt="" className="w-full h-full object-cover rounded-lg" style={{ border: isUser ? '2px solid var(--yv-brand)' : '1px solid rgba(255,255,255,0.04)' }} />
        {isUser && (
          <span className="absolute top-1 left-1 px-1 py-0.5 rounded text-[8px] font-mono-jb font-bold tracking-wider" style={{ background: 'var(--yv-brand)', color: '#fff' }}>
            YOU
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[12px] font-medium text-white leading-snug line-clamp-2 mb-0.5">{title}</h3>
        <p className="text-[10px] yv-muted">{channel}</p>
        <p className="text-[10px]" style={{ color: 'var(--yv-text-4)' }}>{fmtViews(views, lang)}</p>
      </div>
    </div>
  );
}

export default function ThumbnailPreviewPage() {
  const { data: session, status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [keyword, setKeyword] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('search');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [competitors, setCompetitors] = useState<CompetitorThumb[]>([]);
  const [ctrAnalysis, setCtrAnalysis] = useState<CtrAnalysis | null>(null);
  const [insertPosition, setInsertPosition] = useState(2);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setThumbnailPreview(dataUrl);
      setThumbnailUrl('');
    };
    reader.readAsDataURL(file);
  }

  function handleUrlInput(url: string) {
    setThumbnailUrl(url);
    if (url.match(/^https?:\/\/.+\.(jpg|jpeg|png|webp)/i) || url.includes('ytimg.com') || url.includes('i.ytimg')) {
      setThumbnailPreview(url);
    }
  }

  async function analyze() {
    if (!keyword.trim()) return;
    setLoading(true);
    setError('');
    setCtrAnalysis(null);

    try {
      const thumbForAnalysis = thumbnailUrl || (thumbnailPreview?.startsWith('http') ? thumbnailPreview : null);

      const res = await fetch('/api/youtube/thumbnail-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          thumbnailUrl: thumbForAnalysis,
          lang,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'pro_required') setError(t('Plan Pro requerido.', 'Pro plan required.'));
        else setError(data.error || 'Error');
        return;
      }

      setCompetitors(data.competitors || []);
      setCtrAnalysis(data.ctrAnalysis || null);
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">Thumbnail Preview</h1>
          <p className="mb-6 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesión para usar el previsualizador.', 'Sign in to use the previewer.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  // Build the feed items: insert user's thumbnail among competitors
  const userThumb = thumbnailPreview;
  const feedItems = competitors.map(c => ({ ...c, isUser: false }));
  if (userThumb && feedItems.length > 0) {
    const pos = Math.min(insertPosition, feedItems.length);
    feedItems.splice(pos, 0, {
      videoId: 'user',
      title: t('Tu vídeo — ¿destaca?', 'Your video — does it stand out?'),
      channelName: t('Tu canal', 'Your channel'),
      thumbnail: userThumb,
      views: 0,
      publishedAt: new Date().toISOString(),
      isUser: true,
    });
  }

  const VIEW_MODES: { key: ViewMode; label: string; icon: ReactNode }[] = [
    { key: 'search', label: t('Búsqueda', 'Search'), icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> },
    { key: 'home', label: 'Home', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> },
    { key: 'suggested', label: t('Sugeridos', 'Suggested'), icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 8 6 4-6 4z"/></svg> },
  ];

  return (
    <DashboardShell>
      {/* Header */}
      <div className="border-b border-white/10" style={{ background: 'var(--yv-bg-1)' }}>
        <div className="yv-page yv-page--wide">
          <header className="yv-page-header">
            <div className="yv-page-header__left">
              <span className="yv-page-header__eyebrow">THUMBNAIL PREVIEW</span>
              <h1 className="yv-page-header__title">
                {t('¿Tu thumbnail destaca?', 'Does your thumbnail stand out?')}
              </h1>
              <p className="yv-page-header__desc" style={{ fontSize: 'var(--yv-text-xs)' }}>
                {t(
                  'Visualiza cómo se ve tu thumbnail junto a competidores reales en YouTube.',
                  'See how your thumbnail looks next to real competitors on YouTube.'
                )}
              </p>
            </div>
          </header>
        </div>
      </div>

      <div className="yv-page yv-page--wide">

        {/* Controls */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Thumbnail input */}
          <div className="yv-card p-5">
            <h3 className="font-display font-bold text-sm text-white mb-3">{t('Tu thumbnail', 'Your thumbnail')}</h3>
            <div className="space-y-3">
              {/* Upload */}
              <div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed font-mono-jb text-[11px] tracking-wider transition hover:border-white/30"
                  style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.02)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  {t('Subir imagen', 'Upload image')}
                </button>
              </div>
              {/* Or URL */}
              <div className="flex items-center gap-2 text-[10px] font-mono-jb" style={{ color: 'var(--yv-text-4)' }}>
                <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
                {t('o pega URL', 'or paste URL')}
                <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
              </div>
              <input
                type="text"
                value={thumbnailUrl}
                onChange={e => handleUrlInput(e.target.value)}
                placeholder="https://i.ytimg.com/vi/..."
                className="yv-input w-full text-xs"
              />
              {/* Preview */}
              {thumbnailPreview && (
                <div className="relative aspect-video rounded-lg overflow-hidden" style={{ border: '2px solid var(--yv-brand)' }}>
                  <img src={thumbnailPreview} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setThumbnailPreview(null); setThumbnailUrl(''); }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                    style={{ background: 'rgba(0,0,0,0.7)' }}
                  >
                    X
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Keyword + action */}
          <div className="yv-card p-5">
            <h3 className="font-display font-bold text-sm text-white mb-3">{t('Keyword objetivo', 'Target keyword')}</h3>
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && analyze()}
              placeholder={t('Ej: cómo editar vídeos', 'Eg: how to edit videos')}
              className="yv-input w-full text-sm mb-4"
            />
            <button
              onClick={analyze}
              disabled={loading || !keyword.trim()}
              className="btn-offset w-full px-6 py-3 text-sm font-mono-jb tracking-wider"
              style={{ borderRadius: '10px' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" />
                  </svg>
                  {t('Analizando...', 'Analyzing...')}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                  </svg>
                  {t('Comparar con competidores', 'Compare with competitors')}
                </span>
              )}
            </button>

            {!thumbnailPreview && (
              <p className="text-[10px] font-mono-jb mt-3 text-center" style={{ color: 'var(--yv-text-4)' }}>
                {t('Puedes analizar sin thumbnail — verás solo los competidores', 'You can analyze without a thumbnail — you\'ll only see competitors')}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="yv-card p-4 mb-6" style={{ borderColor: 'rgba(232,77,91,0.3)' }}>
            <p className="text-sm" style={{ color: 'var(--yv-brand)' }}>{error}</p>
          </div>
        )}

        {/* Results */}
        {competitors.length > 0 && (
          <div className="space-y-6 animate-in fade-in duration-500">

            {/* View mode tabs + position slider */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)' }}>
                {VIEW_MODES.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setViewMode(m.key)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono-jb text-[11px] tracking-wider transition-all"
                    style={{
                      background: viewMode === m.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: viewMode === m.key ? '#fff' : 'var(--text-dim)',
                      border: viewMode === m.key ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                    }}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>

              {userThumb && (
                <div className="flex items-center gap-3">
                  <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-4)' }}>{t('Posición:', 'Position:')}</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.min(7, competitors.length)}
                    value={insertPosition}
                    onChange={e => setInsertPosition(Number(e.target.value))}
                    className="w-24 accent-red-600"
                  />
                  <span className="font-mono-jb text-[11px]" style={{ color: 'var(--yv-text-2)' }}>#{insertPosition + 1}</span>
                </div>
              )}
            </div>

            {/* YouTube simulation */}
            <div className="yv-card p-5 overflow-hidden" style={{ background: '#0f0f0f' }}>
              {/* Fake YouTube search bar */}
              <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <span className="text-sm" style={{ color: 'var(--yv-text-2)' }}>{keyword}</span>
              </div>

              {/* Search view */}
              {viewMode === 'search' && (
                <div className="space-y-1 max-w-2xl">
                  {feedItems.map(item => (
                    <YTSearchResult
                      key={item.videoId}
                      thumb={item.thumbnail}
                      title={item.title}
                      channel={item.channelName}
                      views={item.views}
                      date={item.publishedAt}
                      isUser={'isUser' in item && item.isUser}
                      lang={lang}
                    />
                  ))}
                </div>
              )}

              {/* Home view */}
              {viewMode === 'home' && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {feedItems.map(item => (
                    <YTHomeCard
                      key={item.videoId}
                      thumb={item.thumbnail}
                      title={item.title}
                      channel={item.channelName}
                      views={item.views}
                      date={item.publishedAt}
                      isUser={'isUser' in item && item.isUser}
                      lang={lang}
                    />
                  ))}
                </div>
              )}

              {/* Suggested view */}
              {viewMode === 'suggested' && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  <div>
                    {/* Fake main video */}
                    <div className="aspect-video rounded-xl mb-4 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="text-center">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 8 6 4-6 4z"/></svg>
                        <p className="text-xs font-mono-jb mt-2" style={{ color: 'var(--yv-text-4)' }}>{t('Vídeo principal', 'Main video')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="font-mono-jb text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--yv-text-4)' }}>{t('Sugeridos', 'Up next')}</p>
                    {feedItems.map(item => (
                      <YTSuggestedItem
                        key={item.videoId}
                        thumb={item.thumbnail}
                        title={item.title}
                        channel={item.channelName}
                        views={item.views}
                        date={item.publishedAt}
                        isUser={'isUser' in item && item.isUser}
                        lang={lang}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* CTR Analysis */}
            {ctrAnalysis && (
              <div className="yv-card p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3 className="font-display font-bold text-lg text-white flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                      </svg>
                      {t('Análisis CTR', 'CTR Analysis')}
                    </h3>
                    <p className="yv-muted text-xs font-mono-jb mt-1">{ctrAnalysis.summary}</p>
                  </div>
                  <div className="text-center flex-shrink-0 ml-4">
                    <div className="font-display font-bold text-4xl" style={{ color: scoreColor(ctrAnalysis.score) }}>
                      {ctrAnalysis.score}
                    </div>
                    <div className="font-mono-jb text-[10px] yv-muted tracking-wider">CTR SCORE</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {ctrAnalysis.breakdown.map((b, i) => (
                    <div key={i} className="rounded-lg border p-3" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono-jb text-[10px] yv-muted truncate">{b.category}</span>
                        <span className="font-display font-bold text-sm" style={{ color: scoreColor(b.score) }}>{b.score}</span>
                      </div>
                      {/* Score bar */}
                      <div className="h-1.5 rounded-full mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${b.score}%`, background: scoreColor(b.score) }}
                        />
                      </div>
                      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>{b.tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No thumbnail notice */}
            {!thumbnailPreview && (
              <div className="yv-card p-5 text-center" style={{ borderColor: 'rgba(255,232,0,0.2)', background: 'rgba(255,232,0,0.03)' }}>
                <p className="text-sm" style={{ color: 'var(--yv-text-2)' }}>
                  {t(
                    'Sube tu thumbnail para verlo insertado entre los competidores y obtener análisis CTR con IA.',
                    'Upload your thumbnail to see it inserted among competitors and get AI CTR analysis.'
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {competitors.length === 0 && !loading && !error && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(232,77,91,0.1)', border: '1px solid rgba(232,77,91,0.2)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--yv-brand)" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
            <p className="font-display font-bold text-xl text-white mb-2">
              {t('Compara tu thumbnail', 'Compare your thumbnail')}
            </p>
            <p className="text-sm font-mono-jb max-w-md mx-auto" style={{ color: 'var(--yv-text-4)' }}>
              {t(
                'Sube tu thumbnail, escribe la keyword objetivo, y visualiza cómo se ve junto a los competidores reales en YouTube.',
                'Upload your thumbnail, enter the target keyword, and see how it looks next to real competitors on YouTube.'
              )}
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
