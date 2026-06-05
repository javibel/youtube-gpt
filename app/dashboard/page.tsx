'use client';

import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, lazy, useCallback } from 'react';
import { useLang } from '@/components/LangProvider';
import ReferralCard from '@/components/ReferralCard';

const VideoPreviewGenerator = lazy(() => import('@/components/VideoPreviewGenerator'));
const PlaybackModal = lazy(() => import('@/components/PlaybackModal'));

const TPL_ICONS: Record<string, string> = {
  title: '/icons/title.webp', description: '/icons/description.webp', caption: '/icons/caption.webp', thumbnail: '/icons/thumbnail.webp',
  script: '/icons/script.webp', shorts_hook: '/icons/lightning.webp', series: '/icons/clapperboard.webp', niche_analysis: '/icons/magnifying-glass.webp',
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
  { k: 'title',       icon: '/icons/title.webp', color: '#e84d5b', est: '8s' },
  { k: 'description', icon: '/icons/description.webp', color: '#00E5FF', est: '12s' },
  { k: 'script',      icon: '/icons/script.webp', color: '#FFE800', est: '30s' },
  { k: 'caption',     icon: '/icons/caption.webp', color: '#FF00AA', est: '10s' },
  { k: 'thumbnail',   icon: '/icons/thumbnail.webp', color: '#7CFF00', est: '5s' },
];

type Stats = {
  user: { email: string; name: string | null; createdAt: string };
  stats: {
    totalGenerations: number;
    generationsThisMonth: number;
    limit: number;
    remaining: number;
    isPro: boolean;
    plan: 'free' | 'pro' | 'business';
    streak: number;
  };
  subscription: { status: string; plan?: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null;
};

type Generation = { id: string; template: string; createdAt: string; tokensUsed: number; output: string; inputs: Record<string, string> };

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [billingPlan, setBillingPlan] = useState<'monthly'|'yearly'|'business_monthly'|'business_yearly'>('monthly');
  const [cancelling, setCancelling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('all');
  const [historyGens, setHistoryGens] = useState<Generation[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [existingReview, setExistingReview] = useState<{ rating: number; text: string; status: string } | null>(null);
  const lang = useLang();
  const [previewGen, setPreviewGen] = useState<{ id: string; output: string; title?: string } | null>(null);
  const [dailyTip, setDailyTip] = useState<{ es: string; en: string } | null>(null);

  type DbPreview = { id: string; title: string; mimeType: string; size: number; createdAt: string };
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

  const handleDeletePreview = useCallback(async (id: string) => {
    await fetch(`/api/video-previews/${id}`, { method: 'DELETE' });
    setDbPreviews((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleDownloadPreview = useCallback(async (p: DbPreview) => {
    setLoadingPreviewId(p.id);
    try {
      const res = await fetch(`/api/video-previews/${p.id}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${p.title}.webm`;
      a.click();
      URL.revokeObjectURL(url);
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
  const [ytExpired, setYtExpired]       = useState(false);
  const [ytConnecting, setYtConnecting] = useState(false);
  const [ytDisconnecting, setYtDisconnecting] = useState(false);
  const [ytToast, setYtToast]           = useState<string | null>(null);
  type GrowthData = { subs7d: number; subs30d: number; views7d: number; views30d: number; videos7d: number; videos30d: number };
  type StatsPoint = { subscribers: number; totalViews: number; recordedAt: string };
  const [ytGrowth, setYtGrowth] = useState<GrowthData | null>(null);
  const [ytSparkline, setYtSparkline] = useState<StatsPoint[]>([]);
  type VideoIdea = { title_es: string; title_en: string; idea_es: string; idea_en: string };
  const [dailyIdeas, setDailyIdeas] = useState<VideoIdea[] | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [onboardingName, setOnboardingName] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/user/stats').then((r) => r.json()).then(setData).finally(() => setLoading(false));
      fetch('/api/daily-tip').then((r) => r.json()).then((d) => { if (d.es) setDailyTip(d); });
      fetch('/api/user/generations?page=1').then((r) => r.json()).then((d) => {
        if (d.generations) { setHistoryGens(d.generations); setHistoryHasMore(d.hasMore); }
      });
      loadDbPreviews();
      fetch('/api/reviews').then((r) => r.json()).then((d) => {
        if (d.review) { setExistingReview(d.review); setReviewRating(d.review.rating); setReviewText(d.review.text); }
      });
      fetch('/api/onboarding').then(r => r.json()).then(d => {
        setOnboardingStep(d.step ?? 0);
        setOnboardingName(d.name || '');
      }).catch(() => {});
      fetch('/api/youtube/channel').then((r) => r.json()).then((d) => {
        if (d.connected) {
          setYtConnected(true);
          setYtExpired(false);
          setYtChannel(d.channel);
          setYtVideos(d.videos || []);
          // Fetch growth stats + daily ideas
          fetch('/api/youtube/stats').then(r => r.json()).then(s => {
            if (s.data) {
              setYtGrowth(s.data.growth);
              setYtSparkline(s.data.points);
            }
          }).catch(() => {});
          fetch('/api/daily-ideas').then(r => r.json()).then(d => {
            if (d.ideas) setDailyIdeas(d.ideas);
          }).catch(() => {});
        } else {
          setYtConnected(false);
          setYtExpired(!!d.expired);
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
    } else if (yt === 'pro_required') {
      setYtToast(lang === 'en' ? '✗ YouTube connect requires Pro plan' : '✗ Conectar YouTube requiere plan Pro');
      setTimeout(() => setYtToast(null), 5000);
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

  async function handleUpgrade(plan: 'monthly' | 'yearly' | 'business_monthly' | 'business_yearly' = billingPlan) {
    setUpgrading(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, lang }) });
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

  async function advanceOnboarding(step: number) {
    setOnboardingStep(step);
    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
    }).catch(() => {});
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-bg-0)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent spin-r" style={{ borderTopColor: 'var(--yv-brand)' }} />
      </div>
    );
  }

  if (!session) return null;

  const stats = data?.stats;
  const isPro = stats?.isPro ?? false;
  const userPlan = stats?.plan ?? 'free';
  const isBusiness = userPlan === 'business';
  const usedPct = stats ? Math.min((stats.generationsThisMonth / stats.limit) * 100, 100) : 0;
  const displayName = data?.user?.name ?? session.user?.email ?? 'User';
  const firstName = displayName.split(' ')[0];
  const dateLocale = lang === 'en' ? 'en-US' : 'es-ES';

  const filtered = filterType === 'all'
    ? historyGens
    : historyGens.filter((g) => g.template === filterType);

  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const tpl = (key: string) => TPL_LABELS[key]?.[lang] ?? key;

  const FILTERS = lang === 'en'
    ? [['all','All'],['title','Title'],['script','Script'],['description','Desc'],['thumbnail','Thumb'],['caption','Caption']]
    : [['all','Todo'],['title','Título'],['script','Script'],['description','Desc'],['thumbnail','Thumb'],['caption','Caption']];

  return (
    <DashboardShell>

      {/* Onboarding modal — 4 steps: Welcome → Connect YouTube → SEO Score → Generate */}
      {onboardingStep !== null && onboardingStep < 4 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-white/10 p-8" style={{ background: '#111114' }}>

            {/* Step 0: Welcome */}
            {onboardingStep === 0 && (
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(155,32,32,0.15)' }}>
                  <svg width="18" height="18" viewBox="7 7 18 18" fill="none">
                    <circle cx="16" cy="16" r="8" fill="#ee4d5e"/>
                  </svg>
                </div>
                <h2 className="font-display font-bold text-2xl text-white mb-2">
                  {t(`Bienvenid@ a YTubViral${onboardingName ? `, ${onboardingName.split(' ')[0]}` : ''}`, `Welcome to YTubViral${onboardingName ? `, ${onboardingName.split(' ')[0]}` : ''}`)}
                </h2>
                <p className="text-zinc-400 text-sm mb-8 max-w-sm mx-auto">
                  {t(
                    'Tu asistente de IA para crecer en YouTube. Vamos a configurar todo en 30 segundos.',
                    'Your AI assistant to grow on YouTube. Let\'s set everything up in 30 seconds.'
                  )}
                </p>

                {/* Progress dots */}
                <div className="flex justify-center gap-2 mb-6">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full" style={{ background: i === 0 ? 'var(--red)' : 'rgba(255,255,255,0.15)' }} />
                  ))}
                </div>

                {/* 3 features */}
                <div className="grid grid-cols-3 gap-3 mb-8 text-left">
                  {[
                    { icon: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z', es: 'Genera titulos, scripts y descripciones con IA', en: 'Generate titles, scripts & descriptions with AI' },
                    { icon: 'M11 11L11 2M11 11L2 11M11 11L20 11M11 11L11 20', es: 'Investiga keywords y analiza competidores', en: 'Research keywords & analyze competitors' },
                    { icon: 'M22 12h-4l-3 9L9 3l-3 9H2', es: 'SEO Score, mejor hora y mas con tu canal conectado', en: 'SEO Score, best time & more with your channel connected' },
                  ].map((f, i) => (
                    <div key={i} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" className="mb-2"><path d={f.icon}/></svg>
                      <p className="text-[13px] text-zinc-400 leading-snug">{t(f.es, f.en)}</p>
                    </div>
                  ))}
                </div>

                <button onClick={() => advanceOnboarding(1)} className="btn-offset px-10 py-3 text-sm font-display">
                  {t('Empezar', 'Get started')}
                </button>
              </div>
            )}

            {/* Step 1: Connect YouTube — THE critical step */}
            {onboardingStep === 1 && (
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,0,0,0.12)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 001.94-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.43z" fill="#FF0000"/><path d="M9.75 15.02l5.75-3.27-5.75-3.27v6.54z" fill="#fff"/></svg>
                </div>
                <div className="flex justify-center gap-2 mb-4">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full" style={{ background: i <= 1 ? 'var(--red)' : 'rgba(255,255,255,0.15)' }} />
                  ))}
                </div>
                <h2 className="font-display font-bold text-xl text-white mb-2">
                  {t('Conecta tu canal de YouTube', 'Connect your YouTube channel')}
                </h2>
                <p className="text-zinc-400 text-sm mb-3 max-w-sm mx-auto">
                  {t(
                    'Con tu canal conectado las herramientas se personalizan para ti: SEO Score, mejor hora para publicar, ideas diarias y mas.',
                    'With your channel connected, tools are personalized for you: SEO Score, best time to publish, daily ideas and more.'
                  )}
                </p>
                <p className="text-zinc-500 text-xs mb-6 max-w-xs mx-auto">
                  {t(
                    'Solo lectura — no publicamos ni modificamos nada en tu canal.',
                    'Read-only — we never publish or modify anything on your channel.'
                  )}
                </p>
                <div className="flex flex-col gap-2">
                  <button onClick={async () => { await advanceOnboarding(2); setYtConnecting(true); window.location.href = '/api/youtube/connect'; }} className="btn-offset px-8 py-3 text-sm font-display inline-flex items-center justify-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 001.94-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.43z" fill="currentColor"/><path d="M9.75 15.02l5.75-3.27-5.75-3.27v6.54z" fill="#111"/></svg>
                    {t('Conectar canal', 'Connect channel')}
                  </button>
                  <button onClick={() => advanceOnboarding(2)} className="text-zinc-600 text-[13px] font-mono-jb hover:text-zinc-400 transition py-2">
                    {t('Saltar por ahora', 'Skip for now')}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Try SEO Score */}
            {onboardingStep === 2 && (
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,229,255,0.12)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                </div>
                <div className="flex justify-center gap-2 mb-4">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full" style={{ background: i <= 2 ? 'var(--red)' : 'rgba(255,255,255,0.15)' }} />
                  ))}
                </div>
                <h2 className="font-display font-bold text-xl text-white mb-2">
                  {t('Analiza tu SEO', 'Analyze your SEO')}
                </h2>
                <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto">
                  {t(
                    'Pega la URL de cualquier video de YouTube y obtendras un analisis completo: titulo, descripcion, tags, puntuacion de 0 a 100 y sugerencias concretas.',
                    'Paste any YouTube video URL and get a full analysis: title, description, tags, score from 0 to 100 and specific suggestions.'
                  )}
                </p>
                <div className="flex flex-col gap-2">
                  <button onClick={async () => { await advanceOnboarding(3); router.push('/seo-score'); }} className="btn-offset px-8 py-3 text-sm font-display inline-flex items-center justify-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    {t('Probar SEO Score', 'Try SEO Score')}
                  </button>
                  <button onClick={() => advanceOnboarding(3)} className="text-zinc-600 text-[13px] font-mono-jb hover:text-zinc-400 transition py-2">
                    {t('Saltar por ahora', 'Skip for now')}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Generate a title */}
            {onboardingStep === 3 && (
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: 'rgba(155,32,32,0.15)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
                </div>
                <div className="flex justify-center gap-2 mb-4">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full" style={{ background: 'var(--red)' }} />
                  ))}
                </div>
                <h2 className="font-display font-bold text-xl text-white mb-2">
                  {t('Genera tu primer titulo', 'Generate your first title')}
                </h2>
                <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto">
                  {t(
                    'Escribe el tema de tu proximo video y la IA te genera titulos optimizados para clics y SEO. Tienes 10 generaciones gratis al mes.',
                    'Enter your next video topic and AI generates titles optimized for clicks and SEO. You get 10 free generations per month.'
                  )}
                </p>
                <button onClick={async () => { await advanceOnboarding(4); router.push('/generate'); }} className="btn-offset px-8 py-3 text-sm font-display inline-flex items-center justify-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
                  {t('Ir al generador', 'Go to generator')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="yv-page">
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('PANEL DE CONTROL', 'DASHBOARD')}</span>
            <h1 className="yv-page-header__title">{t('Buenas', 'Hey')}, {firstName}.</h1>
            <p className="yv-page-header__desc">{t('Tu motor de contenido te espera.', 'Your content engine is ready.')}</p>
          </div>
          <div className="yv-page-header__actions">
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
        </header>

        <div className="grid lg:grid-cols-[1fr_320px] gap-8 min-w-0">
        <main className="space-y-8 min-w-0">

          {/* Stat cards — or welcome card if brand new user */}
          {(stats?.totalGenerations ?? 0) === 0 ? (
            <a href="/generate" className="yv-card p-8 block group hover:border-[var(--yv-brand)] transition-colors">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(232,77,91,0.12)', border: '1px solid rgba(232,77,91,0.3)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--yv-brand)" strokeWidth="2"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-white mb-1">
                    {t('Tu primer paso: genera un título con IA', 'Your first step: generate a title with AI')}
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--yv-text-3)' }}>
                    {t('Escribe tu tema y en 8 segundos tendrás títulos optimizados para YouTube. Tienes 10 generaciones gratis.', 'Enter your topic and in 8 seconds you\'ll have YouTube-optimized titles. You have 10 free generations.')}
                  </p>
                  <span className="inline-flex items-center gap-1.5 mt-3 font-mono-jb text-[13px] group-hover:gap-2.5 transition-all" style={{ color: 'var(--yv-brand)' }}>
                    {t('Generar ahora', 'Generate now')} →
                  </span>
                </div>
              </div>
            </a>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: '/icons/rocket.webp', label: t('Este mes', 'This month'), num: `${stats?.generationsThisMonth ?? 0}`, sub: isBusiness ? '' : `/ ${stats?.limit}`, color: '#e84d5b' },
                { icon: '/icons/flame.webp', label: t('Racha', 'Streak'),        num: `${stats?.streak ?? 0}`,               sub: t('días', 'days'),    color: '#FFE800' },
                { icon: '/icons/bar-chart.webp', label: t('Total generado', 'Total generated'), num: `${stats?.totalGenerations ?? 0}`, sub: '', color: '#00E5FF' },
                { icon: '/icons/clock-fast.webp',  label: t('Tiempo ahorrado', 'Time saved'),    num: `${Math.round((stats?.totalGenerations ?? 0) * 0.06)}h`, sub: t('aprox.', 'approx.'), color: '#7CFF00' },
              ].map((s, i) => (
                <div key={i} className="yv-card p-5 relative">
                  <div className="flex items-center justify-between mb-4">
                    <img src={s.icon} alt="" width={84} height={84} style={{ filter: `drop-shadow(0 0 6px ${s.color}40)` }} />
                    <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>0{i + 1}</span>
                  </div>
                  <p className="font-display font-bold stat-num" style={{ fontSize: '36px', color: '#fff' }}>
                    {s.num}<span className="text-lg ml-1" style={{ color: 'var(--yv-text-3)' }}>{s.sub}</span>
                  </p>
                  <p className="font-mono-jb text-[13px] tracking-wider uppercase mt-2" style={{ color: 'var(--yv-text-2)' }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Usage */}
          <div className="yv-card p-6">
            {isBusiness ? (
              /* Business: unlimited — show monthly counter */
              <div className="flex items-center gap-6">
                <div className="flex items-center justify-center w-20 h-20 rounded-full" style={{ border: '3px solid #00E5FF' }}>
                  <span className="text-2xl font-bold" style={{ color: '#00E5FF' }}>{stats?.generationsThisMonth ?? 0}</span>
                </div>
                <div>
                  <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-1" style={{ color: 'var(--yv-text-2)' }}>
                    {t('Uso del plan', 'Plan usage')} · BUSINESS
                  </p>
                  <p className="text-sm" style={{ color: 'var(--yv-text-3)' }}>
                    {stats?.generationsThisMonth ?? 0} {t('generaciones este mes', 'generations this month')}
                  </p>
                  <p className="font-mono-jb text-[13px] mt-1 flex items-center gap-1.5" style={{ color: '#00E5FF' }}>
                    <span style={{ fontSize: '16px' }}>∞</span> {t('Ilimitado', 'Unlimited')}
                  </p>
                </div>
              </div>
            ) : (
              /* Free/Pro: percentage circle */
              <div className="flex items-center gap-6">
                <div className="relative w-20 h-20 flex-shrink-0">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                    <circle cx="40" cy="40" r="34" fill="none"
                      strokeWidth="6" strokeLinecap="round"
                      stroke={usedPct >= 85 ? '#ef4444' : 'var(--yv-brand)'}
                      strokeDasharray={`${2 * Math.PI * 34}`}
                      strokeDashoffset={`${2 * Math.PI * 34 * (1 - usedPct / 100)}`}
                      transform="rotate(-90 40 40)"
                      style={{ transition: 'stroke-dashoffset 0.7s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold">{Math.round(usedPct)}%</span>
                  </div>
                </div>
                <div>
                  <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-1" style={{ color: 'var(--yv-text-2)' }}>
                    {t('Uso del plan', 'Plan usage')} · {isPro ? 'PRO' : 'FREE'}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--yv-text-3)' }}>
                    {stats?.generationsThisMonth ?? 0}/{stats?.limit ?? 10} {t('generaciones', 'generations')}
                  </p>
                  <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-brand)' }}>
                    {stats?.remaining ?? 0} {t('restantes', 'remaining')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Subscription active */}
          {isPro && data?.subscription && (
            <div className="yv-card p-5 flex items-center justify-between gap-4" style={{ borderColor: isBusiness ? 'rgba(0,229,255,0.3)' : 'rgba(232,77,91,0.3)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: isBusiness ? '#00E5FF' : 'var(--yv-brand)' }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill={isBusiness ? 'black' : 'white'}><path d="M3 18h18M4 8l4 4 4-6 4 6 4-4-1 10H5z" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {isBusiness ? t('Plan Business activo', 'Active Business plan') : t('Plan Pro activo', 'Active Pro plan')}
                  </p>
                  {data.subscription.cancelAtPeriodEnd ? (
                    <p className="text-yellow-400 text-[13px] mt-0.5">
                      {t('No se renovará · Acceso hasta el', 'Will not renew · Access until')}{' '}
                      {data.subscription.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long' }) : '—'}
                    </p>
                  ) : (
                    <p className="text-[13px] mt-0.5" style={{ color: 'var(--yv-text-3)' }}>
                      {t('Renovación el', 'Renews on')}{' '}
                      {data.subscription.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long' }) : '—'}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isPro && !isBusiness && !data.subscription.cancelAtPeriodEnd && (
                  <button onClick={() => handleUpgrade('business_monthly')} disabled={upgrading} className="font-mono-jb text-[13px] transition" style={{ color: '#00E5FF' }}>
                    {upgrading ? '...' : t('Subir a Business', 'Upgrade to Business')}
                  </button>
                )}
                {!data.subscription.cancelAtPeriodEnd && (
                  <button onClick={handleCancel} disabled={cancelling} className="font-mono-jb text-[13px] hover:opacity-80 disabled:opacity-50 transition" style={{ color: 'var(--yv-text-4)' }}>
                    {cancelling ? t('Cancelando...', 'Cancelling...') : t('Cancelar suscripción', 'Cancel subscription')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Badges */}
          {(() => {
            const total = stats?.totalGenerations ?? 0;
            const streak = stats?.streak ?? 0;
            const badges = [
              { id: 'first',   icon: '/icons/spark.webp', label: t('Primera gen',   'First gen'),    desc: t('Genera tu primer contenido',       'Generate your first content'),        earned: total >= 1 },
              { id: 'ten',     icon: '/icons/bar-chart.webp', label: t('10 generados',  '10 generated'), desc: t('Alcanza 10 generaciones en total', 'Reach 10 total generations'),          earned: total >= 10 },
              { id: 'fifty',   icon: '/icons/lightning.webp', label: t('50 generados',  '50 generated'), desc: t('Alcanza 50 generaciones en total', 'Reach 50 total generations'),          earned: total >= 50 },
              { id: 'streak',  icon: '/icons/flame.webp', label: t('Racha 7d',      '7d streak'),    desc: t('Usa YTubViral 7 días seguidos',    'Use YTubViral 7 days in a row'),       earned: streak >= 7 },
              { id: 'pro',     icon: '/icons/crown.webp', label: 'Pro',                              desc: t('Activa el plan Pro',               'Activate Pro plan'),                  earned: isPro },
              { id: 'biz',     icon: '/icons/diamond.webp', label: 'Business',                         desc: t('Activa el plan Business',          'Activate Business plan'),             earned: isBusiness },
              { id: 'yt',      icon: '/icons/yt-play.webp', label: t('Canal YT',      'YT Channel'),   desc: t('Conecta tu canal de YouTube',      'Connect your YouTube channel'),       earned: isPro && ytConnected === true },
            ];
            const earnedCount = badges.filter(b => b.earned).length;
            return (
              <div className="yv-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-1" style={{ color: 'var(--yv-brand)' }}>ACHIEVEMENTS</p>
                    <h2 className="font-display font-bold text-lg">{t('Logros', 'Badges')}</h2>
                  </div>
                  <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{earnedCount}/{badges.length}</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                  {badges.map(b => (
                    <div key={b.id} title={b.desc}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition"
                      style={{
                        background: b.earned ? 'rgba(232,77,91,0.08)' : 'rgba(255,255,255,0.02)',
                        border: b.earned ? '1px solid rgba(232,77,91,0.3)' : '1px solid var(--line)',
                        opacity: b.earned ? 1 : 0.35,
                        filter: b.earned ? 'none' : 'grayscale(1)',
                      }}>
                      <img src={b.icon} alt="" width={84} height={84} />
                      <p className="font-mono-jb text-[13px] text-center leading-tight" style={{ color: b.earned ? '#fff' : '#6b7280' }}>{b.label}</p>
                      {b.earned && <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--yv-brand)' }} />}
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
                <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--yv-brand)' }}>QUICK · LAUNCH</p>
                <h2 className="font-display font-bold text-2xl">{t('¿Qué generamos hoy?', "What are we generating today?")}</h2>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {QUICK_TPLS.map((tplItem) => (
                <a key={tplItem.k} href={`/generate?template=${tplItem.k}`}
                  className="group relative text-left p-5 yv-card transition block"
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 28px -10px ${tplItem.color}80`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                >
                  <div className="w-20 h-20 rounded-lg flex items-center justify-center mb-4" style={{ background: tplItem.color + '22', border: `1px solid ${tplItem.color}` }}>
                    <img src={tplItem.icon} alt="" width={72} height={72} />
                  </div>
                  <p className="font-display font-bold text-sm">{tpl(tplItem.k)}</p>
                  <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-3)' }}>~{tplItem.est}</p>
                </a>
              ))}
            </div>
          </div>

          {/* Referral card */}
          <ReferralCard lang={lang} />

          {/* My Previews — TV3 decorative + title list */}
          {(isPro || dbPreviews.length > 0) && (
            <div>
              <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-2" style={{ color: '#00D9FF' }}>VIDEO TIPS</p>
              <h2 className="font-display font-bold text-2xl mb-4">{t('Mis previews', 'My previews')}</h2>
              <div className="yv-card p-5">
                <div className="flex gap-6 items-stretch flex-wrap sm:flex-nowrap">

                  {/* TV3 — decorative only, grows with list height */}
                  <img
                    src="/TV3.webp"
                    alt=""
                    draggable={false}
                    style={{ width: 'auto', maxWidth: 260, minWidth: 120, flexShrink: 0, userSelect: 'none', pointerEvents: 'none', opacity: 0.9, objectFit: 'contain', alignSelf: 'stretch' }}
                  />

                  {/* Preview list */}
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-3" style={{ color: 'var(--yv-text-4)' }}>
                      {t('Últimas generaciones', 'Latest previews')}
                    </p>

                    {dbPreviews.length === 0 ? (
                      <div className="py-6">
                        <p className="font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-4)' }}>
                          {t(
                            'Genera un script y pulsa "Generar Preview" para ver tu animación aquí.',
                            'Generate a script and click "Generate Preview" to see your animation here.',
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dbPreviews.map((p, i) => (
                          <div
                            key={p.id}
                            className="w-full flex items-center gap-3 p-3 rounded-xl transition group"
                            style={{
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            <span className="font-mono-jb text-[13px] w-5 text-center flex-shrink-0" style={{ color: '#3f3f46' }}>
                              {loadingPreviewId === p.id ? (
                                <svg className="animate-spin inline" width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#00D9FF" strokeWidth="3"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                              ) : i + 1}
                            </span>
                            <button
                              onClick={() => handleSelectPreview(p)}
                              disabled={loadingPreviewId === p.id}
                              className="flex-1 text-left font-mono-jb text-[13px] truncate hover:text-white transition disabled:opacity-60"
                              style={{ color: 'var(--yv-text-2)' }}
                            >
                              {p.title}
                            </button>
                            <span className="font-mono-jb text-[13px] flex-shrink-0" style={{ color: 'var(--yv-text-4)' }}>
                              {p.size > 0 ? `${(p.size / 1024).toFixed(0)}KB` : '—'}
                            </span>
                            {/* Download */}
                            <button
                              onClick={() => handleDownloadPreview(p)}
                              disabled={loadingPreviewId === p.id}
                              title={t('Descargar', 'Download')}
                              className="flex-shrink-0 opacity-30 hover:opacity-100 transition disabled:opacity-20"
                              style={{ color: '#00D9FF' }}
                            >
                              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                              </svg>
                            </button>
                            {/* Delete */}
                            <button
                              onClick={() => handleDeletePreview(p.id)}
                              disabled={loadingPreviewId === p.id}
                              title={t('Eliminar', 'Delete')}
                              className="flex-shrink-0 opacity-30 hover:opacity-100 transition disabled:opacity-20 hover:text-red-400"
                            >
                              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </div>
          )}

          {/* History — or quick-start cards for new users */}
          {(stats?.totalGenerations ?? 0) === 0 ? (
            <div>
              <div className="mb-4">
                <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--yv-brand)' }}>
                  {t('EMPIEZA AQUI', 'START HERE')}
                </p>
                <h2 className="font-display font-bold text-2xl">{t('Genera tu primer titulo viral', 'Generate your first viral title')}</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--yv-text-3)' }}>
                  {t('Empieza con una de estas herramientas', 'Start with one of these tools')}
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  {
                    href: '/generate',
                    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e84d5b" strokeWidth="2"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>,
                    color: '#e84d5b',
                    title: { es: 'Generar titulo', en: 'Generate title' },
                    desc: { es: 'Escribe tu tema y obtén títulos optimizados para clics y SEO en 8 segundos', en: 'Enter your topic and get click & SEO optimized titles in 8 seconds' },
                  },
                  {
                    href: '/seo-score',
                    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
                    color: '#00E5FF',
                    title: { es: 'SEO Score', en: 'SEO Score' },
                    desc: { es: 'Analiza cualquier video de YouTube y obtén una puntuación de 0 a 100 con sugerencias', en: 'Analyze any YouTube video and get a score from 0 to 100 with suggestions' },
                  },
                  {
                    href: '/generate?template=thumbnail',
                    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7CFF00" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
                    color: '#7CFF00',
                    title: { es: 'Miniatura con IA', en: 'AI Thumbnail' },
                    desc: { es: 'Genera miniaturas llamativas con inteligencia artificial para tu próximo video', en: 'Generate eye-catching AI thumbnails for your next video' },
                  },
                ].map((card, i) => (
                  <a key={i} href={card.href}
                    className="yv-card p-6 block group hover:border-[var(--yv-brand)] transition-colors">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                      style={{ background: `${card.color}15`, border: `1px solid ${card.color}30` }}>
                      {card.icon}
                    </div>
                    <h3 className="font-display font-bold text-base text-white mb-1">{card.title[lang]}</h3>
                    <p className="text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>{card.desc[lang]}</p>
                    <span className="inline-flex items-center gap-1.5 mt-3 font-mono-jb text-[13px] group-hover:gap-2.5 transition-all"
                      style={{ color: card.color }}>
                      {t('Probar', 'Try it')} →
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : (
          <div>
            <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
              <div>
                <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--yv-brand)' }}>HISTORY</p>
                <h2 className="font-display font-bold text-2xl">{t('Generaciones recientes', 'Recent generations')}</h2>
              </div>
              <div className="flex items-center rounded-full border border-white/10 bg-black font-mono-jb text-[13px] tracking-wider uppercase overflow-hidden">
                {FILTERS.map(([k, label]) => (
                  <button key={k} onClick={() => setFilterType(k)}
                    className="px-3 py-2 transition"
                    style={{ background: filterType === k ? 'var(--yv-brand)' : 'transparent', color: filterType === k ? '#000' : '#a1a1aa' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="yv-card overflow-hidden" style={{ borderRadius: '14px' }}>
              {!filtered.length ? (
                <div className="text-center py-12">
                  <p className="text-sm mb-3" style={{ color: 'var(--yv-text-4)' }}>{t('Aún no hay generaciones de este tipo', 'No generations of this type yet')}</p>
                  <a href="/generate" className="btn-offset px-5 py-2.5 text-sm font-display gap-2">
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
                    {t('Empezar a generar', 'Start generating')}
                  </a>
                </div>
              ) : (
                filtered.map((gen) => {
                  const isOpen = expandedId === gen.id;
                  const isCopied = copiedId === gen.id;
                  const color = TPL_COLORS[gen.template] ?? 'var(--yv-brand)';
                  return (
                    <div key={gen.id} className="hover:bg-white/[0.02] transition" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <button onClick={() => setExpandedId(isOpen ? null : gen.id)} className="w-full text-left p-5 flex items-start gap-4">
                        <span className="w-20 h-20 rounded-lg flex items-center justify-center border border-white/10 bg-black shrink-0">
                          <img src={TPL_ICONS[gen.template] ?? '/icons/description.webp'} alt="" width={72} height={72} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color }}>
                              {tpl(gen.template)}
                            </span>
                            <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>·</span>
                            <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
                              {new Date(gen.createdAt).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>·</span>
                            <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{gen.tokensUsed} tokens</span>
                          </div>
                          {gen.inputs?.tema && <p className="font-display font-semibold mt-0.5 truncate break-all">{gen.inputs.tema}</p>}
                          {gen.template === 'thumbnail' ? (
                            <p className="text-sm mt-0.5 truncate break-all" style={{ color: '#7CFF00' }}>{t('Miniatura generada', 'Generated thumbnail')}</p>
                          ) : (
                            <p className="text-sm mt-0.5 truncate break-all" style={{ color: 'var(--yv-text-3)' }}>{gen.output?.slice(0, 80)}</p>
                          )}
                        </div>
                        <span className="font-mono-jb text-[13px] transition shrink-0" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', color: 'var(--yv-text-3)' }}>▾</span>
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-5 page-enter">
                          {gen.template === 'thumbnail' && gen.output?.startsWith('http') ? (
                            <div className="ml-14 space-y-3">
                              <div className="rounded-xl overflow-hidden border border-white/10" style={{ maxWidth: 480 }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={gen.output} alt="Thumbnail" className="w-full h-auto" style={{ aspectRatio: '16/9', objectFit: 'cover' }} />
                              </div>
                              {gen.inputs?.imagePrompt && (
                                <details className="text-[13px] font-mono-jb" style={{ color: 'var(--yv-text-4)' }}>
                                  <summary className="cursor-pointer hover:text-white transition">{t('Ver prompt utilizado', 'View prompt used')}</summary>
                                  <p className="mt-2 p-3 rounded-lg" style={{ background: 'var(--yv-bg-0)', color: 'var(--yv-text-3)' }}>{gen.inputs.imagePrompt}</p>
                                </details>
                              )}
                            </div>
                          ) : (
                            <div className="ml-14 p-4 rounded-xl border border-white/10 bg-black font-mono-jb text-[13px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--yv-text-2)' }}>
                              {gen.output}
                            </div>
                          )}
                          <div className="ml-14 mt-3 flex items-center gap-2 flex-wrap">
                            {gen.template === 'thumbnail' && gen.output?.startsWith('http') ? (
                              <a href={gen.output} download="thumbnail.png" target="_blank" rel="noopener noreferrer" className="btn-offset px-3 py-1.5 text-[13px] font-display gap-1.5" style={{ borderColor: '#7CFF00', color: '#7CFF00' }}>
                                {t('Descargar', 'Download')}
                              </a>
                            ) : (
                              <button onClick={() => handleCopy(gen.id, gen.output)} className="btn-offset btn-offset-white px-3 py-1.5 text-[13px] font-display gap-1.5">
                                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>
                                {isCopied ? t('¡Copiado!', 'Copied!') : t('Copiar', 'Copy')}
                              </button>
                            )}
                            {isPro && gen.template === 'script' && (
                              <button
                                onClick={() => setPreviewGen({ id: gen.id, output: gen.output, title: gen.inputs?.tema ?? 'Script' })}
                                className="px-3 py-1.5 text-[13px] font-display gap-1.5 rounded-lg border transition flex items-center"
                                style={{ borderColor: 'rgba(0,217,255,0.35)', color: '#00D9FF', background: 'rgba(0,217,255,0.06)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,217,255,0.12)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,217,255,0.06)')}>
                                🎬 {t('Generar Preview', 'Generate Preview')}
                              </button>
                            )}
                            <a href="/generate" className="soft-pill px-3 py-1.5 text-[13px] font-mono-jb tracking-wider uppercase hover:text-white" style={{ color: 'var(--yv-text-2)' }}>
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

            {historyHasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={async () => {
                    setHistoryLoading(true);
                    const nextPage = historyPage + 1;
                    try {
                      const res = await fetch(`/api/user/generations?page=${nextPage}`);
                      const d = await res.json();
                      if (d.generations) {
                        setHistoryGens((prev) => [...prev, ...d.generations]);
                        setHistoryPage(nextPage);
                        setHistoryHasMore(d.hasMore);
                      }
                    } finally {
                      setHistoryLoading(false);
                    }
                  }}
                  disabled={historyLoading}
                  className="soft-pill px-5 py-2.5 text-sm font-mono-jb tracking-wider uppercase hover:text-white disabled:opacity-50" style={{ color: 'var(--yv-text-2)' }}>
                  {historyLoading ? t('Cargando...', 'Loading...') : t('Cargar más', 'Load more')}
                </button>
              </div>
            )}
          </div>
          )}

          {/* Review */}
          <div className="yv-card p-6">
            <p className="font-display font-bold text-lg mb-1">
              {existingReview ? t('Tu reseña', 'Your review') : t('Deja tu reseña', 'Leave a review')}
            </p>
            <p className="font-mono-jb text-[13px] mb-5" style={{ color: 'var(--yv-text-3)' }}>
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
                <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{reviewText.length}/400</span>
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
          <div className="yv-card p-5">
            <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-4" style={{ color: 'var(--yv-text-3)' }}>{t('Cuenta', 'Account')}</p>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-xl shrink-0"
                style={{ background: 'var(--yv-brand)', color: '#fff', boxShadow: '0 6px 18px -6px rgba(232,77,91,0.6)' }}>
                {displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{displayName}</p>
                <p className="font-mono-jb text-[13px] truncate" style={{ color: 'var(--yv-text-3)' }}>{data?.user?.email}</p>
              </div>
            </div>
            <div className="space-y-1.5 font-mono-jb text-[14px]">
              <div className="flex justify-between"><span style={{ color: 'var(--yv-text-3)' }}>{t('Plan', 'Plan')}</span><span className="text-white">{isPro ? 'PRO ★' : 'FREE'}</span></div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--yv-text-3)' }}>{t('Miembro desde', 'Member since')}</span>
                <span className="text-white">{data?.user?.createdAt ? new Date(data.user.createdAt).toLocaleDateString(dateLocale, { month: 'short', year: 'numeric' }) : '—'}</span>
              </div>
              <div className="flex justify-between"><span style={{ color: 'var(--yv-text-3)' }}>{t('Racha', 'Streak')}</span><span style={{ color: 'var(--yv-brand)' }} className="flex items-center gap-1"><img src="/icons/flame.webp" alt="" width={28} height={28} className="inline" /> {stats?.streak ?? 0}{t('d', 'd')}</span></div>
            </div>
          </div>

          {/* YouTube channel card */}
          <div className="yv-card p-5">
            <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-4 flex items-center gap-2" style={{ color: 'var(--yv-text-3)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--yv-brand)"><path d="M19.6 3H4.4C2.6 3 1 4.4 1 6.3v11.4C1 19.6 2.6 21 4.4 21h15.2c1.8 0 3.4-1.4 3.4-3.3V6.3C23 4.4 21.4 3 19.6 3zm-5.5 9.3l-6.3 3.5c-.3.2-.8 0-.8-.4V8.6c0-.4.5-.6.8-.4l6.3 3.5c.3.2.3.6 0 .6z"/></svg>
              {t('CANAL DE YOUTUBE', 'YOUTUBE CHANNEL')}
            </p>

            {/* Free users — upsell */}
            {!isPro && (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
                  {t('Conecta tu canal de YouTube y analiza tus estadísticas en tiempo real.', 'Connect your YouTube channel and track your stats in real time.')}
                </p>
                <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(232,77,91,0.06)', border: '1px solid rgba(232,77,91,0.2)' }}>
                  <p className="font-mono-jb text-[13px] mb-2" style={{ color: 'var(--yv-text-3)' }}>{t('Función exclusiva Pro', 'Pro exclusive feature')}</p>
                  <button onClick={() => handleUpgrade(billingPlan)}
                    className="btn-offset px-4 py-1.5 text-[13px] font-display">
                    {t('Activar Pro →', 'Activate Pro →')}
                  </button>
                </div>
              </div>
            )}

            {isPro && ytConnected === null && (
              <div className="h-16 flex items-center justify-center">
                <svg className="animate-spin w-5 h-5" style={{ color: 'var(--yv-text-4)' }} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/>
                </svg>
              </div>
            )}

            {isPro && ytConnected === false && (
              <div className="space-y-3">
                {ytExpired && (
                  <div className="rounded-lg px-3 py-2 font-mono-jb text-[13px]" style={{ background: 'rgba(255,200,0,0.07)', border: '1px solid rgba(255,200,0,0.2)', color: '#FFE800' }}>
                    {t('Sesión expirada. Vuelve a conectar tu canal.', 'Session expired. Please reconnect your channel.')}
                  </div>
                )}
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
                  {t('Conecta tu canal para ver tus estadísticas y los vídeos más recientes.', 'Connect your channel to see your stats and most recent videos.')}
                </p>
                <button onClick={handleYtConnect} disabled={ytConnecting}
                  className="btn-offset w-full py-2.5 text-[13px] font-mono-jb tracking-wider disabled:opacity-50 flex items-center justify-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M19.6 3H4.4C2.6 3 1 4.4 1 6.3v11.4C1 19.6 2.6 21 4.4 21h15.2c1.8 0 3.4-1.4 3.4-3.3V6.3C23 4.4 21.4 3 19.6 3zm-5.5 9.3l-6.3 3.5c-.3.2-.8 0-.8-.4V8.6c0-.4.5-.6.8-.4l6.3 3.5c.3.2.3.6 0 .6z"/></svg>
                  {ytConnecting ? t('Conectando...', 'Connecting...') : t('Conectar canal', 'Connect channel')}
                </button>
              </div>
            )}

            {isPro && ytConnected && ytChannel && (
              <div className="space-y-4">
                {/* Channel info */}
                <div className="flex items-center gap-3">
                  {ytChannel.thumbnail ? (
                    <img src={ytChannel.thumbnail} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold" style={{ background: 'var(--yv-brand)' }}>
                      {ytChannel.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate text-white">{ytChannel.name}</p>
                    <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{t('Canal verificado', 'Verified channel')}</p>
                  </div>
                </div>

                {/* Stats with growth */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: t('Subs', 'Subs'),    value: fmtNum(ytChannel.subscribers), delta: ytGrowth?.subs30d },
                    { label: t('Vistas', 'Views'),  value: fmtNum(ytChannel.totalViews), delta: ytGrowth?.views30d },
                    { label: t('Vídeos', 'Videos'), value: fmtNum(ytChannel.videoCount), delta: ytGrowth?.videos30d },
                  ].map((s, i) => (
                    <div key={i} className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
                      <p className="font-display font-bold text-white text-base">{s.value}</p>
                      <p className="font-mono-jb text-[13px] uppercase" style={{ color: 'var(--yv-text-4)' }}>{s.label}</p>
                      {s.delta != null && s.delta !== 0 && (
                        <p className="font-mono-jb text-[13px] mt-0.5" style={{ color: s.delta > 0 ? '#22c55e' : '#e84d5b' }}>
                          {s.delta > 0 ? '+' : ''}{fmtNum(s.delta)} <span style={{ color: 'var(--yv-text-4)' }}>30d</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Subscriber sparkline — interactive */}
                {ytSparkline.length > 2 && (() => {
                  const vals = ytSparkline.map(p => p.subscribers);
                  const min = Math.min(...vals);
                  const max = Math.max(...vals);
                  const range = max - min || 1;
                  const w = 200;
                  const h = 48;
                  const pad = 4;
                  const chartPoints = vals.map((v, i) => ({
                    x: (i / (vals.length - 1)) * w,
                    y: pad + (h - 2 * pad) - ((v - min) / range) * (h - 2 * pad),
                    val: v,
                    date: new Date(ytSparkline[i].recordedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric' }),
                  }));
                  const pts = chartPoints.map(p => `${p.x},${p.y}`).join(' ');
                  return (
                    <div>
                      <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-1" style={{ color: 'var(--yv-text-4)' }}>{t('SUSCRIPTORES (90 DÍAS)', 'SUBSCRIBERS (90 DAYS)')}</p>
                      <div className="relative" style={{ height: 48 }}>
                        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="48" preserveAspectRatio="none" className="rounded absolute inset-0">
                          <defs>
                            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#9B2020" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#9B2020" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#sparkFill)" />
                          <polyline points={pts} fill="none" stroke="#9B2020" strokeWidth="1.5" strokeLinejoin="round" />
                        </svg>
                        {/* Hover hitboxes */}
                        <div className="absolute inset-0 flex">
                          {chartPoints.map((p, i) => (
                            <div key={i} className="flex-1 relative group/dot" style={{ cursor: 'crosshair' }}>
                              {/* Tooltip */}
                              <div className="invisible group-hover/dot:visible absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap z-10 px-2 py-1 rounded text-[13px] font-mono-jb pointer-events-none" style={{ background: '#1a1a1e', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
                                <span style={{ color: '#9B2020' }}>{fmtNum(p.val)}</span> · {p.date}
                              </div>
                              {/* Dot indicator */}
                              <div className="invisible group-hover/dot:visible absolute w-[5px] h-[5px] rounded-full pointer-events-none" style={{ background: '#9B2020', border: '1.5px solid #0a0a0a', left: '50%', transform: 'translateX(-50%)', top: `${(p.y / h) * 100}%` }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Recent videos */}
                {ytVideos.length > 0 && (
                  <div>
                    <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-text-4)' }}>{t('ÚLTIMOS VÍDEOS', 'RECENT VIDEOS')}</p>
                    <div className="space-y-2">
                      {ytVideos.slice(0, 3).map((v) => (
                        <a key={v.videoId} href={`https://youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 group hover:bg-white/[0.02] rounded-lg p-1.5 transition">
                          {v.thumbnail && <img src={v.thumbnail} alt="" className="w-12 h-8 object-cover rounded flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] line-clamp-1 group-hover:text-white transition leading-tight" style={{ color: 'var(--yv-text-2)' }}>{v.title}</p>
                            <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{fmtNum(v.views)} {t('vistas', 'views')}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={handleYtDisconnect} disabled={ytDisconnecting}
                  className="font-mono-jb text-[13px] hover:opacity-80 transition disabled:opacity-50" style={{ color: 'var(--yv-text-4)' }}>
                  {ytDisconnecting ? t('Desconectando...', 'Disconnecting...') : t('Desconectar canal', 'Disconnect channel')}
                </button>
              </div>
            )}
          </div>

          {/* Upgrade card (Free) */}
          {!isPro && (
            <div className="relative rounded-2xl border p-6 overflow-hidden" style={{ borderColor: 'var(--yv-brand)', background: 'linear-gradient(180deg,rgba(232,77,91,0.15),rgba(0,0,0,0.6))', boxShadow: '0 18px 40px -16px rgba(232,77,91,0.5)' }}>
              <div className="absolute inset-0 grid-bg opacity-30" />
              <div className="relative">
                <p className="font-display font-bold text-2xl leading-tight mb-4">{t('Elige tu plan', 'Choose your plan')}</p>

                {/* Pro tier */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="red-tape text-[13px] w-fit">PRO</span>
                    <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{t('200 generaciones/mes', '200 generations/month')}</span>
                  </div>
                  <div className="flex items-center rounded-full border border-white/10 bg-black/40 font-mono-jb text-[13px] tracking-wider uppercase overflow-hidden mb-2 w-fit">
                    <button
                      onClick={() => setBillingPlan('monthly')}
                      className="px-3 py-1.5 transition"
                      style={{ background: billingPlan === 'monthly' ? 'var(--yv-brand)' : 'transparent', color: billingPlan === 'monthly' ? '#000' : '#a1a1aa' }}>
                      {t('Mensual', 'Monthly')}
                    </button>
                    <button
                      onClick={() => setBillingPlan('yearly')}
                      className="px-3 py-1.5 transition flex items-center gap-1.5"
                      style={{ background: billingPlan === 'yearly' ? 'var(--yv-brand)' : 'transparent', color: billingPlan === 'yearly' ? '#000' : '#a1a1aa' }}>
                      {t('Anual', 'Yearly')}
                      <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: billingPlan === 'yearly' ? 'rgba(0,0,0,0.25)' : 'rgba(232,77,91,0.25)', color: billingPlan === 'yearly' ? '#000' : 'var(--yv-brand)' }}>
                        -17%
                      </span>
                    </button>
                  </div>
                  {billingPlan === 'monthly' && (
                    <div className="mb-2">
                      <span className="font-display font-bold text-2xl">9,99€</span>
                      <span className="font-mono-jb text-[13px] ml-1" style={{ color: 'var(--yv-text-2)' }}>/{t('mes', 'mo')}</span>
                    </div>
                  )}
                  {billingPlan === 'yearly' && (
                    <div className="mb-2">
                      <span className="font-display font-bold text-2xl">99,99€</span>
                      <span className="font-mono-jb text-[13px] ml-1" style={{ color: 'var(--yv-text-2)' }}>/{t('año', 'yr')}</span>
                      <p className="font-mono-jb text-[13px] mt-1" style={{ color: '#7CFF00' }}>
                        {t('= 8,33€/mes · Ahorras 19,89€', '= €8.33/mo · Save €19.89')}
                      </p>
                    </div>
                  )}
                  {(billingPlan === 'monthly' || billingPlan === 'yearly') && (
                    <button onClick={() => handleUpgrade(billingPlan)} disabled={upgrading} className="btn-offset w-full px-4 py-2.5 text-[13px] font-display disabled:opacity-50">
                      {upgrading ? t('Redirigiendo...', 'Redirecting...') : billingPlan === 'yearly' ? t('Empezar Pro anual →', 'Start Pro yearly →') : t('Empezar con Pro →', 'Start with Pro →')}
                    </button>
                  )}
                </div>

                {/* Business tier */}
                <div className="mb-4 pt-4 border-t border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="rounded px-2 py-0.5 text-[13px] font-bold font-mono-jb tracking-wider uppercase" style={{ background: 'linear-gradient(90deg,#B388FF,#7C4DFF)', color: '#000' }}>BUSINESS</span>
                    <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{t('1000 generaciones/mes', '1000 generations/month')}</span>
                  </div>
                  <div className="flex items-center rounded-full border border-white/10 bg-black/40 font-mono-jb text-[13px] tracking-wider uppercase overflow-hidden mb-2 w-fit">
                    <button
                      onClick={() => setBillingPlan('business_monthly')}
                      className="px-3 py-1.5 transition"
                      style={{ background: billingPlan === 'business_monthly' ? '#7C4DFF' : 'transparent', color: billingPlan === 'business_monthly' ? '#000' : '#a1a1aa' }}>
                      {t('Mensual', 'Monthly')}
                    </button>
                    <button
                      onClick={() => setBillingPlan('business_yearly')}
                      className="px-3 py-1.5 transition flex items-center gap-1.5"
                      style={{ background: billingPlan === 'business_yearly' ? '#7C4DFF' : 'transparent', color: billingPlan === 'business_yearly' ? '#000' : '#a1a1aa' }}>
                      {t('Anual', 'Yearly')}
                      <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: billingPlan === 'business_yearly' ? 'rgba(0,0,0,0.25)' : 'rgba(124,77,255,0.25)', color: billingPlan === 'business_yearly' ? '#000' : '#7C4DFF' }}>
                        -17%
                      </span>
                    </button>
                  </div>
                  {billingPlan === 'business_monthly' && (
                    <div className="mb-2">
                      <span className="font-display font-bold text-2xl">29,99€</span>
                      <span className="font-mono-jb text-[13px] ml-1" style={{ color: 'var(--yv-text-2)' }}>/{t('mes', 'mo')}</span>
                    </div>
                  )}
                  {billingPlan === 'business_yearly' && (
                    <div className="mb-2">
                      <span className="font-display font-bold text-2xl">299€</span>
                      <span className="font-mono-jb text-[13px] ml-1" style={{ color: 'var(--yv-text-2)' }}>/{t('año', 'yr')}</span>
                      <p className="font-mono-jb text-[13px] mt-1" style={{ color: '#7CFF00' }}>
                        {t('= 24,92€/mes · Ahorras 60,88€', '= €24.92/mo · Save €60.88')}
                      </p>
                    </div>
                  )}
                  {(billingPlan === 'business_monthly' || billingPlan === 'business_yearly') && (
                    <button onClick={() => handleUpgrade(billingPlan)} disabled={upgrading} className="btn-offset w-full px-4 py-2.5 text-[13px] font-display disabled:opacity-50" style={{ background: 'linear-gradient(90deg,#B388FF,#7C4DFF)' }}>
                      {upgrading ? t('Redirigiendo...', 'Redirecting...') : billingPlan === 'business_yearly' ? t('Empezar Business anual →', 'Start Business yearly →') : t('Empezar con Business →', 'Start with Business →')}
                    </button>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-white/10">
                  <button onClick={handleSync} disabled={syncing}
                    className="w-full font-mono-jb text-[13px] tracking-wider uppercase hover:opacity-80 disabled:opacity-50 transition py-1" style={{ color: 'var(--yv-text-3)' }}>
                    {syncing ? t('Sincronizando...', 'Syncing...') : t('¿Ya pagaste? Sincronizar suscripción', 'Already paid? Sync subscription')}
                  </button>
                  {syncMsg && (
                    <p className="font-mono-jb text-[13px] mt-2 text-center" style={{ color: syncMsg.startsWith('✓') ? '#16a34a' : '#f87171' }}>
                      {syncMsg}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Activity sparkline */}
          <div className="yv-card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-3)' }}>{t('Últimos 14 días', 'Last 14 days')}</p>
              <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-brand)' }}>↗ {t('activo', 'active')}</span>
            </div>
            <div className="flex items-end gap-1 h-20">
              {[3,5,2,7,4,8,6,9,5,11,7,12,8,14].map((v, i) => (
                <div key={i} className="flex-1 relative" style={{ height: `${(v / 14) * 100}%` }}>
                  <div className="absolute inset-0 rounded-sm" style={{ background: i >= 10 ? 'var(--yv-brand)' : 'rgba(255,255,255,0.15)' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Chrome Extension card */}
          <div className="yv-card p-5">
            <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-4 flex items-center gap-2" style={{ color: 'var(--yv-text-3)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--yv-brand)" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h3v3H7z"/><path d="M14 7h3"/><path d="M14 11h3"/><path d="M7 14h10"/><path d="M7 18h10"/></svg>
              {t('EXTENSIÓN CHROME', 'CHROME EXTENSION')}
            </p>
            {isPro ? (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
                  {t(
                    'SEO score, detección de outliers, estadísticas de canal y títulos con IA — directamente en YouTube y YouTube Studio.',
                    'SEO score, outlier detection, channel stats and AI titles — directly on YouTube and YouTube Studio.'
                  )}
                </p>
                <div className="space-y-2">
                  {[
                    t('SEO score y checklist en cada vídeo', 'SEO score & checklist on every video'),
                    t('Panel SEO integrado en YouTube Studio', 'SEO panel integrated in YouTube Studio'),
                    t('Detección de outliers y métricas de canal', 'Outlier detection & channel metrics'),
                    t('Keywords, competencia y títulos con IA', 'Keywords, competition & AI titles'),
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-[13px]">
                      <span className="mt-0.5 shrink-0" style={{ color: 'var(--yv-brand)' }}>&#10003;</span>
                      <span style={{ color: 'var(--yv-text-2)' }}>{item}</span>
                    </div>
                  ))}
                </div>
                <a
                  href="https://chromewebstore.google.com/detail/ytubviral-para-youtube/gkjecjfhdmfbhhcemcjdkjkcdbljkcfh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-offset w-full py-2.5 text-[13px] font-display flex items-center justify-center gap-2"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                  {t('Instalar extensión', 'Install extension')}
                </a>
                <p className="font-mono-jb text-[13px] text-center" style={{ color: 'var(--yv-text-4)' }}>{t('Gratis con tu plan Pro', 'Free with your Pro plan')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
                  {t(
                    'SEO score, outliers, estadísticas de canal y títulos con IA directamente en YouTube y YouTube Studio.',
                    'SEO score, outliers, channel stats and AI titles directly on YouTube and YouTube Studio.'
                  )}
                </p>
                <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(232,77,91,0.06)', border: '1px solid rgba(232,77,91,0.2)' }}>
                  <p className="font-mono-jb text-[13px] mb-2" style={{ color: 'var(--yv-text-3)' }}>{t('Función exclusiva Pro', 'Pro exclusive feature')}</p>
                  <button onClick={() => handleUpgrade(billingPlan)}
                    className="btn-offset px-4 py-1.5 text-[13px] font-display">
                    {t('Activar Pro →', 'Activate Pro →')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Daily Ideas (personalized for Pro) or generic Tip */}
          {dailyIdeas && dailyIdeas.length > 0 ? (
            <div className="rounded-2xl border border-white/10 p-5" style={{ background: 'rgba(155,32,32,0.06)' }}>
              <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
                {t('IDEAS PARA HOY', 'IDEAS FOR TODAY')}
              </p>
              <div className="space-y-3">
                {dailyIdeas.slice(0, 5).map((idea, i) => (
                  <div key={i} className="group">
                    <p className="text-sm font-semibold text-white leading-tight">
                      {t(idea.title_es, idea.title_en)}
                    </p>
                    <p className="text-[13px] leading-snug mt-0.5" style={{ color: 'var(--yv-text-3)' }}>
                      {t(idea.idea_es, idea.idea_en)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 p-5" style={{ background: '#0C0C0E' }}>
              <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--yellow)' }}>★ {t('TIP DEL DÍA', 'TIP OF THE DAY')}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
                {dailyTip ? t(dailyTip.es, dailyTip.en) : t(
                  'Los títulos con un número específico (7, 23, 147) superan a los genéricos en un 36% de CTR. Prueba \u201c7 errores...\u201d la próxima vez.',
                  'Titles with a specific number (7, 23, 147) outperform generic ones by 36% CTR. Try \u201c7 mistakes...\u201d next time.'
                )}
              </p>
            </div>
          )}
        </aside>
        </div>
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
        <div className="yv-page flex justify-center gap-6 font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
          <a href="/terms" className="hover:opacity-80 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:opacity-80 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:opacity-80 transition">{t('Aviso Legal', 'Legal Notice')}</a>
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
        <Suspense fallback={null}>
          <PlaybackModal
            url={playingPreview.url}
            title={playingPreview.title}
            lang={lang}
            onClose={closePlayingPreview}
          />
        </Suspense>
      )}
    </DashboardShell>
  );
}
