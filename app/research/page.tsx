'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

type Lang = 'es' | 'en';

interface VideoResult {
  videoId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
  likes: number;
}

interface ResearchResult {
  keyword: string;
  totalResults: number;
  competition: 'low' | 'medium' | 'high';
  competitionScore: number;
  opportunityScore: number;
  avgViews: number;
  topVideos: VideoResult[];
  relatedKeywords: string[];
}

const COMPETITION_CONFIG = {
  low:    { label: { es: 'Baja',   en: 'Low'    }, color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)'  },
  medium: { label: { es: 'Media',  en: 'Medium' }, color: '#FFE800', bg: 'rgba(255,232,0,0.10)',  border: 'rgba(255,232,0,0.3)'  },
  high:   { label: { es: 'Alta',   en: 'High'   }, color: '#e84d5b', bg: 'rgba(232,77,91,0.12)',  border: 'rgba(232,77,91,0.3)'  },
};

function formatViews(n: number, lang: Lang): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + (lang === 'en' ? 'M' : 'M');
  if (n >= 1_000)     return (n / 1_000).toFixed(1)     + (lang === 'en' ? 'K' : 'K');
  return n.toString();
}

function formatDate(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'short' });
  } catch { return ''; }
}

function ScoreRing({ score, color, label }: { score: number; color: string; label: string }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
          <circle
            cx="48" cy="48" r={r} fill="none"
            stroke={color} strokeWidth="7"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display font-bold text-2xl text-white">
          {score}
        </span>
      </div>
      <span className="font-mono-jb text-[10px] tracking-[0.2em] uppercase text-zinc-500">{label}</span>
    </div>
  );
}

function ResearchPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lang, setLang] = useState<Lang>('es');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noApiKey, setNoApiKey] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as Lang | null;
    if (stored === 'en' || stored === 'es') setLang(stored);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q && status === 'authenticated') {
      setKeyword(q);
      handleSearch(q);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const handleSearch = async (kw?: string) => {
    const q = (kw ?? keyword).trim();
    if (!q) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setNoApiKey(false);

    try {
      const res = await fetch('/api/research/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'no_api_key') { setNoApiKey(true); return; }
        setError(data.error || t('Error desconocido', 'Unknown error'));
        return;
      }
      setResult(data);
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') return null;

  const comp = result ? COMPETITION_CONFIG[result.competition] : null;

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      {/* Header */}
      <header className="border-b sticky top-0 z-40" style={{ borderColor: 'var(--line)', background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/dashboard" className="flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
                <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
              </svg>
              <span className="font-display font-bold text-[14px] text-white">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
            </a>
            <nav className="hidden md:flex items-center gap-5">
              <a href="/generate" className="font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition">{t('Generar', 'Generate')}</a>
              <a href="/dashboard" className="font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition">{t('Dashboard', 'Dashboard')}</a>
              <span className="font-mono-jb text-[11px] tracking-wider text-white border-b" style={{ borderColor: 'var(--red)' }}>
                {t('Investigar', 'Research')}
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono-jb text-[10px] tracking-[0.2em] uppercase px-2 py-1 rounded" style={{ background: 'rgba(232,77,91,0.15)', color: 'var(--red)', border: '1px solid rgba(232,77,91,0.3)' }}>
              BETA
            </span>
            <span className="font-mono-jb text-xs text-zinc-500">{session?.user?.name || session?.user?.email}</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12">

        {/* Page title */}
        <div className="mb-10">
          <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
            {t('INVESTIGACIÓN DE PALABRAS CLAVE', 'KEYWORD RESEARCH')}
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl text-white leading-tight">
            {t('Encuentra keywords', 'Find keywords')}<br />
            <span style={{ color: 'var(--red)' }}>{t('que posicionan.', 'that rank.')}</span>
          </h1>
          <p className="text-zinc-500 mt-3 text-sm font-mono-jb">
            {t(
              'Datos reales de YouTube: competencia, vistas medias y los 5 vídeos más vistos para cualquier keyword.',
              'Real YouTube data: competition level, average views, and the top 5 ranking videos for any keyword.'
            )}
          </p>
        </div>

        {/* Search bar */}
        <div className="flex gap-3 mb-10 max-w-2xl">
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('Ej: cómo ganar dinero en YouTube', 'Eg: how to grow a YouTube channel')}
            className="soft-field flex-1 text-base"
            style={{ borderRadius: '10px' }}
          />
          <button
            onClick={() => handleSearch()}
            disabled={loading || !keyword.trim()}
            className="btn-offset px-6 py-3 text-sm font-mono-jb tracking-wider"
            style={{ borderRadius: '10px', minWidth: 120 }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
                {t('Buscando', 'Searching')}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                {t('Analizar', 'Analyze')}
              </span>
            )}
          </button>
        </div>

        {/* No API key banner */}
        {noApiKey && (
          <div className="soft-card p-6 max-w-2xl mb-8" style={{ borderColor: 'rgba(255,232,0,0.25)', background: 'rgba(255,232,0,0.04)' }}>
            <div className="flex gap-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFE800" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <p className="font-display font-bold text-white mb-1">{t('API key de YouTube no configurada', 'YouTube API key not configured')}</p>
                <p className="text-zinc-400 text-sm mb-3">
                  {t(
                    'Para usar esta función necesitas una clave de la YouTube Data API v3. Es gratuita y tarda ~10 minutos en configurarse.',
                    'To use this feature you need a YouTube Data API v3 key. It\'s free and takes ~10 minutes to set up.'
                  )}
                </p>
                <div className="font-mono-jb text-xs text-zinc-500 space-y-1">
                  <p>1. {t('Accede a', 'Go to')} console.cloud.google.com</p>
                  <p>2. {t('Activa "YouTube Data API v3"', 'Enable "YouTube Data API v3"')}</p>
                  <p>3. {t('Crea una API Key en Credentials', 'Create an API Key under Credentials')}</p>
                  <p>4. {t('Añade', 'Add')} <code className="px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }}>YOUTUBE_API_KEY</code> {t('a las variables de entorno de Vercel', 'to your Vercel environment variables')}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="soft-card p-4 max-w-2xl mb-8" style={{ borderColor: 'rgba(232,77,91,0.3)' }}>
            <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6 animate-in fade-in duration-500">

            {/* Keyword header */}
            <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <span className="font-display font-bold text-xl text-white">"{result.keyword}"</span>
              <span className="font-mono-jb text-xs text-zinc-600">
                {result.totalResults.toLocaleString(lang === 'en' ? 'en-US' : 'es-ES')} {t('resultados', 'results')}
              </span>
            </div>

            {/* Score cards row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Competition */}
              <div className="soft-card p-6 flex flex-col items-center gap-4" style={{ borderColor: comp?.border }}>
                <ScoreRing
                  score={result.competitionScore}
                  color={comp?.color || '#e84d5b'}
                  label={t('Competencia', 'Competition')}
                />
                <div className="text-center">
                  <div className="font-display font-bold text-lg" style={{ color: comp?.color }}>
                    {comp?.label[lang]}
                  </div>
                  <p className="font-mono-jb text-[10px] tracking-wider text-zinc-600 mt-1">
                    {t('NIVEL DE COMPETENCIA', 'COMPETITION LEVEL')}
                  </p>
                </div>
              </div>

              {/* Opportunity */}
              <div className="soft-card p-6 flex flex-col items-center gap-4" style={{ borderColor: 'rgba(34,197,94,0.25)' }}>
                <ScoreRing
                  score={result.opportunityScore}
                  color="#22c55e"
                  label={t('Oportunidad', 'Opportunity')}
                />
                <div className="text-center">
                  <div className="font-display font-bold text-lg text-white">
                    {result.opportunityScore >= 70
                      ? t('Alta oportunidad', 'High opportunity')
                      : result.opportunityScore >= 40
                      ? t('Oportunidad media', 'Medium opportunity')
                      : t('Nicho saturado', 'Saturated niche')}
                  </div>
                  <p className="font-mono-jb text-[10px] tracking-wider text-zinc-600 mt-1">
                    {t('POTENCIAL DE POSICIONAMIENTO', 'RANKING POTENTIAL')}
                  </p>
                </div>
              </div>

              {/* Avg views */}
              <div className="soft-card p-6 flex flex-col justify-center items-center gap-3">
                <div className="font-display font-bold text-5xl text-white">
                  {formatViews(result.avgViews, lang)}
                </div>
                <div className="text-center">
                  <p className="font-mono-jb text-[10px] tracking-wider text-zinc-600">
                    {t('VISTAS MEDIAS (TOP 5)', 'AVG VIEWS (TOP 5)')}
                  </p>
                  <p className="text-zinc-500 text-xs mt-1">
                    {result.avgViews > 500_000
                      ? t('Keyword con mucha demanda', 'High demand keyword')
                      : result.avgViews > 50_000
                      ? t('Demanda moderada', 'Moderate demand')
                      : t('Nicho emergente', 'Emerging niche')}
                  </p>
                </div>
              </div>
            </div>

            {/* Top 5 videos */}
            {result.topVideos.length > 0 && (
              <div className="soft-card overflow-hidden">
                <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
                  <p className="font-mono-jb text-[10px] tracking-[0.25em] uppercase text-zinc-500">
                    {t('TOP 5 VÍDEOS PARA ESTA KEYWORD', 'TOP 5 VIDEOS FOR THIS KEYWORD')}
                  </p>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
                  {result.topVideos.map((v, i) => (
                    <a
                      key={v.videoId}
                      href={`https://youtube.com/watch?v=${v.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition group"
                    >
                      {/* Rank */}
                      <span className="font-display font-bold text-2xl w-8 flex-shrink-0" style={{ color: i === 0 ? 'var(--red)' : 'var(--text-faint)' }}>
                        {i + 1}
                      </span>
                      {/* Thumbnail */}
                      {v.thumbnail && (
                        <img src={v.thumbnail} alt="" className="w-20 h-14 object-cover rounded flex-shrink-0" style={{ border: '1px solid var(--line)' }} />
                      )}
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium leading-snug line-clamp-2 group-hover:text-zinc-200 transition">
                          {v.title}
                        </p>
                        <p className="font-mono-jb text-[10px] text-zinc-600 mt-1">{v.channelName} · {formatDate(v.publishedAt, lang)}</p>
                      </div>
                      {/* Stats */}
                      <div className="flex-shrink-0 text-right hidden sm:block">
                        <p className="font-display font-bold text-lg text-white">{formatViews(v.views, lang)}</p>
                        <p className="font-mono-jb text-[10px] text-zinc-600">{t('vistas', 'views')}</p>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-700 group-hover:text-zinc-400 transition flex-shrink-0">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Related keywords */}
            {result.relatedKeywords.length > 0 && (
              <div className="soft-card p-6">
                <p className="font-mono-jb text-[10px] tracking-[0.25em] uppercase text-zinc-500 mb-4">
                  {t('KEYWORDS RELACIONADAS', 'RELATED KEYWORDS')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.relatedKeywords.map((kw, i) => (
                    <button
                      key={i}
                      onClick={() => { setKeyword(kw); handleSearch(kw); }}
                      className="font-mono-jb text-xs px-3 py-1.5 rounded-full border hover:border-white/30 hover:text-white transition"
                      style={{ borderColor: 'var(--line)', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.03)' }}
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Generate CTA */}
            <div className="soft-card p-6 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: 'rgba(232,77,91,0.2)', background: 'rgba(232,77,91,0.03)' }}>
              <div>
                <p className="font-display font-bold text-white text-lg">
                  {t('¿Listo para crear contenido con esta keyword?', 'Ready to create content with this keyword?')}
                </p>
                <p className="text-zinc-500 text-sm mt-1">
                  {t('Genera un título viral, descripción SEO o script completo en segundos.', 'Generate a viral title, SEO description or full script in seconds.')}
                </p>
              </div>
              <a
                href={`/generate?prefill=${encodeURIComponent(result.keyword)}`}
                className="btn-offset px-6 py-3 text-sm font-mono-jb tracking-wider flex-shrink-0"
                style={{ borderRadius: '10px' }}
              >
                {t('Generar contenido →', 'Generate content →')}
              </a>
            </div>

          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !noApiKey && !error && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(232,77,91,0.1)', border: '1px solid rgba(232,77,91,0.2)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <p className="font-display font-bold text-xl text-white mb-2">
              {t('Escribe una keyword para analizar', 'Enter a keyword to analyze')}
            </p>
            <p className="text-zinc-600 text-sm font-mono-jb">
              {t('Ejemplos: "recetas veganas fáciles", "aprender inglés", "ejercicio en casa"', '"vegan recipes", "learn english", "home workout"')}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

export default function ResearchPage() {
  return (
    <Suspense>
      <ResearchPageInner />
    </Suspense>
  );
}
