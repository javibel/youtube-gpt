'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

type Lang = 'es' | 'en';

interface ChannelInfo {
  id: string; name: string; description: string; thumbnail: string;
  country: string | null; subscribers: number; totalViews: number; videoCount: number;
}
interface VideoItem {
  videoId: string; title: string; thumbnail: string;
  publishedAt: string; views: number; likes: number;
}
interface CompetitorResult {
  channel: ChannelInfo;
  topVideos: VideoItem[];
  keywords: string[];
  uploadFrequency: string;
  avgViews: number;
}

function fmtNum(n: number, lang: Lang): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function fmtDate(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'short' });
  } catch { return ''; }
}

const EXAMPLE_URLS = [
  'https://www.youtube.com/@MrBeast',
  'https://www.youtube.com/@veritasium',
  'https://www.youtube.com/@kurzgesagt',
];

export default function CompetitorsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('es');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CompetitorResult | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const t = (es: string, en: string) => lang === 'es' ? es : en;

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/youtube/competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), lang }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        if (data.error === 'channel_not_found') {
          setError(t('No se encontró el canal. Comprueba la URL.', 'Channel not found. Check the URL.'));
        } else {
          setError(t('Error al analizar el canal. Inténtalo de nuevo.', 'Error analysing channel. Please try again.'));
        }
        return;
      }
      setResult(data);
    } catch {
      setError(t('Error de conexión.', 'Connection error.'));
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') return null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--line)', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}
        className="sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <a href="/dashboard" className="flex items-center gap-2.5">
            <svg width="22" height="22" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="16" fill="#e84d5b"/>
              <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
            </svg>
            <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </a>
          <div className="flex items-center gap-3">
            <a href="/research" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              {t('Investigar', 'Research')}
            </a>
            <a href="/generate" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              {t('Generar', 'Generate')}
            </a>
            <button onClick={() => setLang(l => l === 'es' ? 'en' : 'es')}
              className="font-mono-jb text-[11px] tracking-wider px-2.5 py-1.5 rounded border border-white/10 text-zinc-500 hover:text-white hover:border-white/25 transition">
              {lang === 'es' ? 'EN' : 'ES'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Title */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono-jb text-[11px] tracking-[0.15em] uppercase" style={{ color: 'var(--red)' }}>
              {t('Análisis', 'Analysis')}
            </span>
          </div>
          <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tight">
            {t('Analiza a tu', 'Analyse your')} <span style={{ color: 'var(--red)' }}>{t('competencia', 'competition')}</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-2 font-mono-jb">
            {t('Introduce la URL de cualquier canal de YouTube para ver sus métricas, vídeos top y frecuencia de publicación.',
               'Enter any YouTube channel URL to see their metrics, top videos, and upload frequency.')}
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleAnalyze} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder={t('https://www.youtube.com/@canal', 'https://www.youtube.com/@channel')}
              className="soft-field flex-1 py-3 px-4 text-sm font-mono-jb"
              style={{ borderRadius: '10px' }}
            />
            <button type="submit" disabled={loading || !url.trim()}
              className="btn-offset px-6 py-3 text-[12px] font-mono-jb tracking-wider disabled:opacity-50 flex items-center gap-2 whitespace-nowrap">
              {loading ? (
                <>
                  <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  {t('Analizando...', 'Analysing...')}
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  {t('Analizar', 'Analyse')}
                </>
              )}
            </button>
          </div>
          {/* Example URLs */}
          <div className="flex flex-wrap gap-2">
            <span className="font-mono-jb text-[10px] text-zinc-600 self-center">{t('Ejemplos:', 'Examples:')}</span>
            {EXAMPLE_URLS.map(u => (
              <button key={u} type="button" onClick={() => setUrl(u)}
                className="font-mono-jb text-[10px] px-2 py-1 rounded border border-white/10 text-zinc-500 hover:text-white hover:border-white/20 transition">
                {u.replace('https://www.youtube.com/', '')}
              </button>
            ))}
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="soft-card p-4 text-sm font-mono-jb" style={{ color: 'var(--red)', borderColor: 'rgba(232,77,91,0.3)' }}>
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6 animate-fade-in">
            {/* Channel card */}
            <div className="soft-card p-6">
              <div className="flex items-start gap-4">
                {result.channel.thumbnail ? (
                  <img src={result.channel.thumbnail} alt="" className="w-16 h-16 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center text-2xl font-bold"
                    style={{ background: 'var(--red)' }}>
                    {result.channel.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display font-bold text-xl text-white">{result.channel.name}</h2>
                    {result.channel.country && (
                      <span className="font-mono-jb text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--zinc-400)' }}>
                        {result.channel.country}
                      </span>
                    )}
                  </div>
                  {result.channel.description && (
                    <p className="text-zinc-500 text-xs mt-1 font-mono-jb line-clamp-2">{result.channel.description}</p>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                {[
                  { label: t('Suscriptores', 'Subscribers'), value: fmtNum(result.channel.subscribers, lang), color: '#e84d5b' },
                  { label: t('Vistas totales', 'Total views'),  value: fmtNum(result.channel.totalViews, lang),   color: '#00E5FF' },
                  { label: t('Vídeos',         'Videos'),       value: fmtNum(result.channel.videoCount, lang),   color: '#FFE800' },
                  { label: t('Media vistas top', 'Avg top views'), value: fmtNum(result.avgViews, lang),          color: '#7CFF00' },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
                    <p className="font-display font-black text-2xl" style={{ color: s.color }}>{s.value}</p>
                    <p className="font-mono-jb text-[10px] text-zinc-600 uppercase mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top videos */}
              <div className="lg:col-span-2 soft-card p-5 space-y-3">
                <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
                  <span style={{ color: 'var(--red)' }}>▶</span>
                  {t('Top vídeos por vistas', 'Top videos by views')}
                </h3>
                <div className="space-y-2">
                  {result.topVideos.map((v, i) => (
                    <a key={v.videoId} href={`https://www.youtube.com/watch?v=${v.videoId}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2.5 rounded-lg group hover:bg-white/5 transition">
                      <span className="font-mono-jb text-[11px] w-4 text-zinc-600 flex-shrink-0">{i + 1}</span>
                      <img src={v.thumbnail} alt="" className="w-16 h-9 rounded object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-zinc-300 truncate group-hover:text-white transition">{v.title}</p>
                        <p className="font-mono-jb text-[10px] text-zinc-600 mt-0.5">{fmtDate(v.publishedAt, lang)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-mono-jb text-[11px] font-bold text-white">{fmtNum(v.views, lang)}</p>
                        <p className="font-mono-jb text-[9px] text-zinc-600">{t('vistas', 'views')}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                {/* Upload frequency */}
                <div className="soft-card p-5">
                  <h3 className="font-display font-bold text-base text-white flex items-center gap-2 mb-3">
                    <span style={{ color: '#FFE800' }}>⏱</span>
                    {t('Frecuencia', 'Frequency')}
                  </h3>
                  <div className="text-center py-4">
                    <p className="font-display font-black text-3xl" style={{ color: '#FFE800' }}>{result.uploadFrequency}</p>
                    <p className="font-mono-jb text-[10px] text-zinc-600 mt-1 uppercase">{t('publicación', 'publishing')}</p>
                  </div>
                </div>

                {/* Keywords */}
                <div className="soft-card p-5">
                  <h3 className="font-display font-bold text-base text-white flex items-center gap-2 mb-3">
                    <span style={{ color: '#00FFA3' }}>#</span>
                    {t('Palabras clave frecuentes', 'Frequent keywords')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {result.keywords.map((kw, i) => (
                      <button key={kw} onClick={() => router.push(`/research?q=${encodeURIComponent(kw)}`)}
                        className="font-mono-jb text-[11px] px-2.5 py-1 rounded-full border transition hover:border-white/30 hover:text-white cursor-pointer"
                        style={{
                          border: '1px solid rgba(0,255,163,0.2)',
                          color: i < 3 ? '#00FFA3' : '#6b7280',
                          background: i < 3 ? 'rgba(0,255,163,0.06)' : 'transparent',
                        }}>
                        {kw}
                      </button>
                    ))}
                  </div>
                  <p className="font-mono-jb text-[10px] text-zinc-600 mt-3">
                    {t('Haz clic en una keyword para investigarla', 'Click a keyword to research it')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
