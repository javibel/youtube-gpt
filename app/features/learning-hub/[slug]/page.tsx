import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LEARN_GUIDES, GUIDE_BODIES, getGuide, getRelatedGuides, getAllGuideSlugs,
  type LearnBlockType,
} from '@/lib/learn-data';
import type { Lang, BlockType } from '@/lib/blog-data';
import ArticleBlock from '@/components/ArticleBlock';
import GuideCard from '@/components/GuideCard';
import { getServerLang } from '@/lib/server-lang';

export async function generateStaticParams() {
  return getAllGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    // Sin sufijo "— Learning Hub": con el template "| YTubViral" algunos titles superaban 65 chars
    title: guide.title.es,
    description: guide.description.es,
    alternates: { canonical: `https://ytubviral.com/features/learning-hub/${slug}` },
    openGraph: {
      title: guide.title.es,
      description: guide.description.es,
      url: `https://ytubviral.com/features/learning-hub/${slug}`,
      type: 'article',
      ...(guide.coverImage ? { images: [{ url: `https://ytubviral.com${guide.coverImage}`, width: 1200, height: 630 }] } : {}),
    },
  };
}

const LEVEL_COLORS = { beginner: '#22c55e', intermediate: '#eab308', advanced: '#ef4444' };
const LEVEL_LABELS: Record<string, Record<Lang, string>> = {
  beginner: { es: 'Principiante', en: 'Beginner' },
  intermediate: { es: 'Intermedio', en: 'Intermediate' },
  advanced: { es: 'Avanzado', en: 'Advanced' },
};

export default async function LearningHubGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const lang = getServerLang();

  const body = GUIDE_BODIES[slug]?.[lang] ?? null;
  const related = getRelatedGuides(slug, 3);

  // JSON-LD Article schema
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title[lang],
    description: guide.description[lang],
    image: guide.coverImage ? `https://ytubviral.com${guide.coverImage}` : undefined,
    datePublished: '2026-05-13',
    dateModified: '2026-05-13',
    author: { '@type': 'Person', name: 'Javier Jimeno' },
    publisher: {
      '@type': 'Organization',
      name: 'YTubViral',
      url: 'https://ytubviral.com',
    },
    mainEntityOfPage: `https://ytubviral.com/features/learning-hub/${slug}`,
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ytubviral.com' },
      { '@type': 'ListItem', position: 2, name: 'Learning Hub', item: 'https://ytubviral.com/features/learning-hub' },
      { '@type': 'ListItem', position: 3, name: guide.title[lang], item: `https://ytubviral.com/features/learning-hub/${slug}` },
    ],
  };

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Article */}
      <article className="max-w-3xl mx-auto px-6 pt-16 pb-8">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 font-mono-jb text-[13px] text-zinc-600 mb-10" aria-label="breadcrumb">
          <Link href="/" className="hover:text-zinc-400 transition">Home</Link>
          <span>/</span>
          <Link href="/features/learning-hub" className="hover:text-zinc-400 transition">Learning Hub</Link>
          <span>/</span>
          <span style={{ color: LEVEL_COLORS[guide.level] }}>{guide.title[lang]}</span>
        </nav>

        {/* Level + read time */}
        <div className="flex items-center gap-3 mb-6">
          <span className="font-mono-jb text-[13px] tracking-wider uppercase px-3 py-1 border rounded-full"
            style={{ color: LEVEL_COLORS[guide.level], borderColor: LEVEL_COLORS[guide.level] + '55', background: LEVEL_COLORS[guide.level] + '11' }}>
            {LEVEL_LABELS[guide.level][lang]}
          </span>
          <span className="font-mono-jb text-[13px] text-zinc-600">{guide.readMin} min read</span>
          {guide.videoId && (
            <span className="font-mono-jb text-[13px] tracking-wider uppercase px-3 py-1 border rounded-full"
              style={{ color: 'var(--red)', borderColor: 'rgba(232,77,91,0.3)', background: 'rgba(232,77,91,0.08)' }}>
              {lang === 'en' ? 'Pro Video' : 'Video Pro'}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="font-display font-bold leading-[0.95] mb-8" style={{ fontSize: 'clamp(28px, 5vw, 52px)' }}>
          {guide.title[lang]}
        </h1>

        {/* Description */}
        <p className="text-zinc-300 text-xl leading-relaxed mb-10 border-l-4 pl-6" style={{ borderColor: LEVEL_COLORS[guide.level] }}>
          {guide.description[lang]}
        </p>

        {/* Cover image or gradient */}
        <div className="yv-glass mb-12 h-64 md:h-80 relative overflow-hidden">
          {guide.coverImage ? (
            <Image src={guide.coverImage} alt={guide.title[lang]} fill className="object-cover" sizes="(max-width: 768px) 100vw, 768px" priority />
          ) : (
            <div className="w-full h-full flex items-center justify-center relative"
              style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.25) 0%, #0a0a0a 100%)' }}>
              <div className="w-72 h-72 relative opacity-60">
                <Image src={guide.icon} alt="" width={288} height={288} className="object-contain" />
              </div>
              <div className="absolute inset-0"
                style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
            </div>
          )}
        </div>

        {/* Article body or fallback steps */}
        {body ? (
          body.map((block, i) => {
            // Skip video blocks on public page
            if (block.type === 'video') return null;
            if (block.type === 'image') {
              return (
                <figure key={i} className="my-8">
                  <div className="yv-glass relative w-full overflow-hidden" style={{ aspectRatio: '16/9' }}>
                    <Image src={block.src} alt={block.alt} fill className="object-cover" sizes="(max-width: 768px) 100vw, 768px" />
                  </div>
                  {block.caption && (
                    <figcaption className="mt-2 text-center font-mono-jb text-[13px] text-zinc-500">{block.caption}</figcaption>
                  )}
                </figure>
              );
            }
            return <ArticleBlock key={i} block={block as BlockType} lang={lang} />;
          })
        ) : (
          <div>
            <h2 className="font-display font-bold text-2xl md:text-3xl mt-4 mb-6">
              {lang === 'en' ? 'Key Steps' : 'Pasos clave'}
            </h2>
            <ol className="space-y-5 mb-10">
              {guide.steps[lang].map((step, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="font-display font-bold text-lg mt-0.5 shrink-0 w-9 h-9 flex items-center justify-center"
                    style={{ color: 'var(--yv-brand)', background: 'rgba(232,77,91,0.08)', boxShadow: 'inset 0 1px 0 rgba(232,77,91,.25)' }}>
                    {i + 1}
                  </span>
                  <span className="text-zinc-300 text-[17px] leading-relaxed pt-1">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Vídeo público del canal — visible para todos, sin muro de pago.
            Distinto de `videoId` (unlisted de Pro), que solo pinta un CTA de suscripción. */}
        {guide.publicVideoId && (
          <div className="my-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="yv-chip font-mono-jb text-[13px] tracking-wider uppercase px-3 py-1"
                style={{ color: 'var(--yv-brand-lift)', background: 'rgba(232,77,91,0.12)' }}>
                {lang === 'en' ? 'Free video' : 'Vídeo gratis'}
              </span>
              <span className="font-mono-jb text-[13px] text-zinc-500">
                {lang === 'en' ? 'Watch this guide on video' : 'Esta guía, en vídeo'}
              </span>
            </div>
            <div className="yv-glass relative w-full overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${guide.publicVideoId}`}
                title={guide.title[lang]}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Pro video CTA (instead of actual video on public page) */}
        {guide.videoId && (
          <div className="yv-glass my-10 p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(232,77,91,0.12), transparent 70%)' }} />
            <div className="relative">
              <div className="w-14 h-14 mx-auto mb-4 flex items-center justify-center rounded-full" style={{ background: 'rgba(232,77,91,0.15)', boxShadow: 'inset 0 0 0 1px rgba(232,77,91,.35)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--red)' }}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <p className="font-display font-bold text-2xl mb-2">
                {lang === 'en' ? 'Video tutorial available for Pro members' : 'Video tutorial disponible para miembros Pro'}
              </p>
              <p className="text-zinc-400 mb-6">
                {lang === 'en'
                  ? 'Watch the step-by-step video walkthrough of this guide with Pro.'
                  : 'Mira el video tutorial paso a paso de esta guía con Pro.'}
              </p>
              <Link href="/signup" className="btn-offset inline-flex px-8 py-3 text-sm font-display font-bold">
                {lang === 'en' ? 'Sign up free →' : 'Regístrate gratis →'}
              </Link>
            </div>
          </div>
        )}

        {/* Tool CTA */}
        {guide.tool && (
          <div className="yv-glass my-10 p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(232,77,91,0.12), transparent 70%)' }} />
            <div className="relative">
              <p className="font-display font-bold text-xl mb-2">
                {lang === 'en' ? 'Put this into practice' : 'Ponlo en práctica'}
              </p>
              <p className="text-zinc-400 mb-6">
                {lang === 'en'
                  ? 'Use the YTubViral tool to apply what you just learned.'
                  : 'Usa la herramienta de YTubViral para aplicar lo que acabas de aprender.'}
              </p>
              <Link href="/signup" className="btn-offset inline-flex px-8 py-3 text-sm font-display font-bold">
                {lang === 'en' ? 'Try free →' : 'Prueba gratis →'}
              </Link>
            </div>
          </div>
        )}
      </article>

      {/* Related guides */}
      {related.length > 0 && (
        <section className="mt-8" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)' }}>
          <div className="max-w-7xl mx-auto px-6 py-12">
            <p className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-6">
              {lang === 'en' ? 'Related guides' : 'Guías relacionadas'}
            </p>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {related.map((g) => (
                <GuideCard key={g.slug} guide={g} lang={lang} linkPrefix="/features/learning-hub/" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section style={{ background: 'var(--yv-bg-0)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }}>
        <div className="max-w-4xl mx-auto px-6 py-20 text-center relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(232,77,91,0.18), transparent 70%)' }} />
          <div className="relative">
            <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--red)' }}>YTubViral</p>
            <h2 className="font-display font-bold text-4xl md:text-5xl leading-[0.95] mb-6">
              {lang === 'en' ? 'Ready to grow?' : '¿Listo para crecer?'}
            </h2>
            <p className="text-zinc-400 text-lg max-w-lg mx-auto mb-8">
              {lang === 'en'
                ? 'All the AI-powered tools to optimize every aspect of your YouTube channel. 10 free generations to start.'
                : 'Todas las herramientas potenciadas por IA para optimizar cada aspecto de tu canal. 10 generaciones gratis para empezar.'}
            </p>
            <Link href="/signup" className="btn-offset px-10 py-4 text-base font-display font-bold inline-flex">
              {lang === 'en' ? 'Get started free →' : 'Empezar gratis →'}
            </Link>
          </div>
        </div>
      </section>

      <footer style={{ background: 'var(--yv-bg-0)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }}>
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-zinc-500 font-mono-jb text-[13px]">
            © 2026 YTubViral · {lang === 'en' ? 'Made by creators, for creators.' : 'Hecho por creadores, para creadores.'}
          </p>
          <div className="flex gap-6 text-zinc-500 font-mono-jb text-[13px]">
            <Link href="/terms" className="hover:text-white transition">{lang === 'en' ? 'Terms' : 'Términos'}</Link>
            <Link href="/privacy" className="hover:text-white transition">{lang === 'en' ? 'Privacy' : 'Privacidad'}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
