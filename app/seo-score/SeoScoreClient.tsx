'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useLang } from '@/components/LangProvider';
import DashboardShell from '@/components/DashboardShell';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import ExtensionInstallBanner from '@/components/ExtensionInstallBanner';
import PublicNav from '@/components/PublicNav';
import { ImageIcon, LinkIcon } from '@/components/icons';

type Lang = 'es' | 'en';

interface CheckItem {
  key: string;
  label: { es: string; en: string };
  passed: boolean;
  detail: { es: string; en: string };
  weight: number;
}

interface VideoScore {
  videoId: string;
  title?: string;
  thumbnail?: string;
  publishedAt?: string;
  views?: number;
  score: number;
  checklist: CheckItem[];
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function fmtDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#FFE800';
  return '#e84d5b';
}

function scoreBg(score: number): string {
  if (score >= 70) return 'rgba(34,197,94,0.12)';
  if (score >= 40) return 'rgba(255,232,0,0.10)';
  return 'rgba(232,77,91,0.12)';
}

function scoreLabel(score: number, lang: Lang): string {
  if (score >= 70) return lang === 'en' ? 'Good' : 'Bien';
  if (score >= 40) return lang === 'en' ? 'Needs work' : 'Mejorable';
  return lang === 'en' ? 'Poor' : 'Bajo';
}

function VideoCard({ video, lang, expanded, onToggle }: { video: VideoScore; lang: Lang; expanded: boolean; onToggle: () => void }) {
  const aiTip = video.checklist.find(c => c.key === 'ai_tip');
  const checks = video.checklist.filter(c => c.key !== 'ai_tip' && c.key !== 'thumbnail_quality');
  const allScored = video.checklist.filter(c => c.weight > 0);
  const passed = allScored.filter(c => c.passed).length;
  const total = allScored.length;
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <div className="yv-card overflow-hidden transition-all p-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.03] transition"
      >
        {video.thumbnail && (
          <img src={video.thumbnail} alt="" className="w-28 h-16 rounded-lg object-cover flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-display font-semibold text-sm truncate">{video.title || video.videoId}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
              {fmtNum(video.views)} {t('vistas', 'views')}
            </span>
            {video.publishedAt && (
              <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                {fmtDate(video.publishedAt, lang)}
              </span>
            )}
            <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
              {passed}/{total} {t('checks', 'checks')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div
            className="min-w-[4rem] px-3 h-14 rounded-xl flex flex-col items-center justify-center font-mono-jb"
            style={{ background: scoreBg(video.score), border: `1px solid ${scoreColor(video.score)}33` }}
          >
            <span className="text-lg font-bold" style={{ color: scoreColor(video.score) }}>{video.score}</span>
            <span className="text-[11px] whitespace-nowrap" style={{ color: scoreColor(video.score), opacity: 0.7 }}>{scoreLabel(video.score, lang)}</span>
          </div>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            style={{ color: 'var(--yv-text-3)' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {expanded && (() => {
        const thumbAi = video.checklist.find(c => c.key === 'thumbnail_quality');
        const scoredChecks = checks.filter(c => c.weight > 0);
        const failedFirst = [...scoredChecks].sort((a, b) => {
          if (a.passed === b.passed) return b.weight - a.weight;
          return a.passed ? 1 : -1;
        });

        return (
          <div className="border-t p-4 space-y-2" style={{ borderColor: 'var(--yv-border)' }}>
            {aiTip && (
              <div className="mb-4 p-3 rounded-lg border border-purple-500/30" style={{ background: 'rgba(139,92,246,0.08)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                  </svg>
                  <span className="font-mono-jb text-[13px] tracking-wider text-purple-400 uppercase">
                    {t('Consejo IA', 'AI Tip')}
                  </span>
                </div>
                <p className="text-sm font-mono-jb" style={{ color: 'var(--yv-text-2)' }}>
                  {lang === 'en' ? aiTip.detail.en : aiTip.detail.es}
                </p>
              </div>
            )}
            {thumbAi && (
              <div className="mb-4 p-3 rounded-lg border" style={{
                borderColor: thumbAi.passed ? 'rgba(34,197,94,0.3)' : 'rgba(232,77,91,0.3)',
                background: thumbAi.passed ? 'rgba(34,197,94,0.06)' : 'rgba(232,77,91,0.06)',
              }}>
                <div className="flex items-center gap-2 mb-1">
                  <ImageIcon size={14} />
                  <span className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: thumbAi.passed ? '#22c55e' : '#e84d5b' }}>
                    {t('Análisis de thumbnail (IA)', 'Thumbnail analysis (AI)')}
                  </span>
                </div>
                <p className="text-sm font-mono-jb" style={{ color: 'var(--yv-text-2)' }}>
                  {lang === 'en' ? thumbAi.detail.en : thumbAi.detail.es}
                </p>
              </div>
            )}
            {failedFirst.map(check => (
              <div
                key={check.key}
                className="flex items-start gap-3 p-3 rounded-lg"
                style={{ background: check.passed ? 'rgba(34,197,94,0.05)' : 'rgba(232,77,91,0.05)' }}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {check.passed ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e84d5b" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-display font-medium">{lang === 'en' ? check.label.en : check.label.es}</p>
                  <p className="text-[13px] font-mono-jb mt-0.5" style={{ color: 'var(--yv-text-3)' }}>{lang === 'en' ? check.detail.en : check.detail.es}</p>
                </div>
                {check.weight > 0 && (
                  <span className="flex-shrink-0 font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                    {t('peso', 'weight')}: {check.weight}
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

function SeoScoreContent() {
  const { data: session, status } = useSession();
  const lang = useLang();
  const isAuthed = status === 'authenticated';

  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlResult, setUrlResult] = useState<VideoScore | null>(null);
  const [urlError, setUrlError] = useState('');

  const [channelLoading, setChannelLoading] = useState(false);
  const [channelScores, setChannelScores] = useState<VideoScore[]>([]);
  const [channelError, setChannelError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hasLoadedChannel, setHasLoadedChannel] = useState(false);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  // Autorun desde el onboarding: /seo-score?url=... analiza directamente
  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get('url');
    if (u) {
      setUrlInput(u);
      handleUrlAnalyze(undefined, u);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    fetch('/api/youtube/seo-score')
      .then(r => r.json())
      .then(data => {
        if (data.scores?.length) setChannelScores(data.scores);
        setHasLoadedChannel(true);
      })
      .catch(() => setHasLoadedChannel(true));
  }, [isAuthed]);

  async function handleUrlAnalyze(e?: React.FormEvent, overrideUrl?: string) {
    e?.preventDefault();
    const url = (overrideUrl ?? urlInput).trim();
    if (!url) return;
    setUrlLoading(true);
    setUrlError('');
    setUrlResult(null);
    try {
      const res = await fetch('/api/youtube/seo-score-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msgs: Record<string, string> = {
          invalid_url: t('URL no válida. Pega un enlace de YouTube.', 'Invalid URL. Paste a YouTube link.'),
          video_not_found: t('Video no encontrado. Verifica el enlace.', 'Video not found. Check the link.'),
          url_required: t('Pega un enlace de YouTube.', 'Paste a YouTube link.'),
        };
        setUrlError(msgs[data.error] || data.error || 'Error');
        return;
      }
      setUrlResult(data);
      setExpanded(data.videoId);
    } catch {
      setUrlError(t('Error de conexión', 'Connection error'));
    } finally {
      setUrlLoading(false);
    }
  }

  async function handleChannelAnalyze() {
    setChannelLoading(true);
    setChannelError('');
    try {
      const res = await fetch('/api/youtube/seo-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'pro_required') {
          setChannelError(t('Esta función requiere el plan Pro.', 'This feature requires the Pro plan.'));
        } else if (data.error === 'youtube_not_connected') {
          setChannelError(t('Conecta tu canal de YouTube primero desde el Dashboard.', 'Connect your YouTube channel first from the Dashboard.'));
        } else {
          setChannelError(data.error || 'Error');
        }
        return;
      }
      setChannelScores(data.scores || []);
    } catch {
      setChannelError(t('Error de conexión', 'Connection error'));
    } finally {
      setChannelLoading(false);
    }
  }

  const allScores = [
    ...(urlResult ? [urlResult] : []),
    ...channelScores.filter(s => s.videoId !== urlResult?.videoId),
  ];
  const avgScore = allScores.length ? Math.round(allScores.reduce((s, v) => s + v.score, 0) / allScores.length) : 0;

  return (
    <div className="yv-page">
      <div className="yv-page-header mb-10">
        <div className="yv-page-header__left">
          <span className="yv-page-header__eyebrow">{t('ANÁLISIS SEO', 'SEO ANALYSIS')}</span>
          <h1 className="yv-page-header__title">
            SEO Score{' '}
            <span style={{ color: 'var(--yv-brand)' }}>{t('de cualquier vídeo.', 'for any video.')}</span>
          </h1>
          <p className="yv-page-header__desc">
            {t(
              'Pega el enlace de cualquier vídeo de YouTube y obtén un análisis SEO completo con puntuación de 0 a 100 y recomendaciones específicas con IA.',
              'Paste any YouTube video link and get a complete SEO analysis with a 0-100 score and AI-powered specific recommendations.'
            )}
          </p>
          {/* Disclosure requerido por YouTube API Developer Policies III.E.4.h (métricas derivadas) */}
          <p className="text-zinc-600 text-[12px] mt-2">
            {t(
              'El SEO Score es una métrica propia de YTubViral calculada a partir de datos de la API de YouTube — no es un dato oficial de YouTube.',
              'The SEO Score is YTubViral\'s own metric calculated from YouTube API data — it is not an official YouTube metric.'
            )}
          </p>
        </div>
      </div>

      <form onSubmit={handleUrlAnalyze} className="mb-8">
        {/* Apilado en móvil: en fila el botón se salía del viewport a 375px (E3) */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder={t('Pega un enlace de YouTube...', 'Paste a YouTube link...')}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-mono-jb"
            style={{
              background: 'var(--yv-surface)',
              border: '1px solid var(--yv-border)',
              color: 'var(--yv-text)',
              outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--yv-brand)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--yv-border)'; }}
          />
          <button
            type="submit"
            disabled={urlLoading || !urlInput.trim()}
            className="btn-offset px-8 py-3 text-sm font-mono-jb tracking-wider flex-shrink-0"
            style={{ borderRadius: '10px', opacity: !urlInput.trim() ? 0.5 : 1 }}
          >
            {urlLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('Analizando...', 'Analyzing...')}
              </span>
            ) : (
              t('Analizar', 'Analyze')
            )}
          </button>
        </div>
      </form>

      {urlError && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-mono-jb">
          {urlError}
        </div>
      )}

      {isAuthed && (
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={handleChannelAnalyze}
            disabled={channelLoading}
            className="px-6 py-2.5 text-sm font-mono-jb tracking-wider rounded-xl transition"
            style={{
              background: 'var(--yv-surface)',
              border: '1px solid var(--yv-border)',
              color: 'var(--yv-text-2)',
            }}
          >
            {channelLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('Analizando canal...', 'Analyzing channel...')}
              </span>
            ) : (
              t('Analizar mis vídeos (Pro)', 'Analyze my videos (Pro)')
            )}
          </button>
          {allScores.length > 0 && (
            <div className="flex items-center gap-3">
              <div
                className="px-4 py-2 rounded-lg font-mono-jb text-sm font-bold"
                style={{ background: scoreBg(avgScore), color: scoreColor(avgScore), border: `1px solid ${scoreColor(avgScore)}33` }}
              >
                {t('Media', 'Average')}: {avgScore}/100
              </div>
              <span className="text-[13px] font-mono-jb" style={{ color: 'var(--yv-text-4)' }}>
                {allScores.length} {t('vídeos', 'videos')}
              </span>
            </div>
          )}
        </div>
      )}

      {channelError && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-mono-jb">
          {channelError}
        </div>
      )}

      {!urlResult && (!isAuthed || (hasLoadedChannel && channelScores.length === 0)) && !urlLoading && !channelLoading && (
        <div className="text-center py-20">
          <div className="mb-4"><img src="/icons/bar-chart.webp" alt="" width={56} height={56} className="inline-block object-contain" /></div>
          <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
            {t(
              'Pega el enlace de cualquier vídeo de YouTube para obtener su SEO Score gratis.',
              'Paste any YouTube video link to get its SEO Score for free.'
            )}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {allScores.map(video => (
          <VideoCard
            key={video.videoId}
            video={video}
            lang={lang}
            expanded={expanded === video.videoId}
            onToggle={() => setExpanded(expanded === video.videoId ? null : video.videoId)}
          />
        ))}
      </div>

      {urlResult && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => {
              const text = lang === 'en'
                ? `My YouTube video scored ${urlResult.score}/100 on SEO! Check yours free:`
                : `Mi vídeo de YouTube tiene ${urlResult.score}/100 en SEO! Comprueba el tuyo gratis:`;
              const shareUrl = `https://ytubviral.com/seo-score?url=https://youtube.com/watch?v=${urlResult.videoId}`;
              if (navigator.share) {
                navigator.share({ text, url: shareUrl }).catch(() => {});
              } else {
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
              }
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-mono-jb text-[13px] transition hover:brightness-110"
            style={{ background: 'rgba(29,155,240,0.1)', border: '1px solid rgba(29,155,240,0.3)', color: '#1d9bf0' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            {t('Compartir mi score', 'Share my score')}
          </button>
        </div>
      )}

      {!isAuthed && urlResult && (
        <div className="mt-10 p-8 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.06), rgba(0,229,255,0.04))', border: '1px solid rgba(232,77,91,0.2)' }}>
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
            {t('SOLO HAS VISTO 1 DE 14 HERRAMIENTAS', 'YOU JUST SAW 1 OF 14 TOOLS')}
          </p>
          <p className="font-display font-bold text-white text-xl mb-2">
            {t('Genera títulos, scripts y descripciones virales con IA', 'Generate viral titles, scripts & descriptions with AI')}
          </p>
          <p className="font-mono-jb text-sm mb-5" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              '10 generaciones gratis al mes. Sin tarjeta de crédito.',
              '10 free generations per month. No credit card required.'
            )}
          </p>
          <a href="/signup" className="btn-offset inline-flex px-8 py-3.5 text-sm font-display font-bold">
            {t('Crear cuenta gratis →', 'Create free account →')}
          </a>
          <p className="mt-3 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-4)' }}>
            {t('Ya tienes cuenta?', 'Already have an account?')}{' '}
            <a href="/login" className="underline" style={{ color: 'var(--yv-text-2)' }}>{t('Inicia sesión', 'Sign in')}</a>
          </p>
        </div>
      )}
    </div>
  );
}

export default function SeoScoreClient() {
  const { status } = useSession();
  const lang = useLang();

  if (status === 'loading') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <PublicNav />
        <div className="max-w-4xl mx-auto px-6 py-10">
          <SeoScoreContent />
          <ExtensionInstallBanner lang={lang} />
          <p className="text-center mt-6 text-[13px] font-mono-jb">
            <a href="/title-analyzer" className="text-zinc-500 hover:text-white transition-colors underline underline-offset-2 inline-flex items-center gap-1.5">
              <img src="/icons/title.webp" alt="" width={14} height={14} className="object-contain" /> {lang === 'en' ? 'Analyze your title before publishing — free →' : 'Analiza tu título antes de publicar — gratis →'}
            </a>
          </p>
          <p className="text-center mt-2 text-[13px] font-mono-jb">
            <a href="/embed" className="text-zinc-500 hover:text-white transition-colors underline underline-offset-2 inline-flex items-center gap-1.5">
              <LinkIcon size={13} /> {lang === 'en' ? 'Add this free SEO analyzer to your website →' : 'Añade este analizador SEO gratis a tu web →'}
            </a>
          </p>
        </div>
        <ExitIntentPopup lang={lang} />
      </div>
    );
  }

  return (
    <DashboardShell>
      <SeoScoreContent />
    </DashboardShell>
  );
}
