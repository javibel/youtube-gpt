'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useLang } from '@/components/LangProvider';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';

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

interface VolumeEstimate {
  score: number;
  label: string;
  labelEn: string;
  range: string;
  rangeEn: string;
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
  volumeEstimate?: VolumeEstimate;
}

interface QuestionItem {
  question: string;
  competition: 'low' | 'medium' | 'high';
  competitionScore: number;
  totalResults: number;
  topVideo: {
    videoId: string; title: string; channelName: string;
    thumbnail: string; views: number;
  } | null;
}
interface QuestionsResult {
  keyword: string;
  questions: QuestionItem[];
}

type ResearchTab = 'keywords' | 'questions';

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
      <span className="font-mono-jb text-[13px] tracking-[0.2em] uppercase" style={{ color: 'var(--yv-text-3)' }}>{label}</span>
    </div>
  );
}

function ResearchPageInner() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const lang = useLang();
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noApiKey, setNoApiKey] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<ResearchTab>('keywords');
  const [questionsResult, setQuestionsResult] = useState<QuestionsResult | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  // No redirect — show public landing if unauthenticated

  useEffect(() => {
    const q = searchParams.get('q');
    const tab = searchParams.get('tab');
    if (tab === 'questions') setActiveTab('questions');
    if (q && status === 'authenticated') {
      setKeyword(q);
      if (tab === 'questions') handleQuestionsSearch(q);
      else handleSearch(q);
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
        if (data.error === 'pro_required') {
          setError(t('Esta función es exclusiva del Plan Pro. Actualiza tu cuenta desde el dashboard.', 'This feature is exclusive to the Pro Plan. Upgrade your account from the dashboard.'));
          return;
        }
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

  const handleQuestionsSearch = async (kw?: string) => {
    const q = (kw ?? keyword).trim();
    if (!q) return;
    setQuestionsLoading(true);
    setQuestionsResult(null);
    setError(null);
    setNoApiKey(false);

    try {
      const res = await fetch('/api/research/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q, lang }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'no_api_key') { setNoApiKey(true); return; }
        if (data.error === 'pro_required') {
          setError(t('Esta función es exclusiva del Plan Pro. Actualiza tu cuenta desde el dashboard.', 'This feature is exclusive to the Pro Plan. Upgrade your account from the dashboard.'));
          return;
        }
        setError(data.error || t('Error desconocido', 'Unknown error'));
        return;
      }
      setQuestionsResult(data);
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleTabSearch = (kw?: string) => {
    if (activeTab === 'keywords') handleSearch(kw);
    else handleQuestionsSearch(kw);
  };

  if (status === 'loading') return null;

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <header className="border-b" style={{ borderColor: 'var(--line)', background: 'rgba(10,10,10,0.92)' }}>
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="7 7 18 18" fill="none">
                <circle cx="16" cy="16" r="8" fill="#e84d5b"/>
              </svg>
              <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--yv-brand)' }}>.</span>com</span>
            </a>
            <div className="flex items-center gap-3">
              <a href="/login" className="font-mono-jb text-[13px] tracking-wider hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>{t('Iniciar sesión', 'Sign in')}</a>
              <a href="/signup" className="btn-offset px-4 py-1.5 text-[13px] font-display">{t('Crear cuenta gratis', 'Sign up free')}</a>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-6" style={{ color: 'var(--yv-brand)' }}>KEYWORD RESEARCH</p>
          <h1 className="font-display font-bold text-4xl md:text-5xl mb-6 leading-tight">
            {t('Encuentra las keywords que', 'Find the keywords that')}
            <span style={{ color: 'var(--yv-brand)' }}> {t('disparan tus vistas', 'skyrocket your views')}</span>
          </h1>
          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
            {t(
              'Analiza volumen de búsqueda, competencia y oportunidad de cualquier keyword en YouTube. Descubre los vídeos top y keywords relacionadas para posicionar tus vídeos.',
              'Analyze search volume, competition and opportunity for any YouTube keyword. Discover top videos and related keywords to rank your videos.'
            )}
          </p>

          {/* Feature highlights */}
          <div className="grid md:grid-cols-3 gap-5 mb-14 text-left">
            {[
              { icon: '/icons/magnifying-glass.webp', title: t('Análisis de competencia', 'Competition analysis'), desc: t('Score de competencia y oportunidad para cada keyword', 'Competition and opportunity score for each keyword') },
              { icon: '/icons/bar-chart.webp', title: t('Vídeos top', 'Top videos'), desc: t('Los vídeos mejor posicionados con sus métricas reales', 'Top ranking videos with their real metrics') },
              { icon: '/icons/bulb.webp', title: t('Keywords relacionadas', 'Related keywords'), desc: t('Descubre términos que tu audiencia también busca', 'Discover terms your audience also searches for') },
            ].map(f => (
              <div key={f.title} className="yv-card p-5">
                <img src={f.icon} alt="" width={32} height={32} className="object-contain mb-3" />
                <h3 className="font-display font-bold text-sm mb-1">{f.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Mock search bar */}
          <div className="max-w-xl mx-auto mb-8">
            <div className="yv-card p-1.5 flex items-center gap-2" style={{ opacity: 0.6 }}>
              <div className="flex-1 px-4 py-3 text-sm text-left" style={{ color: 'var(--yv-text-4)' }}>{t('Ej: "como ganar dinero en YouTube"', 'E.g. "how to make money on YouTube"')}</div>
              <div className="px-5 py-3 rounded-lg font-display font-bold text-sm" style={{ background: 'var(--yv-brand)', color: '#fff' }}>{t('Buscar', 'Search')}</div>
            </div>
          </div>

          <a href="/signup" className="btn-offset inline-flex px-8 py-3 text-sm font-display">
            {t('Empieza gratis →', 'Start free →')}
          </a>
          <p className="text-[13px] mt-4" style={{ color: 'var(--yv-text-4)' }}>{t('Sin tarjeta de crédito. 10 generaciones/mes gratis.', 'No credit card. 10 generations/month free.')}</p>
        </div>
      </div>
    );
  }

  const comp = result ? COMPETITION_CONFIG[result.competition] : null;

  return (
    <DashboardShell>
      <div className="yv-page">

        {/* Page header */}
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('INVESTIGACIÓN DE PALABRAS CLAVE', 'KEYWORD RESEARCH')}</span>
            <h1 className="yv-page-header__title">
              {t('Encuentra keywords ', 'Find keywords ')}
              <span style={{ color: 'var(--yv-brand)' }}>{t('que posicionan.', 'that rank.')}</span>
            </h1>
            <p className="yv-page-header__desc">
              {t(
                'Datos reales de YouTube: competencia, vistas medias y los 5 vídeos más vistos para cualquier keyword.',
                'Real YouTube data: competition level, average views, and the top 5 ranking videos for any keyword.'
              )}
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl max-w-xs" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)' }}>
          {(['keywords', 'questions'] as ResearchTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 px-4 py-2 rounded-lg font-mono-jb text-[13px] tracking-wider transition-all"
              style={{
                background: activeTab === tab ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: activeTab === tab ? '#fff' : 'var(--text-dim)',
                border: activeTab === tab ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
              }}
            >
              {tab === 'keywords'
                ? t('Keywords', 'Keywords')
                : t('Preguntas', 'Questions')}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="flex gap-3 mb-10 max-w-2xl">
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTabSearch()}
            placeholder={activeTab === 'keywords'
              ? t('Ej: cómo ganar dinero en YouTube', 'Eg: how to grow a YouTube channel')
              : t('Ej: minecraft, cocina vegana, fitness', 'Eg: minecraft, vegan cooking, fitness')}
            className="soft-field flex-1 text-base"
            style={{ borderRadius: '10px' }}
          />
          <button
            onClick={() => handleTabSearch()}
            disabled={(loading || questionsLoading) || !keyword.trim()}
            className="btn-offset px-6 py-3 text-sm font-mono-jb tracking-wider"
            style={{ borderRadius: '10px', minWidth: 120 }}
          >
            {(loading || questionsLoading) ? (
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
          <div className="yv-card p-6 max-w-2xl mb-8" style={{ borderColor: 'rgba(255,232,0,0.25)', background: 'rgba(255,232,0,0.04)' }}>
            <div className="flex gap-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFE800" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <p className="font-display font-bold text-white mb-1">{t('API key de YouTube no configurada', 'YouTube API key not configured')}</p>
                <p className="text-sm mb-3" style={{ color: 'var(--yv-text-2)' }}>
                  {t(
                    'Para usar esta función necesitas una clave de la YouTube Data API v3. Es gratuita y tarda ~10 minutos en configurarse.',
                    'To use this feature you need a YouTube Data API v3 key. It\'s free and takes ~10 minutes to set up.'
                  )}
                </p>
                <div className="font-mono-jb text-[13px] space-y-1" style={{ color: 'var(--yv-text-3)' }}>
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
          <div className="yv-card p-4 max-w-2xl mb-8" style={{ borderColor: 'rgba(232,77,91,0.3)' }}>
            <p className="text-sm" style={{ color: 'var(--yv-brand)' }}>{error}</p>
          </div>
        )}

        {/* Questions Results */}
        {activeTab === 'questions' && questionsResult && questionsResult.questions.length > 0 && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--yv-text-3)' }}>
                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span className="font-display font-bold text-xl text-white">
                {t('Preguntas sobre', 'Questions about')} "{questionsResult.keyword}"
              </span>
              <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                {questionsResult.questions.length} {t('preguntas encontradas', 'questions found')}
              </span>
            </div>

            <div className="grid gap-3">
              {questionsResult.questions.map((q, i) => {
                const qComp = COMPETITION_CONFIG[q.competition];
                return (
                  <div key={i} className="yv-card yv-glass--hover p-4 flex items-start gap-4 transition">
                    {/* Competition badge */}
                    <div className="flex flex-col items-center gap-1 flex-shrink-0 w-16 pt-1">
                      <div
                        className="font-display font-bold text-lg"
                        style={{ color: qComp.color }}
                      >
                        {q.competitionScore}
                      </div>
                      <span
                        className="font-mono-jb text-[13px] tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: qComp.bg, color: qComp.color, border: `1px solid ${qComp.border}` }}
                      >
                        {qComp.label[lang]}
                      </span>
                    </div>

                    {/* Question text + top video */}
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-bold text-sm text-white leading-snug mb-2">
                        {q.question}
                      </p>
                      {q.topVideo && (
                        <a
                          href={`https://youtube.com/watch?v=${q.topVideo.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 group"
                        >
                          <img
                            src={q.topVideo.thumbnail}
                            alt=""
                            className="w-16 h-11 object-cover rounded flex-shrink-0 opacity-80 group-hover:opacity-100 transition"
                            style={{ border: '1px solid var(--line)' }}
                          />
                          <div className="min-w-0">
                            <p className="text-[13px] line-clamp-1 group-hover:text-zinc-300 transition" style={{ color: 'var(--yv-text-2)' }}>
                              {q.topVideo.title}
                            </p>
                            <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                              {q.topVideo.channelName} · {formatViews(q.topVideo.views, lang)} {t('vistas', 'views')}
                            </p>
                          </div>
                        </a>
                      )}
                    </div>

                    {/* Create video button */}
                    <a
                      href={`/generate?prefill=${encodeURIComponent(q.question)}`}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono-jb text-[13px] tracking-wider hover:bg-white/[0.06] transition"
                      style={{ border: '1px solid var(--line)', color: 'var(--text-dim)' }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
                      </svg>
                      {t('Crear', 'Create')}
                    </a>
                  </div>
                );
              })}
            </div>

            {/* Generate CTA */}
            <div className="yv-card p-6 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: 'rgba(232,77,91,0.2)', background: 'rgba(232,77,91,0.03)' }}>
              <div>
                <p className="font-display font-bold text-white text-lg">
                  {t('Preguntas = oportunidades de vídeo', 'Questions = video opportunities')}
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--yv-text-3)' }}>
                  {t('Las preguntas con competencia baja son las mejores para posicionar rápido.', 'Low competition questions are the best for ranking fast.')}
                </p>
              </div>
              <a
                href={`/generate?prefill=${encodeURIComponent(questionsResult.keyword)}`}
                className="btn-offset px-6 py-3 text-sm font-mono-jb tracking-wider flex-shrink-0"
                style={{ borderRadius: '10px' }}
              >
                {t('Generar contenido →', 'Generate content →')}
              </a>
            </div>
          </div>
        )}

        {/* Questions empty result */}
        {activeTab === 'questions' && questionsResult && questionsResult.questions.length === 0 && (
          <div className="text-center py-16">
            <p className="font-display font-bold text-lg text-white mb-2">
              {t('No se encontraron preguntas', 'No questions found')}
            </p>
            <p className="text-sm font-mono-jb" style={{ color: 'var(--yv-text-4)' }}>
              {t('Prueba con otra keyword más general.', 'Try a more general keyword.')}
            </p>
          </div>
        )}

        {/* Keywords Results */}
        {activeTab === 'keywords' && result && (
          <div className="space-y-6 animate-in fade-in duration-500">

            {/* Keyword header */}
            <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--yv-text-3)' }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <span className="font-display font-bold text-xl text-white">"{result.keyword}"</span>
              <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                {result.totalResults.toLocaleString(lang === 'en' ? 'en-US' : 'es-ES')} {t('resultados', 'results')}
              </span>
            </div>

            {/* Score cards row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

              {/* Search Volume */}
              {result.volumeEstimate && (
                <div className="yv-card p-6 flex flex-col items-center gap-4" style={{ borderColor: 'rgba(129,140,248,0.25)' }}>
                  <ScoreRing
                    score={result.volumeEstimate.score}
                    color="#818cf8"
                    label={t('Volumen', 'Volume')}
                  />
                  <div className="text-center">
                    <div className="font-display font-bold text-lg" style={{ color: '#818cf8' }}>
                      {lang === 'en' ? result.volumeEstimate.labelEn : result.volumeEstimate.label}
                    </div>
                    <p className="font-mono-jb text-[13px] tracking-wider mt-1" style={{ color: 'var(--yv-text-4)' }}>
                      {lang === 'en' ? result.volumeEstimate.rangeEn : result.volumeEstimate.range}
                    </p>
                  </div>
                </div>
              )}

              {/* Competition */}
              <div className="yv-card p-6 flex flex-col items-center gap-4" style={{ borderColor: comp?.border }}>
                <ScoreRing
                  score={result.competitionScore}
                  color={comp?.color || '#e84d5b'}
                  label={t('Competencia', 'Competition')}
                />
                <div className="text-center">
                  <div className="font-display font-bold text-lg" style={{ color: comp?.color }}>
                    {comp?.label[lang]}
                  </div>
                  <p className="font-mono-jb text-[13px] tracking-wider mt-1" style={{ color: 'var(--yv-text-4)' }}>
                    {t('NIVEL DE COMPETENCIA', 'COMPETITION LEVEL')}
                  </p>
                </div>
              </div>

              {/* Opportunity */}
              <div className="yv-card p-6 flex flex-col items-center gap-4" style={{ borderColor: 'rgba(34,197,94,0.25)' }}>
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
                  <p className="font-mono-jb text-[13px] tracking-wider mt-1" style={{ color: 'var(--yv-text-4)' }}>
                    {t('POTENCIAL DE POSICIONAMIENTO', 'RANKING POTENTIAL')}
                  </p>
                </div>
              </div>

              {/* Avg views */}
              <div className="yv-card p-6 flex flex-col justify-center items-center gap-3">
                <div className="font-display font-bold text-5xl text-white">
                  {formatViews(result.avgViews, lang)}
                </div>
                <div className="text-center">
                  <p className="font-mono-jb text-[13px] tracking-wider" style={{ color: 'var(--yv-text-4)' }}>
                    {t('VISTAS MEDIAS (TOP 5)', 'AVG VIEWS (TOP 5)')}
                  </p>
                  <p className="text-[13px] mt-1" style={{ color: 'var(--yv-text-3)' }}>
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
              <div className="yv-card overflow-hidden">
                <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
                  <p className="font-mono-jb text-[13px] tracking-[0.25em] uppercase" style={{ color: 'var(--yv-text-3)' }}>
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
                      <span className="font-display font-bold text-2xl w-8 flex-shrink-0" style={{ color: i === 0 ? 'var(--yv-brand)' : 'var(--yv-text-5)' }}>
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
                        <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>{v.channelName} · {formatDate(v.publishedAt, lang)}</p>
                      </div>
                      {/* Stats */}
                      <div className="flex-shrink-0 text-right hidden sm:block">
                        <p className="font-display font-bold text-lg text-white">{formatViews(v.views, lang)}</p>
                        <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{t('vistas', 'views')}</p>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:text-zinc-400 transition flex-shrink-0" style={{ color: 'var(--yv-text-5)' }}>
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Related keywords */}
            {result.relatedKeywords.length > 0 && (
              <div className="yv-card p-6">
                <p className="font-mono-jb text-[13px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--yv-text-3)' }}>
                  {t('KEYWORDS RELACIONADAS', 'RELATED KEYWORDS')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.relatedKeywords.map((kw, i) => (
                    <button
                      key={i}
                      onClick={() => { setKeyword(kw); handleSearch(kw); }}
                      className="yv-chip font-mono-jb text-[13px] px-3 py-1.5 hover:text-white transition"
                      style={{ color: 'var(--yv-text-3)' }}
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Generate CTA */}
            <div className="yv-card p-6 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: 'rgba(232,77,91,0.2)', background: 'rgba(232,77,91,0.03)' }}>
              <div>
                <p className="font-display font-bold text-white text-lg">
                  {t('¿Listo para crear contenido con esta keyword?', 'Ready to create content with this keyword?')}
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--yv-text-3)' }}>
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
        {!result && !questionsResult && !loading && !questionsLoading && !noApiKey && !error && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(232,77,91,0.1)', border: '1px solid rgba(232,77,91,0.2)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--yv-brand)" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <p className="font-display font-bold text-xl text-white mb-2">
              {t('Escribe una keyword para analizar', 'Enter a keyword to analyze')}
            </p>
            <p className="text-sm font-mono-jb" style={{ color: 'var(--yv-text-4)' }}>
              {t('Ejemplos: "recetas veganas fáciles", "aprender inglés", "ejercicio en casa"', '"vegan recipes", "learn english", "home workout"')}
            </p>
          </div>
        )}

      </div>
    </DashboardShell>
  );
}

export default function ResearchPage() {
  return (
    <Suspense>
      <ResearchPageInner />
    </Suspense>
  );
}
