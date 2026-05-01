'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface TrendVideo { title: string; views: string; channelName: string }

interface TrendAlert {
  id: string;
  title: string;
  description: string;
  category: string;
  relevance: number;
  trendData: { videos: TrendVideo[] } | null;
  read: boolean;
  createdAt: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  tech: '💻', gaming: '🎮', education: '📚', entertainment: '🎬', music: '🎵',
  lifestyle: '🌟', news: '📰', sports: '⚽', science: '🔬', business: '💼',
  food: '🍳', travel: '✈️', general: '📊',
};

function relevanceColor(r: number): string {
  if (r >= 70) return '#22c55e';
  if (r >= 40) return '#eab308';
  return '#6366f1';
}

function timeAgo(dateStr: string, lang: Lang): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return lang === 'en' ? 'Just now' : 'Ahora';
  if (hours < 24) return lang === 'en' ? `${hours}h ago` : `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return lang === 'en' ? `${days}d ago` : `Hace ${days}d`;
}

export default function TrendsPage() {
  const { data: session, status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [alerts, setAlerts] = useState<TrendAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    fetch('/api/trends')
      .then(r => r.json())
      .then(res => {
        if (res.error === 'pro_required') setError(t('Plan Pro requerido.', 'Pro plan required.'));
        else if (res.alerts) setAlerts(res.alerts);
      })
      .catch(() => setError(t('Error de conexión', 'Connection error')))
      .finally(() => setLoading(false));
  }, [status]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Mark as read
    const alert = alerts.find(a => a.id === id);
    if (alert && !alert.read) {
      fetch('/api/trends', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      }).catch(() => {});
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
    }
  }

  async function markAllRead() {
    await fetch('/api/trends', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }

  const unread = alerts.filter(a => !a.read).length;

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
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Tendencias', 'Trends')}</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para ver alertas de tendencias.', 'Sign in to view trend alerts.')}</p>
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
            <a href="/analytics" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
              Analytics
            </a>
            <a href="/calendar" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {t('Calendario', 'Calendar')}
            </a>
            <a href="/profile" title={t('Mi perfil', 'My profile')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-white/30 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </a>
            <button onClick={() => signOut({ callbackUrl: '/' })} title={t('Cerrar sesión', 'Sign out')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-red-500/50 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Header */}
      <div className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--red)' }}>
                {t('ALERTAS DE TENDENCIAS', 'TREND ALERTS')}
              </p>
              <h1 className="font-display font-bold text-3xl text-white">
                {t('Tendencias', 'Trends')}
                {unread > 0 && (
                  <span className="ml-3 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono-jb" style={{ background: 'var(--red)', color: '#fff' }}>
                    {unread}
                  </span>
                )}
              </h1>
              <p className="text-zinc-500 font-mono-jb text-xs mt-1">
                {t('Tendencias de YouTube relevantes para tu canal. Se actualiza cada día.', 'YouTube trends relevant to your channel. Updated daily.')}
              </p>
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} className="font-mono-jb text-[11px] text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
                {t('Marcar todo leído', 'Mark all read')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-3">
        {loading && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {error && <p className="text-red-400 font-mono-jb text-sm text-center py-8">{error}</p>}

        {!loading && !error && alerts.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📊</div>
            <p className="text-zinc-500 font-mono-jb text-sm">
              {t('No hay alertas todavía. Las tendencias se generan diariamente.', 'No alerts yet. Trends are generated daily.')}
            </p>
          </div>
        )}

        {alerts.map(alert => {
          const isExpanded = expanded.has(alert.id);
          const videos = (alert.trendData as { videos: TrendVideo[] } | null)?.videos || [];

          return (
            <div
              key={alert.id}
              className="rounded-lg border transition cursor-pointer"
              style={{
                background: alert.read ? 'rgba(255,255,255,0.02)' : 'rgba(155,32,32,0.06)',
                borderColor: alert.read ? 'rgba(255,255,255,0.06)' : 'rgba(155,32,32,0.2)',
              }}
              onClick={() => toggleExpand(alert.id)}
            >
              <div className="flex items-start gap-3 p-4">
                <span className="text-lg flex-shrink-0 mt-0.5">{CATEGORY_ICONS[alert.category] || '📊'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display font-bold text-sm text-white">{alert.title}</span>
                    {!alert.read && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--red)' }} />}
                  </div>
                  <p className="text-zinc-400 text-xs font-mono-jb line-clamp-2">{alert.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="font-mono-jb text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${relevanceColor(alert.relevance)}22`, color: relevanceColor(alert.relevance) }}>
                      {t('Relevancia', 'Relevance')}: {alert.relevance}%
                    </span>
                    <span className="font-mono-jb text-[10px] text-zinc-600">
                      {timeAgo(alert.createdAt, lang)}
                    </span>
                    <span className="font-mono-jb text-[10px] text-zinc-600 capitalize">
                      {alert.category}
                    </span>
                  </div>
                </div>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-zinc-600 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>

              {isExpanded && videos.length > 0 && (
                <div className="border-t border-white/5 px-4 pb-4 pt-3">
                  <p className="font-mono-jb text-[10px] text-zinc-600 uppercase tracking-wider mb-2">
                    {t('Vídeos en tendencia', 'Trending videos')}
                  </p>
                  <div className="space-y-1.5">
                    {videos.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-mono-jb">
                        <span className="text-zinc-600">{i + 1}.</span>
                        <span className="text-zinc-300 truncate flex-1">{v.title}</span>
                        <span className="text-zinc-600 flex-shrink-0">{v.channelName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
