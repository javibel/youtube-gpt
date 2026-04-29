'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getLangClient } from '@/lib/get-lang-client';

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

  useEffect(() => { setLang(getLangClient()); }, []);

  // No redirect — show public landing if unauthenticated

  const t = (es: string, en: string) => lang === 'en' ? en : es;

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
        if (data.error === 'pro_required') {
          setError(t('Esta función es exclusiva del Plan Pro. Actualiza tu cuenta desde el dashboard.', 'This feature is exclusive to the Pro Plan. Upgrade your account from the dashboard.'));
        } else if (data.error === 'channel_not_found') {
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

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <header className="border-b" style={{ borderColor: 'var(--line)', background: 'rgba(10,10,10,0.92)' }}>
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2.5">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
                <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
              </svg>
              <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
            </a>
            <div className="flex items-center gap-3">
              <a href="/login" className="font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition">{t('Iniciar sesión', 'Sign in')}</a>
              <a href="/signup" className="btn-offset px-4 py-1.5 text-[11px] font-display">{t('Crear cuenta gratis', 'Sign up free')}</a>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-6" style={{ color: 'var(--red)' }}>{t('ANÁLISIS DE COMPETIDORES', 'COMPETITOR ANALYSIS')}</p>
          <h1 className="font-display font-bold text-4xl md:text-5xl mb-6 leading-tight">
            {t('Analiza a tu competencia en', 'Analyze your competition on')}
            <span style={{ color: 'var(--red)' }}> YouTube</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto mb-12 leading-relaxed">
            {t(
              'Descubre que hace crecer a otros canales. Analiza sus videos mas exitosos, frecuencia de subida, keywords principales y estrategias de crecimiento.',
              'Discover what makes other channels grow. Analyze their most successful videos, upload frequency, main keywords and growth strategies.'
            )}
          </p>

          <div className="grid md:grid-cols-3 gap-5 mb-14 text-left">
            {[
              { icon: '📈', title: t('Métricas del canal', 'Channel metrics'), desc: t('Suscriptores, vistas totales, frecuencia de publicación y país', 'Subscribers, total views, upload frequency and country') },
              { icon: '🏆', title: t('Top videos', 'Top videos'), desc: t('Los videos con mas vistas, likes y engagement de cualquier canal', 'The most viewed, liked and engaging videos from any channel') },
              { icon: '🔑', title: t('Keywords y estrategia', 'Keywords & strategy'), desc: t('Las keywords que usa tu competencia para posicionar sus videos', 'The keywords your competition uses to rank their videos') },
            ].map(f => (
              <div key={f.title} className="soft-card p-5">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="font-display font-bold text-sm mb-1">{f.title}</h3>
                <p className="text-zinc-500 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Mock URL input */}
          <div className="max-w-xl mx-auto mb-8">
            <div className="soft-card p-1.5 flex items-center gap-2" style={{ opacity: 0.6 }}>
              <div className="flex-1 px-4 py-3 text-zinc-600 text-sm text-left">https://www.youtube.com/@MrBeast</div>
              <div className="px-5 py-3 rounded-lg font-display font-bold text-sm" style={{ background: 'var(--red)', color: '#fff' }}>{t('Analizar', 'Analyze')}</div>
            </div>
          </div>

          <a href="/signup" className="btn-offset inline-flex px-8 py-3 text-sm font-display">
            {t('Empieza gratis →', 'Start free →')}
          </a>
          <p className="text-zinc-600 text-xs mt-4">{t('Sin tarjeta de crédito. 10 generaciones/mes gratis.', 'No credit card. 10 generations/month free.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      {/* Header */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/dashboard" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
              <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
            </svg>
            <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </a>
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              {t('Panel', 'Dashboard')}
            </a>
            <a href="/generate" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
              {t('Generar', 'Generate')}
            </a>
            <a href="/research" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              {t('Investigar', 'Research')}
            </a>
            <a href="/profile" title={t('Mi perfil', 'My profile')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-white/30 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            </a>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="font-mono-jb text-[11px] text-zinc-500 hover:text-zinc-300 transition">{t('Salir', 'Sign out')}</button>
          </div>
        </div>
      </nav>

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
