'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface GrowthData {
  subs7d: number;
  subs30d: number;
  views7d: number;
  views30d: number;
}

interface SnapshotPoint {
  subscribers: number;
  totalViews: number;
  videoCount: number;
  recordedAt: string;
}

interface Competitor {
  id: string;
  channelId: string;
  channelName: string;
  channelThumb: string | null;
  subscribers: number;
  totalViews: number;
  videoCount: number;
  addedAt: string;
  snapshots: SnapshotPoint[];
  growth: GrowthData | null;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function GrowthBadge({ value, suffix }: { value: number; suffix: string }) {
  if (value === 0) return null;
  return (
    <span className="font-mono-jb text-[9px]" style={{ color: value > 0 ? '#22c55e' : '#e84d5b' }}>
      {value > 0 ? '+' : ''}{fmtNum(value)} <span className="text-zinc-600">{suffix}</span>
    </span>
  );
}

function Sparkline({ points, color = '#9B2020' }: { points: number[]; color?: string }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 120;
  const h = 24;
  const pts = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function CompetitorTrackingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('es');
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/youtube/competitors')
      .then(r => r.json())
      .then(d => { if (d.competitors) setCompetitors(d.competitors); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  async function addCompetitor() {
    if (!urlInput.trim()) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/youtube/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msgs: Record<string, string> = {
          pro_required: t('Necesitas el plan Pro.', 'Pro plan required.'),
          limit_reached: t('Máximo 10 competidores.', 'Maximum 10 competitors.'),
          invalid_url: t('URL no válida. Usa youtube.com/@canal o youtube.com/channel/UCxxx', 'Invalid URL. Use youtube.com/@channel or youtube.com/channel/UCxxx'),
          channel_not_found: t('Canal no encontrado.', 'Channel not found.'),
          already_tracked: t('Ya estás siguiendo este canal.', 'Already tracking this channel.'),
        };
        setError(msgs[data.error] || data.error);
        return;
      }
      setCompetitors(prev => [...prev, { ...data.competitor, snapshots: [], growth: null, addedAt: new Date().toISOString() }]);
      setUrlInput('');
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setAdding(false);
    }
  }

  async function removeCompetitor(id: string) {
    setDeleting(id);
    await fetch('/api/youtube/competitors', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    setCompetitors(prev => prev.filter(c => c.id !== id));
    setDeleting(null);
  }

  if (status === 'loading' || loading) {
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
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Tracking', 'Tracking')}</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para continuar.', 'Sign in to continue.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      {/* Nav */}
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
            <a href="/competitors" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              {t('Análisis', 'Analysis')}
            </a>
            <a href="/profile" title={t('Mi perfil', 'My profile')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-white/30 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            </a>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="font-mono-jb text-[11px] text-zinc-500 hover:text-zinc-300 transition">{t('Salir', 'Sign out')}</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-8">
          <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
            {t('SEGUIMIENTO DE COMPETIDORES', 'COMPETITOR TRACKING')}
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl text-white leading-tight">
            {t('Tracking', 'Tracking')}<br />
            <span style={{ color: 'var(--red)' }}>{t('de competidores.', 'competitors.')}</span>
          </h1>
          <p className="text-zinc-500 mt-3 text-sm font-mono-jb max-w-xl">
            {t(
              'Sigue hasta 10 canales competidores. Monitorizamos suscriptores, vistas y vídeos cada 6 horas.',
              'Track up to 10 competitor channels. We monitor subscribers, views and videos every 6 hours.'
            )}
          </p>
        </div>

        {/* Add competitor */}
        <div className="mb-8 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCompetitor()}
            placeholder={t('youtube.com/@canal o ID del canal', 'youtube.com/@channel or channel ID')}
            className="flex-1 px-4 py-3 rounded-xl border border-white/10 font-mono-jb text-sm text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none transition"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          />
          <button
            onClick={addCompetitor}
            disabled={adding || !urlInput.trim()}
            className="btn-offset px-6 py-3 text-sm font-display disabled:opacity-50 flex items-center gap-2"
          >
            {adding ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            )}
            {t('Añadir', 'Add')}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg border border-red-500/30" style={{ background: 'rgba(232,77,91,0.08)' }}>
            <p className="text-sm text-red-400 font-mono-jb">{error}</p>
          </div>
        )}

        {/* Competitor list */}
        {competitors.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(155,32,32,0.1)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3 className="font-display font-bold text-xl text-white mb-2">
              {t('Sin competidores', 'No competitors yet')}
            </h3>
            <p className="text-zinc-500 font-mono-jb text-sm max-w-md mx-auto">
              {t(
                'Añade la URL de un canal de YouTube para empezar a seguir su crecimiento.',
                'Add a YouTube channel URL to start tracking their growth.'
              )}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {competitors.map(comp => (
            <div key={comp.id} className="rounded-xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-start gap-4">
                {/* Avatar */}
                {comp.channelThumb ? (
                  <img src={comp.channelThumb} alt="" className="w-12 h-12 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-lg" style={{ background: 'var(--red)' }}>
                    {comp.channelName[0]?.toUpperCase()}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <a href={`https://youtube.com/channel/${comp.channelId}`} target="_blank" rel="noopener noreferrer"
                        className="font-display font-bold text-white hover:underline">
                        {comp.channelName}
                      </a>
                      <p className="font-mono-jb text-[10px] text-zinc-600">
                        {t('Seguido desde', 'Tracked since')} {new Date(comp.addedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={() => removeCompetitor(comp.id)}
                      disabled={deleting === comp.id}
                      className="text-zinc-700 hover:text-red-400 transition p-1"
                      title={t('Dejar de seguir', 'Untrack')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <p className="font-display font-bold text-white">{fmtNum(comp.subscribers)}</p>
                      <p className="font-mono-jb text-[9px] text-zinc-600 uppercase">{t('Subs', 'Subs')}</p>
                      {comp.growth && <GrowthBadge value={comp.growth.subs30d} suffix="30d" />}
                    </div>
                    <div>
                      <p className="font-display font-bold text-white">{fmtNum(comp.totalViews)}</p>
                      <p className="font-mono-jb text-[9px] text-zinc-600 uppercase">{t('Vistas', 'Views')}</p>
                      {comp.growth && <GrowthBadge value={comp.growth.views30d} suffix="30d" />}
                    </div>
                    <div>
                      <p className="font-display font-bold text-white">{fmtNum(comp.videoCount)}</p>
                      <p className="font-mono-jb text-[9px] text-zinc-600 uppercase">{t('Vídeos', 'Videos')}</p>
                    </div>
                  </div>

                  {/* Sparkline */}
                  {comp.snapshots.length > 2 && (
                    <div className="flex items-center gap-3">
                      <span className="font-mono-jb text-[9px] text-zinc-600">{t('Subs', 'Subs')}</span>
                      <Sparkline points={comp.snapshots.map(s => s.subscribers)} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Link to one-off analysis */}
        {competitors.length > 0 && (
          <div className="mt-8 text-center">
            <a href="/competitors" className="font-mono-jb text-[11px] text-zinc-600 hover:text-zinc-400 transition">
              {t('Ir al análisis detallado de competidores', 'Go to detailed competitor analysis')} →
            </a>
          </div>
        )}

        <p className="mt-6 font-mono-jb text-[11px] text-zinc-700">
          {competitors.length}/10 {t('competidores', 'competitors')}
        </p>
      </div>
    </div>
  );
}
