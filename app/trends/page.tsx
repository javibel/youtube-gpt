'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';
type Tab = 'explore' | 'alerts';

// ── Alert types ─────────────────────────────────────────────────────────

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

// ── Explorer types ──────────────────────────────────────────────────────

interface TrendingItem {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  thumbnail: string;
  publishedAt: string;
  categoryId: string;
  categoryLabel: { es: string; en: string };
  views: number;
  likes: number;
  comments: number;
  vph: number;
  engagementRate: number;
  lang: string;
  durationSec: number;
}

interface ExplorerData {
  items: TrendingItem[];
  region: string;
  categories: Record<string, { es: string; en: string }>;
  totalResults: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const ALERT_ICONS: Record<string, string> = {
  tech: '💻', gaming: '🎮', education: '📚', entertainment: '🎬', music: '🎵',
  lifestyle: '🌟', news: '📰', sports: '⚽', science: '🔬', business: '💼',
  food: '🍳', travel: '✈️', general: '📊',
};

const REGIONS = [
  { code: 'US', label: { es: '🇺🇸 EE.UU.', en: '🇺🇸 USA' }, lang: 'en' },
  { code: 'ES', label: { es: '🇪🇸 España', en: '🇪🇸 Spain' }, lang: 'es' },
  { code: 'MX', label: { es: '🇲🇽 México', en: '🇲🇽 Mexico' }, lang: 'es' },
  { code: 'GB', label: { es: '🇬🇧 Reino Unido', en: '🇬🇧 UK' }, lang: 'en' },
  { code: 'AR', label: { es: '🇦🇷 Argentina', en: '🇦🇷 Argentina' }, lang: 'es' },
  { code: 'CO', label: { es: '🇨🇴 Colombia', en: '🇨🇴 Colombia' }, lang: 'es' },
  { code: 'FR', label: { es: '🇫🇷 Francia', en: '🇫🇷 France' }, lang: 'fr' },
  { code: 'DE', label: { es: '🇩🇪 Alemania', en: '🇩🇪 Germany' }, lang: 'de' },
  { code: 'BR', label: { es: '🇧🇷 Brasil', en: '🇧🇷 Brazil' }, lang: 'pt' },
  { code: 'JP', label: { es: '🇯🇵 Japón', en: '🇯🇵 Japan' }, lang: 'ja' },
  { code: 'IN', label: { es: '🇮🇳 India', en: '🇮🇳 India' }, lang: 'hi' },
  { code: 'CA', label: { es: '🇨🇦 Canadá', en: '🇨🇦 Canada' }, lang: 'en' },
];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

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

function fmtDuration(sec: number): string {
  if (sec <= 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function vphColor(vph: number): string {
  if (vph >= 100000) return '#22c55e';
  if (vph >= 10000) return '#eab308';
  return '#9ca3af';
}

// ── Main Component ──────────────────────────────────────────────────────

export default function TrendsPage() {
  const { data: session, status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [tab, setTab] = useState<Tab>('explore');

  // Alert state
  const [alerts, setAlerts] = useState<TrendAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Explorer state
  const [explorer, setExplorer] = useState<ExplorerData | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState('');
  const [region, setRegion] = useState('US');
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState<'vph' | 'views' | 'engagement' | 'likes'>('vph');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [durationFilter, setDurationFilter] = useState<string>('all');
  const [minLikes, setMinLikes] = useState<string>('0');

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  // Load alerts
  useEffect(() => {
    if (status !== 'authenticated') return;
    setAlertsLoading(true);
    fetch('/api/trends')
      .then(r => r.json())
      .then(res => {
        if (res.error === 'pro_required') setAlertsError(t('Plan Pro requerido.', 'Pro plan required.'));
        else if (res.alerts) setAlerts(res.alerts);
      })
      .catch(() => setAlertsError(t('Error de conexión', 'Connection error')))
      .finally(() => setAlertsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Load explorer
  const fetchExplorer = useCallback(() => {
    setExplorerLoading(true);
    setExplorerError('');
    const params = new URLSearchParams({ region });
    if (category) params.set('category', category);
    fetch(`/api/youtube/trending?${params}`)
      .then(r => r.json())
      .then(res => {
        if (res.error === 'pro_required') setExplorerError(t('Plan Pro requerido.', 'Pro plan required.'));
        else if (res.error) setExplorerError(res.error);
        else setExplorer(res);
      })
      .catch(() => setExplorerError(t('Error de conexión', 'Connection error')))
      .finally(() => setExplorerLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, category]);

  useEffect(() => {
    if (status === 'authenticated') fetchExplorer();
  }, [status, fetchExplorer]);

  // Alert helpers
  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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

  function markAllRead() {
    fetch('/api/trends', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }

  // Filter by language, duration, likes — then sort
  const filteredItems = explorer?.items
    ? explorer.items.filter(item => {
        // Language filter
        if (langFilter !== 'all' && !item.lang.startsWith(langFilter)) return false;
        // Duration filter
        if (durationFilter === 'short' && item.durationSec >= 240) return false;
        if (durationFilter === 'medium' && (item.durationSec < 240 || item.durationSec > 1200)) return false;
        if (durationFilter === 'long' && item.durationSec <= 1200) return false;
        // Min likes filter
        const minL = parseInt(minLikes);
        if (minL > 0 && item.likes < minL) return false;
        return true;
      })
    : [];

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortBy === 'vph') return b.vph - a.vph;
    if (sortBy === 'views') return b.views - a.views;
    if (sortBy === 'likes') return b.likes - a.likes;
    return b.engagementRate - a.engagementRate;
  });

  const unread = alerts.filter(a => !a.read).length;
  const categories = explorer?.categories || {};

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
          <p className="mb-6 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesión para explorar tendencias.', 'Sign in to explore trends.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      {/* Header + Tabs */}
      <div style={{ background: 'var(--yv-bg-1)', borderBottom: '1px solid var(--yv-border-subtle)' }}>
        <div className="yv-page yv-page--wide pb-0">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--yv-brand)' }}>
            {t('TENDENCIAS YOUTUBE', 'YOUTUBE TRENDS')}
          </p>
          <h1 className="font-display font-bold text-3xl md:text-4xl text-white mb-6">
            {t('Tendencias', 'Trends')}
          </h1>

          {/* Tabs */}
          <div className="flex gap-0">
            <button
              onClick={() => setTab('explore')}
              className="px-5 py-3 font-mono-jb text-[11px] tracking-wider border-b-2 transition"
              style={{
                color: tab === 'explore' ? 'var(--yv-text-1)' : 'var(--yv-text-3)',
                borderColor: tab === 'explore' ? 'var(--yv-brand)' : 'transparent',
              }}
            >
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                {t('Explorar', 'Explore')}
              </span>
            </button>
            <button
              onClick={() => setTab('alerts')}
              className="px-5 py-3 font-mono-jb text-[11px] tracking-wider border-b-2 transition"
              style={{
                color: tab === 'alerts' ? 'var(--yv-text-1)' : 'var(--yv-text-3)',
                borderColor: tab === 'alerts' ? 'var(--yv-brand)' : 'transparent',
              }}
            >
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {t('Alertas', 'Alerts')}
                {unread > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold" style={{ background: 'var(--yv-brand)', color: '#fff' }}>
                    {unread}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ── EXPLORE TAB ──────────────────────────────────────────────── */}
      {tab === 'explore' && (
        <div className="yv-page yv-page--wide">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Region */}
            <select
              value={region}
              onChange={e => {
                const newRegion = e.target.value;
                setRegion(newRegion);
                const regionDef = REGIONS.find(r => r.code === newRegion);
                if (regionDef) setLangFilter(regionDef.lang);
              }}
              className="font-mono-jb text-[11px] rounded px-3 py-2 transition focus:outline-none"
              style={{ border: '1px solid var(--yv-border)', background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}
            >
              {REGIONS.map(r => (
                <option key={r.code} value={r.code} style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                  {r.label[lang]}
                </option>
              ))}
            </select>

            {/* Category */}
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="font-mono-jb text-[11px] rounded px-3 py-2 transition focus:outline-none"
              style={{ border: '1px solid var(--yv-border)', background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}
            >
              <option value="" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Todas las categorías', 'All categories')}
              </option>
              {Object.entries(categories).map(([id, label]) => (
                <option key={id} value={id} style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                  {label[lang]}
                </option>
              ))}
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'vph' | 'views' | 'engagement' | 'likes')}
              className="font-mono-jb text-[11px] rounded px-3 py-2 transition focus:outline-none"
              style={{ border: '1px solid var(--yv-border)', background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}
            >
              <option value="vph" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Views/hora', 'Views/hour')}
              </option>
              <option value="views" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Total views', 'Total views')}
              </option>
              <option value="likes" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                Likes
              </option>
              <option value="engagement" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                Engagement %
              </option>
            </select>

            {/* Duration filter */}
            <select
              value={durationFilter}
              onChange={e => setDurationFilter(e.target.value)}
              className="font-mono-jb text-[11px] rounded px-3 py-2 transition focus:outline-none"
              style={{ border: '1px solid var(--yv-border)', background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}
            >
              <option value="all" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Cualquier duración', 'Any duration')}
              </option>
              <option value="short" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Corto (< 4 min)', 'Short (< 4 min)')}
              </option>
              <option value="medium" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Medio (4-20 min)', 'Medium (4-20 min)')}
              </option>
              <option value="long" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Largo (> 20 min)', 'Long (> 20 min)')}
              </option>
            </select>

            {/* Min likes filter */}
            <select
              value={minLikes}
              onChange={e => setMinLikes(e.target.value)}
              className="font-mono-jb text-[11px] rounded px-3 py-2 transition focus:outline-none"
              style={{ border: '1px solid var(--yv-border)', background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}
            >
              <option value="0" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Sin mín. likes', 'No min likes')}
              </option>
              <option value="1000" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                1K+ likes
              </option>
              <option value="10000" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                10K+ likes
              </option>
              <option value="100000" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                100K+ likes
              </option>
            </select>

            {/* Language filter */}
            <select
              value={langFilter}
              onChange={e => setLangFilter(e.target.value)}
              className="font-mono-jb text-[11px] rounded px-3 py-2 transition focus:outline-none"
              style={{ border: '1px solid var(--yv-border)', background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}
            >
              <option value="all" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Todos los idiomas', 'All languages')}
              </option>
              <option value="es" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Español', 'Spanish')}
              </option>
              <option value="en" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Inglés', 'English')}
              </option>
              <option value="pt" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Portugués', 'Portuguese')}
              </option>
              <option value="fr" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Francés', 'French')}
              </option>
              <option value="de" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Alemán', 'German')}
              </option>
              <option value="ja" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Japonés', 'Japanese')}
              </option>
              <option value="ko" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                {t('Coreano', 'Korean')}
              </option>
              <option value="hi" style={{ background: 'var(--yv-bg-3)', color: 'var(--yv-text-1)' }}>
                Hindi
              </option>
            </select>

            {/* Refresh button */}
            <button
              onClick={fetchExplorer}
              disabled={explorerLoading}
              className="font-mono-jb text-[11px] tracking-wider hover:text-white transition rounded px-3 py-2 disabled:opacity-40"
              style={{ color: 'var(--yv-text-3)', border: '1px solid var(--yv-border)' }}
            >
              {explorerLoading ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  {t('Cargando...', 'Loading...')}
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  {t('Actualizar', 'Refresh')}
                </span>
              )}
            </button>

            {explorer && (
              <span className="font-mono-jb text-[10px] ml-auto" style={{ color: 'var(--yv-text-4)' }}>
                {explorer.totalResults} {t('resultados', 'results')}
              </span>
            )}
          </div>

          {/* Error */}
          {explorerError && (
            <p className="text-red-400 font-mono-jb text-sm text-center py-8">{explorerError}</p>
          )}

          {/* Loading skeleton */}
          {explorerLoading && !explorer && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl p-4 animate-pulse" style={{ background: 'var(--yv-bg-2)', border: '1px solid var(--yv-border-subtle)' }}>
                  <div className="h-32 rounded-lg mb-3" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <div className="h-4 rounded w-3/4 mb-2" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <div className="h-3 rounded w-1/2" style={{ background: 'rgba(255,255,255,0.03)' }} />
                </div>
              ))}
            </div>
          )}

          {/* Results grid */}
          {sortedItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedItems.map((item, idx) => (
                <div
                  key={item.videoId}
                  className="rounded-xl overflow-hidden transition group"
                  style={{ background: 'var(--yv-bg-2)', border: '1px solid var(--yv-border-subtle)' }}
                >
                  {/* Thumbnail */}
                  <div className="relative">
                    <a
                      href={`https://www.youtube.com/watch?v=${item.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-40 object-cover"
                      />
                    </a>
                    {/* Rank badge */}
                    <span className="absolute top-2 left-2 font-mono-jb text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.75)', color: idx < 3 ? '#FFE800' : '#fff' }}>
                      #{idx + 1}
                    </span>
                    {/* Duration badge */}
                    {item.durationSec > 0 && (
                      <span className="absolute bottom-2 right-2 font-mono-jb text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.85)', color: '#fff' }}>
                        {fmtDuration(item.durationSec)}
                      </span>
                    )}
                    {/* VPH badge */}
                    <span className="absolute top-2 right-2 font-mono-jb text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1" style={{ background: 'rgba(0,0,0,0.80)', color: vphColor(item.vph) }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                      {fmtNum(item.vph)}/h
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <a
                      href={`https://www.youtube.com/watch?v=${item.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display font-bold text-sm text-white line-clamp-2 hover:underline leading-tight"
                    >
                      {item.title}
                    </a>
                    <p className="font-mono-jb text-[10px] mt-1 truncate" style={{ color: 'var(--yv-text-3)' }}>{item.channelTitle}</p>

                    {/* Stats row */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-2)' }}>
                        {fmtNum(item.views)} views
                      </span>
                      <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-2)' }}>
                        👍 {fmtNum(item.likes)}
                      </span>
                      <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-2)' }}>
                        {item.engagementRate}% eng
                      </span>
                      <span className="font-mono-jb text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--yv-text-3)' }}>
                        {item.categoryLabel[lang]}
                      </span>
                    </div>

                    {/* Age */}
                    <p className="font-mono-jb text-[10px] mt-1" style={{ color: 'var(--yv-text-4)' }}>
                      {timeAgo(item.publishedAt, lang)}
                    </p>

                    {/* Action: Create video */}
                    <a
                      href={`/generate?topic=${encodeURIComponent(item.title)}`}
                      className="mt-3 flex items-center justify-center gap-1.5 w-full font-mono-jb text-[11px] tracking-wider px-3 py-2 rounded hover:text-white transition"
                      style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--yv-text-2)', border: '1px solid var(--yv-border)' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                      {t('Crear vídeo sobre esto', 'Create video about this')}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!explorerLoading && !explorerError && sortedItems.length === 0 && (
            <div className="text-center py-16">
              <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>
                {t('No se encontraron tendencias para esta combinación.', 'No trends found for this combination.')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── ALERTS TAB ───────────────────────────────────────────────── */}
      {tab === 'alerts' && (
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-3">
          {/* Mark all read */}
          {unread > 0 && (
            <div className="flex justify-end mb-2">
              <button onClick={markAllRead} className="font-mono-jb text-[11px] hover:text-white transition rounded px-3 py-1.5" style={{ color: 'var(--yv-text-3)', border: '1px solid var(--yv-border)' }}>
                {t('Marcar todo leído', 'Mark all read')}
              </button>
            </div>
          )}

          {alertsLoading && (
            <div className="flex items-center gap-3 justify-center py-20">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {alertsError && <p className="text-red-400 font-mono-jb text-sm text-center py-8">{alertsError}</p>}

          {!alertsLoading && !alertsError && alerts.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-4">📊</div>
              <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>
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
                  <span className="text-lg flex-shrink-0 mt-0.5">{ALERT_ICONS[alert.category] || '📊'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-display font-bold text-sm text-white">{alert.title}</span>
                      {!alert.read && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--yv-brand)' }} />}
                    </div>
                    <p className="text-xs font-mono-jb line-clamp-2" style={{ color: 'var(--yv-text-2)' }}>{alert.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="font-mono-jb text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${relevanceColor(alert.relevance)}22`, color: relevanceColor(alert.relevance) }}>
                        {t('Relevancia', 'Relevance')}: {alert.relevance}%
                      </span>
                      <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-4)' }}>
                        {timeAgo(alert.createdAt, lang)}
                      </span>
                      <span className="font-mono-jb text-[10px] capitalize" style={{ color: 'var(--yv-text-4)' }}>
                        {alert.category}
                      </span>
                    </div>
                  </div>
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--yv-text-4)' }}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>

                {isExpanded && videos.length > 0 && (
                  <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid var(--yv-border-subtle)' }}>
                    <p className="font-mono-jb text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--yv-text-4)' }}>
                      {t('Vídeos en tendencia', 'Trending videos')}
                    </p>
                    <div className="space-y-1.5">
                      {videos.map((v, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono-jb">
                          <span style={{ color: 'var(--yv-text-4)' }}>{i + 1}.</span>
                          <span className="truncate flex-1" style={{ color: 'var(--yv-text-2)' }}>{v.title}</span>
                          <span className="flex-shrink-0" style={{ color: 'var(--yv-text-4)' }}>{v.channelName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
