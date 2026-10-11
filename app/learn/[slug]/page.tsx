'use client';

import { useSession } from 'next-auth/react';
import { useDashboardStats } from '@/lib/use-dashboard-stats';
import { useLang } from '@/components/LangProvider';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import DashboardShell from '@/components/DashboardShell';
import GuideArticleRenderer from '@/components/GuideArticleRenderer';
import ProVideoSection from '@/components/ProVideoSection';
import GuideCard from '@/components/GuideCard';
import { getGuide, getRelatedGuides, GUIDE_BODIES } from '@/lib/learn-data';

type Lang = 'es' | 'en';

const LEVEL_COLORS = { beginner: '#22c55e', intermediate: '#eab308', advanced: '#ef4444' };
const LEVEL_LABELS: Record<string, Record<Lang, string>> = {
  beginner: { es: 'Principiante', en: 'Beginner' },
  intermediate: { es: 'Intermedio', en: 'Intermediate' },
  advanced: { es: 'Avanzado', en: 'Advanced' },
};

export default function LearnGuidePage() {
  const params = useParams();
  const slug = params.slug as string;
  const lang = useLang();
  const { data: session, status } = useSession();
  const { data, statsRefreshing, statsError, retryStats } =
    useDashboardStats(session?.user?.id, session?.user?.email, status);
  const canRead = status === 'authenticated' && !!session?.user?.id && !!session.user.email;
  // A retained snapshot labels the last confirmed plan; it never grants video
  // access while the current read is pending, failed or belongs to another user.
  const plan = canRead && data && !statsRefreshing && !statsError ? data.stats.plan : null;

  const guide = getGuide(slug);
  if (!guide) {
    return (
      <DashboardShell>
        <div className="yv-page">
          <div className="yv-card p-10 text-center">
            <p className="text-zinc-400">{lang === 'en' ? 'Guide not found.' : 'Guía no encontrada.'}</p>
            <Link href="/learn" className="yv-btn yv-btn--ghost mt-4 inline-flex">
              ← {lang === 'en' ? 'Back to Learning Hub' : 'Volver al Centro de Aprendizaje'}
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const body = GUIDE_BODIES[slug]?.[lang] ?? null;
  const related = getRelatedGuides(slug, 3);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <DashboardShell>
      <div className="yv-page">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 font-mono-jb text-[13px] text-zinc-600 mb-6" aria-label="breadcrumb">
          <Link href="/learn" className="hover:text-zinc-400 transition">
            {t('Aprendizaje', 'Learning')}
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--yv-text-1)' }}>{guide.title[lang]}</span>
        </nav>

        <div className="yv-card p-4 mb-6">
          {status === 'loading' ? (
            <p role="status">{t('Comprobando sesión…', 'Checking session…')}</p>
          ) : !canRead ? (
            <p>
              {t('Inicia sesión para comprobar tu plan y acceder a los vídeos.', 'Sign in to check your plan and access videos.')}
              {' '}<Link href="/login" className="underline">{t('Iniciar sesión', 'Sign in')}</Link>
            </p>
          ) : (
            <>
              {statsError ? (
                <p role="alert">{t('No hemos podido comprobar tu plan. Reintenta para ver los vídeos.', 'We could not check your plan. Retry to view videos.')}</p>
              ) : plan === null ? (
                <p role="status">{t('Comprobando tu plan…', 'Checking your plan…')}</p>
              ) : (
                <p>{t('Plan confirmado:', 'Confirmed plan:')} <strong>{plan === 'free' ? 'Free' : plan === 'pro' ? 'Pro' : 'Business'}</strong></p>
              )}
              {data && plan === null && (
                <p className="text-sm mt-2">
                  {t('Último plan confirmado:', 'Last confirmed plan:')} {data.stats.plan === 'free' ? 'Free' : data.stats.plan === 'pro' ? 'Pro' : 'Business'}.
                  {' '}{t('Los vídeos esperan una comprobación actual.', 'Videos await a current check.')}
                </p>
              )}
              {(data || statsError) && (
                <button onClick={retryStats} disabled={statsRefreshing} className="yv-btn yv-btn--ghost mt-3 disabled:opacity-50">
                  {statsError ? t('Reintentar plan', 'Retry plan') : t('Actualizar plan', 'Refresh plan')}
                </button>
              )}
            </>
          )}
        </div>

        {/* Header card */}
        <div className="yv-card overflow-hidden mb-8">
          {/* Cover image or gradient */}
          {guide.coverImage ? (
            <div className="relative overflow-hidden">
              <Image src={guide.coverImage} alt={guide.title[lang]} width={900} height={500} className="h-auto mx-auto" sizes="(max-width: 768px) 50vw, 450px" style={{ maxWidth: '50%', objectFit: 'contain' }} />
            </div>
          ) : (
            <div className="h-32 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.15), transparent)' }}>
              <div className="absolute inset-0"
                style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
            </div>
          )}

          <div className="p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-[144px] h-[144px] relative shrink-0">
                <Image src={guide.icon} alt="" width={144} height={144} className="object-contain" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className="font-mono-jb text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: `${LEVEL_COLORS[guide.level]}22`, color: LEVEL_COLORS[guide.level] }}
                  >
                    {LEVEL_LABELS[guide.level][lang]}
                  </span>
                  <span className="font-mono-jb text-[11px] text-zinc-600">{guide.readMin} min</span>
                  {guide.videoId && (
                    <span className="font-mono-jb text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(232,77,91,0.15)', color: 'var(--red)' }}>
                      {t('Video Pro', 'Pro Video')}
                    </span>
                  )}
                </div>
                <h1 className="font-display font-bold text-2xl md:text-3xl mb-3" style={{ color: 'var(--yv-text-1)' }}>
                  {guide.title[lang]}
                </h1>
                <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
                  {guide.description[lang]}
                </p>
                {guide.tool && (
                  <Link href={guide.tool} className="yv-btn yv-btn--ghost inline-flex items-center gap-2 mt-4 text-sm">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    {t('Abrir herramienta', 'Open tool')} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Article body or fallback steps */}
        <div className="yv-card p-6 md:p-8 mb-8">
          {body ? (
            <GuideArticleRenderer blocks={body} lang={lang} showVideo={plan !== null} plan={plan ?? undefined} />
          ) : (
            <div>
              <h2 className="font-display font-bold text-xl mb-6" style={{ color: 'var(--yv-text-1)' }}>
                {t('Pasos clave', 'Key Steps')}
              </h2>
              <ol className="space-y-4">
                {guide.steps[lang].map((step, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="font-mono-jb font-bold text-lg mt-0.5 shrink-0 w-8 h-8 flex items-center justify-center rounded-lg"
                      style={{ background: 'rgba(232,77,91,0.1)', color: 'var(--yv-brand)' }}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-mono-jb leading-relaxed pt-1.5" style={{ color: 'var(--yv-text-2)' }}>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Pro video section (when guide has videoId but body doesn't include inline video) */}
        {guide.videoId && !body && plan !== null && (
          <div className="yv-card p-6 md:p-8 mb-8">
            <h2 className="font-display font-bold text-xl mb-4" style={{ color: 'var(--yv-text-1)' }}>
              {t('Video tutorial', 'Video Tutorial')}
            </h2>
            <ProVideoSection videoId={guide.videoId} plan={plan} lang={lang} />
          </div>
        )}

        {/* Related guides */}
        {related.length > 0 && (
          <div className="mb-8">
            <p className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-4">
              {t('Guías relacionadas', 'Related Guides')}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {related.map((g) => (
                <GuideCard key={g.slug} guide={g} lang={lang} linkPrefix="/learn/" />
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
