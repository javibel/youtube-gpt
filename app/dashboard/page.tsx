'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, lazy, useCallback } from 'react';
import { getLangClient } from '@/lib/get-lang-client';

const VideoPreviewGenerator = lazy(() => import('@/components/VideoPreviewGenerator'));

const TPL_ICONS: Record<string, string> = {
  title: '🎯', description: '📄', caption: '💬', thumbnail: '🖼️',
  script: '📝', shorts_hook: '⚡', series: '📚', niche_analysis: '🔍',
};
const TPL_LABELS: Record<string, { es: string; en: string }> = {
  title:         { es: 'Título',      en: 'Title' },
  description:   { es: 'Descripción', en: 'Description' },
  caption:       { es: 'Caption',     en: 'Caption' },
  thumbnail:     { es: 'Miniatura',   en: 'Thumbnail' },
  script:        { es: 'Script',      en: 'Script' },
  shorts_hook:   { es: 'Hook',        en: 'Hook' },
  series:        { es: 'Serie',       en: 'Series' },
  niche_analysis:{ es: 'Nicho',       en: 'Niche' },
};
const TPL_COLORS: Record<string, string> = {
  title: '#e84d5b', description: '#00E5FF', caption: '#FF00AA',
  thumbnail: '#7CFF00', script: '#FFE800', shorts_hook: '#00FFA3', series: '#FF8A00', niche_analysis: '#B388FF',
};

const QUICK_TPLS = [
  { k: 'title',       icon: '🎯', color: '#e84d5b', est: '8s' },
  { k: 'description', icon: '📄', color: '#00E5FF', est: '12s' },
  { k: 'script',      icon: '📝', color: '#FFE800', est: '30s' },
  { k: 'caption',     icon: '💬', color: '#FF00AA', est: '10s' },
  { k: 'thumbnail',   icon: '🖼️', color: '#7CFF00', est: '5s' },
];

type Stats = {
  user: { email: string; name: string | null; createdAt: string };
  stats: {
    totalGenerations: number;
    generationsThisMonth: number;
    limit: number;
    remaining: number;
    isPro: boolean;
    streak: number;
  };
  recentGenerations: { id: string; template: string; createdAt: string; tokensUsed: number; output: string; inputs: Record<string, string> }[];
  subscription: { status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null;
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [billingPlan, setBillingPlan] = useState<'monthly'|'yearly'>('monthly');
  const [cancelling, setCancelling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('all');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [existingReview, setExistingReview] = useState<{ rating: number; text: string; status: string } | null>(null);
  const [lang, setLang] = useState<'es'|'en'>('es');
  const [previewGen, setPreviewGen] = useState<{ id: string; output: string; title?: string } | null>(null);

  type DbPreview = { id: string; title: string; mimeType: string; createdAt: string };
  const [dbPreviews, setDbPreviews]         = useState<DbPreview[]>([]);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [playingPreview, setPlayingPreview] = useState<{ id: string; title: string; url: string } | null>(null);

  const loadDbPreviews = useCallback(async () => {
    try {
      const res = await fetch('/api/video-previews');
      const data = await res.json();
      if (data.previews) setDbPreviews(data.previews);
    } catch { /* non-critical */ }
  }, []);

  const handleSelectPreview = useCallback(async (preview: DbPreview) => {
    setLoadingPreviewId(preview.id);
    try {
      const res = await fetch(`/api/video-previews/${preview.id}`);
      const blob = await res.blob();
      setPlayingPreview({ id: preview.id, title: preview.title, url: URL.createObjectURL(blob) });
    } catch { /* non-critical */ } finally {
      setLoadingPreviewId(null);
    }
  }, []);

  const closePlayingPreview = useCallback(() => {
    if (playingPreview?.url) URL.revokeObjectURL(playingPreview.url);
    setPlayingPreview(null);
  }, [playingPreview]);

  type YtChannel = { id: string; name: string; thumbnail: string; subscribers: number; totalViews: number; videoCount: number };
  type YtVideo  = { videoId: string; title: string; thumbnail: string; publishedAt: string; views: number };
  const [ytChannel, setYtChannel]       = useState<YtChannel | null>(null);
  const [ytVideos, setYtVideos]         = useState<YtVideo[]>([]);
  const [ytConnected, setYtConnected]   = useState<boolean | null>(null); // null = loading
  const [ytConnecting, setYtConnecting] = useState(false);
  const [ytDisconnecting, setYtDisconnecting] = useState(false);
  const [ytToast, setYtToast]           = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => { setLang(getLangClient()); }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/user/stats').then((r) => r.json()).then(setData).finally(() => setLoading(false));
      loadDbPreviews();
      fetch('/api/reviews').then((r) => r.json()).then((d) => {
        if (d.review) { setExistingReview(d.review); setReviewRating(d.review.rating); setReviewText(d.review.text); }
      });
      fetch('/api/youtube/channel').then((r) => r.json()).then((d) => {
        if (d.connected) {
          setYtConnected(true);
          setYtChannel(d.channel);
          setYtVideos(d.videos || []);
        } else {
          setYtConnected(false);
        }
      }).catch(() => setYtConnected(false));
    }
  }, [status]);

  // Handle ?yt= param after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const yt = params.get('yt');
    if (yt === 'connected') {
      setYtToast(lang === 'en' ? '✓ YouTube channel connected!' : '✓ Canal de YouTube conectado');
      setTimeout(() => setYtToast(null), 4000);
      window.history.replaceState({}, '', '/dashboard');
    } else if (yt === 'error') {
      setYtToast(lang === 'en' ? '✗ Could not connect YouTube' : '✗ No se pudo conectar YouTube');
      setTimeout(() => setYtToast(null), 4000);
      window.history.replaceState({}, '', '/dashboard');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fmtNum(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }

  function handleYtConnect() {
    setYtConnecting(true);
    window.location.href = '/api/youtube/auth';
  }

  async function handleYtDisconnect() {
    setYtDisconnecting(true);
    await fetch('/api/youtube/disconnect', { method: 'POST' });
    setYtConnected(false);
    setYtChannel(null);
    setYtVideos([]);
    setYtDisconnecting(false);
  }

  async function handleUpgrade(plan: 'monthly' | 'yearly' = billingPlan) {
    setUpgrading(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
      const d = await res.json();
      if (d.error) { alert(d.error); return; }
      if (!d.url) { alert(t('No se pudo iniciar el pago. Inténtalo de nuevo.', 'Could not start payment. Please try again.')); return; }
      window.location.href = d.url;
    } catch { alert(t('Error de conexión. Inténtalo de nuevo.', 'Connection error. Please try again.')); }
    finally { setUpgrading(false); }
  }

function handleCopy(id: string, out: string) {
    navigator.clipboard.writeText(out).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); });
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewRating) return;
    setReviewSubmitting(true);
    try {
      const res = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: reviewRating, text: reviewText }) });
      const d = await res.json();
      if (!d.error) { setExistingReview(d.review); setReviewSaved(true); setTimeout(() => setReviewSaved(false), 3000); }
    } finally { setReviewSubmitting(false); }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/stripe/sync', { method: 'POST' });
      const d = await res.json();
      if (d.synced) {
        setSyncMsg(t('✓ Suscripción activada. Recargando...', '✓ Subscription activated. Reloading...'));
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setSyncMsg(d.message ?? t('No se encontró suscripción activa en Stripe.', 'No active subscription found in Stripe.'));
      }
    } catch {
      setSyncMsg(t('Error de conexión. Inténtalo de nuevo.', 'Connection error. Please try again.'));
    } finally {
      setSyncing(false);
    }
  }

  async function handleCancel() {
    if (!confirm(t('¿Seguro que quieres cancelar tu suscripción Pro?', 'Are you sure you want to cancel your Pro subscription?'))) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/stripe/cancel', { method: 'POST' });
      if (res.ok) { setData((prev) => prev ? { ...prev, subscription: prev.subscription ? { ...prev.subscription, cancelAtPeriodEnd: true } : null } : null); }
      else { const { error } = await res.json(); alert(error ?? t('Error al cancelar', 'Cancellation error')); }
    } finally { setCancelling(false); }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent spin-r" style={{ borderTopColor: 'var(--red)' }} />
      </div>
    );
  }

  if (!session) return null;

  const stats = data?.stats;
  const isPro = stats?.isPro ?? false;
  const usedPct = stats ? Math.min((stats.generationsThisMonth / stats.limit) * 100, 100) : 0;
  const displayName = data?.user?.name ?? session.user?.email ?? 'User';
  const firstName = displayName.split(' ')[0];
  const dateLocale = lang === 'en' ? 'en-US' : 'es-ES';

  const filtered = filterType === 'all'
    ? data?.recentGenerations ?? []
    : (data?.recentGenerations ?? []).filter((g) => g.template === filterType);

  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const tpl = (key: string) => TPL_LABELS[key]?.[lang] ?? key;

  const FILTERS = lang === 'en'
    ? [['all','All'],['title','Title'],['script','Script'],['description','Desc'],['thumbnail','Thumb'],['caption','Caption']]
    : [['all','Todo'],['title','Título'],['script','Script'],['description','Desc'],['thumbnail','Thumb'],['caption','Caption']];

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>

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
          <div className="flex items-center gap-3">
            <a href="/research" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              {t('Investigar', 'Research')}
            </a>
            <a href="/competitors" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {t('Competidores', 'Competitors')}
            </a>
            <span className="flex items-center gap-2 text-zinc-400 text-sm">
              <span>{displayName}</span>
              {isPro && <span className="red-tape text-[9px] py-0.5">PRO</span>}
            </span>
            <a href="/profile" title={t('Mi perfil', 'My profile')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-white/30 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            </a>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="font-mono-jb text-[11px] text-zinc-500 hover:text-zinc-300 transition">{t('Salir', 'Sign out')}</button>
          </div>
        </div>
      </nav>

      {/* Page header */}
      <div className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>{t('PANEL DE CONTROL', 'DASHBOARD')}</p>
              <h1 className="font-display font-bold text-4xl md:text-5xl">{t('Buenas', 'Hey')}, {firstName}.</h1>
              <p className="text-zinc-400 mt-2">{t('Tu motor de contenido te espera.', 'Your content engine is ready.')}</p>
            </div>
            <div className="flex items-center gap-3">
              {!isPro && (
                <button onClick={() => handleUpgrade(billingPlan)} disabled={upgrading}
                  className="btn-offset btn-offset-ghost px-4 py-2.5 text-[13px] font-display gap-2 disabled:opacity-50">
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18M4 8l4 4 4-6 4 6 4-4-1 10H5z" /></svg>
                  {upgrading ? t('Redirigiendo...', 'Redirecting...') : 'Upgrade to Pro'}
                </button>
              )}
              <a href="/generate" className="btn-offset px-5 py-2.5 text-[13px] font-display">
                + {t('Nueva generación', 'New generation')}
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 grid lg:grid-cols-[1fr_320px] gap-8">
        <main className="space-y-8">

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: '⚡', label: t('Este mes', 'This month'), num: `${stats?.generationsThisMonth ?? 0}`, sub: `/ ${stats?.limit}`, color: '#e84d5b' },
              { icon: '🔥', label: t('Racha', 'Streak'),        num: `${stats?.streak ?? 0}`,               sub: t('días', 'days'),    color: '#FFE800' },
              { icon: '📊', label: t('Total generado', 'Total generated'), num: `${stats?.totalGenerations ?? 0}`, sub: '', color: '#00E5FF' },
              { icon: '⏱',  label: t('Tiempo ahorrado', 'Time saved'),    num: `${Math.round((stats?.totalGenerations ?? 0) * 0.06)}h`, sub: t('aprox.', 'approx.'), color: '#7CFF00' },
            ].map((s, i) => (
              <div key={i} className="soft-card p-5 relative">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl">{s.icon}</span>
                  <span className="font-mono-jb text-[10px] text-zinc-600">0{i + 1}</span>
                </div>
                <p className="font-display font-bold stat-num" style={{ fontSize: '36px', color: '#fff' }}>
                  {s.num}<span className="text-lg text-zinc-500 ml-1">{s.sub}</span>
                </p>
                <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mt-2">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Usage bar */}
          <div className="soft-card p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono-jb text-[11px] tracking-wider uppercase text-zinc-400">
                {t('Uso del plan', 'Plan usage')} · {isPro ? 'PRO' : 'FREE'}
              </p>
              <p className="font-mono-jb text-xs text-zinc-400">
                {stats?.generationsThisMonth ?? 0}/{stats?.limit ?? 10} ·{' '}
                <span style={{ color: 'var(--red)' }}>{stats?.remaining ?? 0} {t('restantes', 'remaining')}</span>
              </p>
            </div>
            <div className="h-2 rounded-full bg-white/5 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{
                  width: `${usedPct}%`,
                  background: usedPct >= 85 ? 'linear-gradient(90deg,#ef4444,#f97316)' : isPro ? 'linear-gradient(90deg,var(--red),#FF8A00)' : 'linear-gradient(90deg,var(--red),#f05c6a)',
                  boxShadow: '0 0 12px rgba(232,77,91,0.5)',
                }}
              />
            </div>
            <div className="flex justify-between mt-2 font-mono-jb text-[9px] text-zinc-600">
              <span>0</span><span>{Math.round((stats?.limit ?? 10) * 0.5)}</span><span>{stats?.limit ?? 10}</span>
            </div>
          </div>

          {/* Pro subscription active */}
          {isPro && data?.subscription && (
            <div className="soft-card p-5 flex items-center justify-between gap-4" style={{ borderColor: 'rgba(232,77,91,0.3)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--red)' }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="white"><path d="M3 18h18M4 8l4 4 4-6 4 6 4-4-1 10H5z" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-sm">{t('Plan Pro activo', 'Active Pro plan')}</p>
                  {data.subscription.cancelAtPeriodEnd ? (
                    <p className="text-yellow-400 text-xs mt-0.5">
                      {t('No se renovará · Acceso hasta el', 'Will not renew · Access until')}{' '}
                      {data.subscription.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long' }) : '—'}
                    </p>
                  ) : (
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {t('Renovación el', 'Renews on')}{' '}
                      {data.subscription.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long' }) : '—'}
                    </p>
                  )}
                </div>
              </div>
              {!data.subscription.cancelAtPeriodEnd && (
                <button onClick={handleCancel} disabled={cancelling} className="font-mono-jb text-[11px] text-zinc-600 hover:text-zinc-400 disabled:opacity-50 transition">
                  {cancelling ? t('Cancelando...', 'Cancelling...') : t('Cancelar suscripción', 'Cancel subscription')}
                </button>
              )}
            </div>
          )}

          {/* Badges */}
          {(() => {
            const total = stats?.totalGenerations ?? 0;
            const streak = stats?.streak ?? 0;
            const badges = [
              { id: 'first',   icon: '🎯', label: t('Primera gen',   'First gen'),    desc: t('Genera tu primer contenido',       'Generate your first content'),        earned: total >= 1 },
              { id: 'ten',     icon: '📊', label: t('10 generados',  '10 generated'), desc: t('Alcanza 10 generaciones en total', 'Reach 10 total generations'),          earned: total >= 10 },
              { id: 'fifty',   icon: '⚡', label: t('50 generados',  '50 generated'), desc: t('Alcanza 50 generaciones en total', 'Reach 50 total generations'),          earned: total >= 50 },
              { id: 'streak',  icon: '🔥', label: t('Racha 7d',      '7d streak'),    desc: t('Usa YTubViral 7 días seguidos',    'Use YTubViral 7 days in a row'),       earned: streak >= 7 },
              { id: 'pro',     icon: '👑', label: 'Pro',                              desc: t('Activa el plan Pro',               'Activate Pro plan'),                  earned: isPro },
              { id: 'yt',      icon: '📺', label: t('Canal YT',      'YT Channel'),   desc: t('Conecta tu canal de YouTube',      'Connect your YouTube channel'),       earned: ytConnected },
            ];
            const earnedCount = badges.filter(b => b.earned).length;
            return (
              <div className="soft-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-1" style={{ color: 'var(--red)' }}>ACHIEVEMENTS</p>
                    <h2 className="font-display font-bold text-lg">{t('Logros', 'Badges')}</h2>
                  </div>
                  <span className="font-mono-jb text-[11px] text-zinc-500">{earnedCount}/{badges.length}</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {badges.map(b => (
                    <div key={b.id} title={b.desc}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition"
                      style={{
                        background: b.earned ? 'rgba(232,77,91,0.08)' : 'rgba(255,255,255,0.02)',
                        border: b.earned ? '1px solid rgba(232,77,91,0.3)' : '1px solid var(--line)',
                        opacity: b.earned ? 1 : 0.35,
                        filter: b.earned ? 'none' : 'grayscale(1)',
                      }}>
                      <span className="text-2xl">{b.icon}</span>
                      <p className="font-mono-jb text-[9px] text-center leading-tight" style={{ color: b.earned ? '#fff' : '#6b7280' }}>{b.label}</p>
                      {b.earned && <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--red)' }} />}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Quick launch */}
          <div>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--red)' }}>QUICK · LAUNCH</p>
                <h2 className="font-display font-bold text-2xl">{t('¿Qué generamos hoy?', "What are we generating today?")}</h2>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {QUICK_TPLS.map((tplItem) => (
                <a key={tplItem.k} href="/generate"
                  className="group relative text-left p-5 soft-card transition block"
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 28px -10px ${tplItem.color}80`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-2xl mb-4" style={{ background: tplItem.color + '22', border: `1px solid ${tplItem.color}` }}>
                    {tplItem.icon}
                  </div>
                  <p className="font-display font-bold text-sm">{tpl(tplItem.k)}</p>
                  <p className="font-mono-jb text-[10px] text-zinc-500 mt-1">~{tplItem.est}</p>
                </a>
              ))}
            </div>
          </div>

          {/* My Previews — TV3 decorative + title list */}
          {(isPro || dbPreviews.length > 0) && (
            <div>
              <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: '#00D9FF' }}>VIDEO TIPS</p>
              <h2 className="font-display font-bold text-2xl mb-4">{t('Mis previews', 'My previews')}</h2>
              <div className="soft-card p-5">
                <div className="flex gap-6 items-start flex-wrap sm:flex-nowrap">

                  {/* TV3 — decorative only */}
                  <img
                    src="/TV3.webp"
                    alt=""
                    draggable={false}
                    style={{ width: 200, flexShrink: 0, userSelect: 'none', pointerEvents: 'none', opacity: 0.9 }}
                  />

                  {/* Preview list */}
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-600 mb-3">
                      {t('Últimas generaciones', 'Latest previews')}
                    </p>

                    {dbPreviews.length === 0 ? (
                      <div className="py-6">
                        <p className="font-mono-jb text-[11px] text-zinc-600 leading-relaxed">
                          {t(
                            'Genera un script y pulsa "Generar Preview" para ver tu animación aquí.',
                            'Generate a script and click "Generate Preview" to see your animation here.',
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dbPreviews.map((p, i) => (
                          <button
                            key={p.id}
                            onClick={() => handleSelectPreview(p)}
                            disabled={loadingPreviewId === p.id}
                            className="w-full text-left flex items-center gap-3 p-3 rounded-xl transition group disabled:opacity-60"
                            style={{
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            <span className="font-mono-jb text-[10px] w-5 text-center flex-shrink-0" style={{ color: '#3f3f46' }}>
                              {loadingPreviewId === p.id ? (
                                <svg className="animate-spin inline" width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#00D9FF" strokeWidth="3"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                              ) : i + 1}
                            </span>
                            <span className="flex-1 font-mono-jb text-[11px] text-zinc-400 truncate group-hover:text-white transition">
                              {p.title}
                            </span>
                            <span className="font-mono-jb text-[10px] flex-shrink-0 flex items-center gap-1 transition group-hover:opacity-100 opacity-40"
                              style={{ color: '#00D9FF' }}>
                              <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                              {t('ver', 'play')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </div>
          )}

          {/* History */}
          <div>
            <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
              <div>
                <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--red)' }}>HISTORY</p>
                <h2 className="font-display font-bold text-2xl">{t('Generaciones recientes', 'Recent generations')}</h2>
              </div>
              <div className="flex items-center rounded-full border border-white/10 bg-[#0E0E10] font-mono-jb text-[10px] tracking-wider uppercase overflow-hidden">
                {FILTERS.map(([k, label]) => (
                  <button key={k} onClick={() => setFilterType(k)}
                    className="px-3 py-2 transition"
                    style={{ background: filterType === k ? 'var(--red)' : 'transparent', color: filterType === k ? '#000' : '#a1a1aa' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="soft-card overflow-hidden" style={{ borderRadius: '14px' }}>
              {!filtered.length ? (
                <div className="text-center py-12">
                  <p className="text-zinc-600 text-sm mb-3">{t('Aún no hay generaciones', 'No generations yet')}</p>
                  <a href="/generate" className="btn-offset px-5 py-2.5 text-sm font-display gap-2">
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
                    {t('Empezar a generar', 'Start generating')}
                  </a>
                </div>
              ) : (
                filtered.map((gen) => {
                  const isOpen = expandedId === gen.id;
                  const isCopied = copiedId === gen.id;
                  const color = TPL_COLORS[gen.template] ?? 'var(--red)';
                  return (
                    <div key={gen.id} className="hover:bg-white/[0.02] transition" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <button onClick={() => setExpandedId(isOpen ? null : gen.id)} className="w-full text-left p-5 flex items-start gap-4">
                        <span className="text-2xl w-10 h-10 rounded-lg flex items-center justify-center border border-white/10 bg-black shrink-0">
                          {TPL_ICONS[gen.template] ?? '📄'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono-jb text-[10px] tracking-wider uppercase" style={{ color }}>
                              {tpl(gen.template)}
                            </span>
                            <span className="text-zinc-600 font-mono-jb text-[10px]">·</span>
                            <span className="font-mono-jb text-[10px] text-zinc-500">
                              {new Date(gen.createdAt).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-zinc-600 font-mono-jb text-[10px]">·</span>
                            <span className="font-mono-jb text-[10px] text-zinc-500">{gen.tokensUsed} tokens</span>
                          </div>
                          {gen.inputs?.tema && <p className="font-display font-semibold mt-0.5 truncate">{gen.inputs.tema}</p>}
                          <p className="text-zinc-500 text-sm mt-0.5 truncate">{gen.output?.slice(0, 80)}</p>
                        </div>
                        <span className="font-mono-jb text-xs text-zinc-500 transition shrink-0" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-5 page-enter">
                          <div className="ml-14 p-4 rounded-xl border border-white/10 bg-black font-mono-jb text-[12px] leading-relaxed whitespace-pre-wrap text-zinc-300">
                            {gen.output}
                          </div>
                          <div className="ml-14 mt-3 flex items-center gap-2 flex-wrap">
                            <button onClick={() => handleCopy(gen.id, gen.output)} className="btn-offset btn-offset-white px-3 py-1.5 text-[11px] font-display gap-1.5">
                              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>
                              {isCopied ? t('¡Copiado!', 'Copied!') : t('Copiar', 'Copy')}
                            </button>
                            {isPro && gen.template === 'script' && (
                              <button
                                onClick={() => setPreviewGen({ id: gen.id, output: gen.output, title: gen.inputs?.tema ?? 'Script' })}
                                className="px-3 py-1.5 text-[11px] font-display gap-1.5 rounded-lg border transition flex items-center"
                                style={{ borderColor: 'rgba(0,217,255,0.35)', color: '#00D9FF', background: 'rgba(0,217,255,0.06)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,217,255,0.12)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,217,255,0.06)')}>
                                🎬 {t('Generar Preview', 'Generate Preview')}
                              </button>
                            )}
                            <a href="/generate" className="soft-pill px-3 py-1.5 text-[11px] font-mono-jb tracking-wider uppercase text-zinc-300 hover:text-white">
                              {t('Nueva generación', 'New generation')}
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Review */}
          <div className="soft-card p-6">
            <p className="font-display font-bold text-lg mb-1">
              {existingReview ? t('Tu reseña', 'Your review') : t('Deja tu reseña', 'Leave a review')}
            </p>
            <p className="font-mono-jb text-[11px] text-zinc-500 mb-5">
              {existingReview
                ? existingReview.status === 'approved'
                  ? t('Tu reseña está publicada en la página principal.', 'Your review is published on the homepage.')
                  : existingReview.status === 'rejected'
                  ? t('Tu reseña no fue aprobada. Puedes editarla.', 'Your review was not approved. You can edit it.')
                  : t('Tu reseña está pendiente de revisión.', 'Your review is pending approval.')
                : t('¿Cómo te está yendo con YTubViral.com? Tu opinión ayuda a otros creadores.', 'How is YTubViral.com working for you? Your feedback helps other creators.')}
            </p>
            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div className="flex gap-1">
                {[1,2,3,4,5].map((star) => (
                  <button key={star} type="button" onClick={() => setReviewRating(star)}
                    className="text-2xl transition"
                    style={{ color: star <= reviewRating ? '#FFE800' : 'rgba(255,255,255,0.15)' }}>★</button>
                ))}
              </div>
              <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)}
                placeholder={t('Cuéntanos cómo te ha ayudado YTubViral.com... (mín. 10 caracteres)', 'Tell us how YTubViral.com has helped you... (min. 10 characters)')}
                maxLength={400} rows={3}
                className="soft-field resize-none text-sm" />
              <div className="flex items-center justify-between">
                <span className="font-mono-jb text-xs text-zinc-600">{reviewText.length}/400</span>
                <button type="submit" disabled={reviewSubmitting || !reviewRating || reviewText.trim().length < 10}
                  className="btn-offset px-5 py-2 text-sm font-display disabled:opacity-40"
                  style={reviewSaved ? { background: '#16a34a' } : {}}>
                  {reviewSubmitting
                    ? t('Enviando...', 'Submitting...')
                    : reviewSaved
                    ? t('¡Enviada!', 'Submitted!')
                    : existingReview
                    ? t('Actualizar reseña', 'Update review')
                    : t('Enviar reseña', 'Submit review')}
                </button>
              </div>
            </form>
          </div>

        </main>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Profile card */}
          <div className="soft-card p-5">
            <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-4">{t('Cuenta', 'Account')}</p>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-xl shrink-0"
                style={{ background: 'var(--red)', color: '#fff', boxShadow: '0 6px 18px -6px rgba(232,77,91,0.6)' }}>
                {displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{displayName}</p>
                <p className="font-mono-jb text-[10px] text-zinc-500 truncate">{data?.user?.email}</p>
              </div>
            </div>
            <div className="space-y-1.5 font-mono-jb text-[11px]">
              <div className="flex justify-between"><span className="text-zinc-500">{t('Plan', 'Plan')}</span><span className="text-white">{isPro ? 'PRO ★' : 'FREE'}</span></div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{t('Miembro desde', 'Member since')}</span>
                <span className="text-white">{data?.user?.createdAt ? new Date(data.user.createdAt).toLocaleDateString(dateLocale, { month: 'short', year: 'numeric' }) : '—'}</span>
              </div>
              <div className="flex justify-between"><span className="text-zinc-500">{t('Racha', 'Streak')}</span><span style={{ color: 'var(--red)' }}>🔥 {stats?.streak ?? 0}{t('d', 'd')}</span></div>
            </div>
          </div>

          {/* YouTube channel card */}
          <div className="soft-card p-5">
            <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-4 flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--red)"><path d="M19.6 3H4.4C2.6 3 1 4.4 1 6.3v11.4C1 19.6 2.6 21 4.4 21h15.2c1.8 0 3.4-1.4 3.4-3.3V6.3C23 4.4 21.4 3 19.6 3zm-5.5 9.3l-6.3 3.5c-.3.2-.8 0-.8-.4V8.6c0-.4.5-.6.8-.4l6.3 3.5c.3.2.3.6 0 .6z"/></svg>
              {t('CANAL DE YOUTUBE', 'YOUTUBE CHANNEL')}
            </p>

            {ytConnected === null && (
              <div className="h-16 flex items-center justify-center">
                <svg className="animate-spin w-5 h-5 text-zinc-600" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/>
                </svg>
              </div>
            )}

            {ytConnected === false && (
              <div className="space-y-3">
                <p className="text-zinc-400 text-xs leading-relaxed">
                  {t('Conecta tu canal para ver tus estadísticas y los vídeos más recientes.', 'Connect your channel to see your stats and most recent videos.')}
                </p>
                <button onClick={handleYtConnect} disabled={ytConnecting}
                  className="btn-offset w-full py-2.5 text-[12px] font-mono-jb tracking-wider disabled:opacity-50 flex items-center justify-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M19.6 3H4.4C2.6 3 1 4.4 1 6.3v11.4C1 19.6 2.6 21 4.4 21h15.2c1.8 0 3.4-1.4 3.4-3.3V6.3C23 4.4 21.4 3 19.6 3zm-5.5 9.3l-6.3 3.5c-.3.2-.8 0-.8-.4V8.6c0-.4.5-.6.8-.4l6.3 3.5c.3.2.3.6 0 .6z"/></svg>
                  {ytConnecting ? t('Conectando...', 'Connecting...') : t('Conectar canal', 'Connect channel')}
                </button>
              </div>
            )}

            {ytConnected && ytChannel && (
              <div className="space-y-4">
                {/* Channel info */}
                <div className="flex items-center gap-3">
                  {ytChannel.thumbnail ? (
                    <img src={ytChannel.thumbnail} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold" style={{ background: 'var(--red)' }}>
                      {ytChannel.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate text-white">{ytChannel.name}</p>
                    <p className="font-mono-jb text-[10px] text-zinc-500">{t('Canal verificado', 'Verified channel')}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: t('Subs', 'Subs'),    value: fmtNum(ytChannel.subscribers) },
                    { label: t('Vistas', 'Views'),  value: fmtNum(ytChannel.totalViews) },
                    { label: t('Vídeos', 'Videos'), value: fmtNum(ytChannel.videoCount) },
                  ].map((s, i) => (
                    <div key={i} className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
                      <p className="font-display font-bold text-white text-base">{s.value}</p>
                      <p className="font-mono-jb text-[9px] text-zinc-600 uppercase">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Recent videos */}
                {ytVideos.length > 0 && (
                  <div>
                    <p className="font-mono-jb text-[9px] tracking-wider uppercase text-zinc-600 mb-2">{t('ÚLTIMOS VÍDEOS', 'RECENT VIDEOS')}</p>
                    <div className="space-y-2">
                      {ytVideos.slice(0, 3).map((v) => (
                        <a key={v.videoId} href={`https://youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 group hover:bg-white/[0.02] rounded-lg p-1.5 transition">
                          {v.thumbnail && <img src={v.thumbnail} alt="" className="w-12 h-8 object-cover rounded flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-zinc-300 line-clamp-1 group-hover:text-white transition leading-tight">{v.title}</p>
                            <p className="font-mono-jb text-[9px] text-zinc-600">{fmtNum(v.views)} {t('vistas', 'views')}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={handleYtDisconnect} disabled={ytDisconnecting}
                  className="font-mono-jb text-[10px] text-zinc-700 hover:text-zinc-500 transition disabled:opacity-50">
                  {ytDisconnecting ? t('Desconectando...', 'Disconnecting...') : t('Desconectar canal', 'Disconnect channel')}
                </button>
              </div>
            )}
          </div>

          {/* Upgrade card (Free) */}
          {!isPro && (
            <div className="relative rounded-2xl border p-6 overflow-hidden" style={{ borderColor: 'var(--red)', background: 'linear-gradient(180deg,rgba(232,77,91,0.15),rgba(0,0,0,0.6))', boxShadow: '0 18px 40px -16px rgba(232,77,91,0.5)' }}>
              <div className="absolute inset-0 grid-bg opacity-30" />
              <div className="relative">
                <div className="red-tape text-[10px] w-fit mb-3">PRO</div>
                <p className="font-display font-bold text-2xl leading-tight mb-3">{t('200 generaciones/mes', '200 generations/month')}</p>

                {/* Billing toggle */}
                <div className="flex items-center rounded-full border border-white/10 bg-black/40 font-mono-jb text-[10px] tracking-wider uppercase overflow-hidden mb-4 w-fit">
                  <button
                    onClick={() => setBillingPlan('monthly')}
                    className="px-3 py-1.5 transition"
                    style={{ background: billingPlan === 'monthly' ? 'var(--red)' : 'transparent', color: billingPlan === 'monthly' ? '#000' : '#a1a1aa' }}>
                    {t('Mensual', 'Monthly')}
                  </button>
                  <button
                    onClick={() => setBillingPlan('yearly')}
                    className="px-3 py-1.5 transition flex items-center gap-1.5"
                    style={{ background: billingPlan === 'yearly' ? 'var(--red)' : 'transparent', color: billingPlan === 'yearly' ? '#000' : '#a1a1aa' }}>
                    {t('Anual', 'Yearly')}
                    <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: billingPlan === 'yearly' ? 'rgba(0,0,0,0.25)' : 'rgba(232,77,91,0.25)', color: billingPlan === 'yearly' ? '#000' : 'var(--red)' }}>
                      -17%
                    </span>
                  </button>
                </div>

                {/* Price display */}
                {billingPlan === 'monthly' ? (
                  <div className="mb-4">
                    <span className="font-display font-bold text-3xl">9,99€</span>
                    <span className="text-zinc-400 font-mono-jb text-[11px] ml-1">/{t('mes', 'mo')}</span>
                  </div>
                ) : (
                  <div className="mb-4">
                    <span className="font-display font-bold text-3xl">99,99€</span>
                    <span className="text-zinc-400 font-mono-jb text-[11px] ml-1">/{t('año', 'yr')}</span>
                    <p className="font-mono-jb text-[10px] mt-1" style={{ color: '#7CFF00' }}>
                      {t('= 8,33€/mes · Ahorras 19,89€', '= €8.33/mo · Save €19.89')}
                    </p>
                  </div>
                )}

                <button onClick={() => handleUpgrade(billingPlan)} disabled={upgrading} className="btn-offset w-full px-4 py-2.5 text-[13px] font-display disabled:opacity-50">
                  {upgrading ? t('Redirigiendo...', 'Redirecting...') : billingPlan === 'yearly' ? t('Empezar anual →', 'Start yearly →') : t('Empezar con Pro →', 'Start with Pro →')}
                </button>
                <div className="mt-3 pt-3 border-t border-white/10">
                  <button onClick={handleSync} disabled={syncing}
                    className="w-full font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 hover:text-zinc-300 disabled:opacity-50 transition py-1">
                    {syncing ? t('Sincronizando...', 'Syncing...') : t('¿Ya pagaste? Sincronizar suscripción', 'Already paid? Sync subscription')}
                  </button>
                  {syncMsg && (
                    <p className="font-mono-jb text-[10px] mt-2 text-center" style={{ color: syncMsg.startsWith('✓') ? '#16a34a' : '#f87171' }}>
                      {syncMsg}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Activity sparkline */}
          <div className="soft-card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500">{t('Últimos 14 días', 'Last 14 days')}</p>
              <span className="font-mono-jb text-[10px]" style={{ color: 'var(--red)' }}>↗ {t('activo', 'active')}</span>
            </div>
            <div className="flex items-end gap-1 h-20">
              {[3,5,2,7,4,8,6,9,5,11,7,12,8,14].map((v, i) => (
                <div key={i} className="flex-1 relative" style={{ height: `${(v / 14) * 100}%` }}>
                  <div className="absolute inset-0 rounded-sm" style={{ background: i >= 10 ? 'var(--red)' : 'rgba(255,255,255,0.15)' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Tip */}
          <div className="rounded-2xl border border-dashed border-white/15 p-5" style={{ background: '#0C0C0E' }}>
            <p className="font-mono-jb text-[10px] tracking-wider uppercase mb-2" style={{ color: 'var(--yellow)' }}>★ {t('TIP DEL DÍA', 'TIP OF THE DAY')}</p>
            <p className="text-sm leading-relaxed text-zinc-300">
              {t(
                'Los títulos con un número específico (7, 23, 147) superan a los genéricos en un 36% de CTR. Prueba \u201c7 errores...\u201d la próxima vez.',
                'Titles with a specific number (7, 23, 147) outperform generic ones by 36% CTR. Try \u201c7 mistakes...\u201d next time.'
              )}
            </p>
          </div>
        </aside>
      </div>

      {/* Toast */}
      {ytToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl font-mono-jb text-sm shadow-2xl"
          style={{ background: ytToast.startsWith('✓') ? '#16a34a' : '#dc2626', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
          {ytToast}
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-6 mt-4">
        <div className="max-w-7xl mx-auto flex justify-center gap-6 font-mono-jb text-xs text-zinc-700">
          <a href="/terms" className="hover:text-zinc-500 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:text-zinc-500 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-500 transition">{t('Aviso Legal', 'Legal Notice')}</a>
        </div>
      </footer>

      {/* Video Preview Modal (generate new) */}
      {previewGen && (
        <Suspense fallback={null}>
          <VideoPreviewGenerator
            scriptContent={previewGen.output}
            generationId={previewGen.id}
            scriptTitle={previewGen.title ?? 'Script'}
            lang={lang}
            onClose={() => setPreviewGen(null)}
            onSaved={() => loadDbPreviews()}
          />
        </Suspense>
      )}

      {/* Playback modal — TV2 */}
      {playingPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(14px)' }}
          onClick={closePlayingPreview}>
          <div className="relative w-full my-auto" style={{ maxWidth: 560 }}
            onClick={e => e.stopPropagation()}>

            {/* Close */}
            <button onClick={closePlayingPreview}
              className="absolute -top-9 right-0 font-mono-jb text-[12px] text-zinc-500 hover:text-white transition flex items-center gap-1.5">
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
              {t('Cerrar', 'Close')}
            </button>

            {/* Title */}
            <p className="font-mono-jb text-[11px] text-zinc-500 truncate mb-3 text-center">"{playingPreview.title}"</p>

            {/* TV2 with video playing inside */}
            <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
              {/* Video behind the TV frame */}
              <div style={{
                position: 'absolute',
                left: '11%', top: '16%',
                width: '62%', height: '67%',
                zIndex: 1, overflow: 'hidden',
                background: '#000810',
              }}>
                <video
                  src={playingPreview.url}
                  autoPlay loop muted playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {/* CRT scanlines */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
                  background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
                }} />
                {/* Screen glare */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, width: '55%', height: '40%',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 60%)',
                  pointerEvents: 'none', zIndex: 6, borderRadius: '0 0 80% 0',
                }} />
              </div>
              {/* TV2 frame on top */}
              <img src="/TV2.webp" alt="" draggable={false}
                style={{ width: '100%', display: 'block', position: 'relative', zIndex: 10, userSelect: 'none', pointerEvents: 'none' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
