import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  BLOG_POSTS, BLOG_CATEGORIES, ARTICLE_BODIES,
  getPost, getRelated, type Lang, type BlockType,
} from '@/lib/blog-data';

export async function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title.es} — YTubViral Blog`,
    description: post.excerpt.es,
    alternates: { canonical: `https://ytubviral.com/blog/${slug}` },
    openGraph: {
      title: post.title.es,
      description: post.excerpt.es,
      url: `https://ytubviral.com/blog/${slug}`,
      type: 'article',
      publishedTime: post.date.es,
      authors: [post.author.name],
    },
  };
}

function ArticleBlock({ block, lang }: { block: BlockType; lang: Lang }) {
  if (block.type === 'p') {
    return <p className="text-zinc-300 leading-relaxed text-[17px] mb-5">{block.t}</p>;
  }
  if (block.type === 'h2') {
    return (
      <h2
        id={block.t.toLowerCase().replace(/[^a-z0-9áéíóú\s]/gi, '').replace(/\s+/g, '-').slice(0, 60)}
        className="font-display font-bold text-2xl md:text-3xl mt-12 mb-5"
      >
        {block.t}
      </h2>
    );
  }
  if (block.type === 'h3') {
    return <h3 className="font-display font-bold text-xl mt-8 mb-4 text-zinc-200">{block.t}</h3>;
  }
  if (block.type === 'list') {
    return (
      <ul className="space-y-2.5 mb-6 pl-1">
        {block.items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-zinc-300 text-[16px]">
            <span className="mt-1 shrink-0 w-5 h-5 flex items-center justify-center" style={{ color: 'var(--red)' }}>▸</span>
            {item}
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === 'callout') {
    return (
      <div className="my-8 border-l-4 pl-6 py-4" style={{ borderColor: 'var(--red)', background: 'rgba(232,77,91,0.06)' }}>
        <p className="font-display font-bold text-lg" style={{ color: 'var(--red)' }}>{block.t}</p>
        <Link href="/signup" className="btn-offset inline-flex mt-4 px-5 py-2.5 text-sm font-display">
          {lang === 'en' ? 'Try free →' : 'Prueba gratis →'}
        </Link>
      </div>
    );
  }
  if (block.type === 'callout-mid') {
    return (
      <div className="my-10 border border-white/15 p-8 text-center relative overflow-hidden" style={{ background: '#0E0E10' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(232,77,91,0.12), transparent 70%)' }} />
        <div className="relative">
          <p className="font-display font-bold text-2xl mb-2">{block.t}</p>
          <p className="text-zinc-400 mb-6">{block.sub}</p>
          <Link href="/signup" className="btn-offset inline-flex px-8 py-3 text-sm font-display font-bold">
            {block.cta} →
          </Link>
        </div>
      </div>
    );
  }
  if (block.type === 'callout-final') {
    return (
      <div className="mt-14 border border-white/15 p-10 text-center relative overflow-hidden" style={{ background: '#0E0E10' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(232,77,91,0.18), transparent 70%)' }} />
        <div className="relative">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>YTubViral</p>
          <p className="font-display font-bold text-3xl mb-2">{block.t}</p>
          <p className="text-zinc-400 mb-8">{block.sub}</p>
          <Link href="/signup" className="btn-offset inline-flex px-10 py-4 text-base font-display font-bold">
            {block.cta} →
          </Link>
        </div>
      </div>
    );
  }
  return null;
}

function RelatedCard({ post, lang, catColor, catLabel }: {
  post: ReturnType<typeof getPost>;
  lang: Lang;
  catColor: (c: string) => string;
  catLabel: (c: string) => string;
}) {
  if (!post) return null;
  return (
    <Link href={`/blog/${post.slug}`} className="group block border border-white/10 p-6 bg-black hover:border-white/20 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono-jb text-[10px] tracking-wider uppercase px-2 py-0.5 border"
          style={{ color: catColor(post.cat), borderColor: catColor(post.cat) + '55', background: catColor(post.cat) + '11' }}>
          {catLabel(post.cat)}
        </span>
        <span className="font-mono-jb text-[10px] text-zinc-600">{post.readMin} min</span>
      </div>
      <h4 className="font-display font-bold text-base leading-tight mb-2 group-hover:text-zinc-100 transition-colors">
        {post.title[lang]}
      </h4>
      <p className="text-zinc-500 text-sm line-clamp-2">{post.excerpt[lang]}</p>
    </Link>
  );
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const cookieStore = await cookies();
  const lang: Lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';

  const body = ARTICLE_BODIES[slug]?.[lang] ?? null;
  const related = getRelated(slug, post.cat, 3);

  const catData = BLOG_CATEGORIES[post.cat as keyof typeof BLOG_CATEGORIES];
  const catColor = (c: string) => BLOG_CATEGORIES[c as keyof typeof BLOG_CATEGORIES]?.color ?? '#FF0033';
  const catLabel = (c: string) => BLOG_CATEGORIES[c as keyof typeof BLOG_CATEGORIES]?.name[lang] ?? c;

  const COVER_GRADIENTS: Record<string, string> = {
    youtube:   'linear-gradient(135deg, #FF0033 0%, #1a0005 100%)',
    ai:        'linear-gradient(135deg, #00E5FF 0%, #001a2e 100%)',
    marketing: 'linear-gradient(135deg, #FF00AA 0%, #1a0010 100%)',
    tutorials: 'linear-gradient(135deg, #7CFF00 0%, #001a00 100%)',
  };

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2" />
              <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020" />
            </svg>
            <span className="font-display font-bold text-[17px] tracking-tight">
              YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/blog" className="font-mono-jb text-[11px] tracking-wider uppercase text-zinc-400 hover:text-white transition">
              {lang === 'en' ? '← Blog' : '← Blog'}
            </Link>
            <Link href="/signup" className="btn-offset px-4 py-2 text-[13px] font-display">
              {lang === 'en' ? 'Get started free' : 'Empezar gratis'}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Article header ── */}
      <article className="max-w-3xl mx-auto px-6 pt-16 pb-8">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 font-mono-jb text-[11px] text-zinc-600 mb-10" aria-label="breadcrumb">
          <Link href="/" className="hover:text-zinc-400 transition">Home</Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-zinc-400 transition">Blog</Link>
          <span>/</span>
          <span style={{ color: catData?.color }}>{catLabel(post.cat)}</span>
        </nav>

        {/* Category + read time */}
        <div className="flex items-center gap-3 mb-6">
          <span className="font-mono-jb text-[11px] tracking-wider uppercase px-3 py-1 border"
            style={{ color: catData?.color, borderColor: (catData?.color ?? '#FF0033') + '55', background: (catData?.color ?? '#FF0033') + '11' }}>
            {catLabel(post.cat)}
          </span>
          <span className="font-mono-jb text-[11px] text-zinc-600">{post.readMin} min read</span>
        </div>

        {/* Title */}
        <h1 className="font-display font-bold leading-[0.95] mb-8" style={{ fontSize: 'clamp(28px, 5vw, 52px)' }}>
          {post.title[lang]}
        </h1>

        {/* Author + date */}
        <div className="flex items-center gap-4 pb-8 border-b border-white/10">
          <div className="w-10 h-10 flex items-center justify-center font-display font-bold text-sm shrink-0"
            style={{ background: 'var(--red)', color: '#000' }}>
            {post.author.avatar}
          </div>
          <div>
            <p className="font-semibold text-sm">{post.author.name}</p>
            <p className="font-mono-jb text-[10px] text-zinc-500">
              {post.author.role[lang]} · {post.date[lang]}
            </p>
          </div>
        </div>

        {/* Cover image area */}
        <div className="mt-10 mb-12 h-64 md:h-80 relative overflow-hidden border border-white/10">
          <div className="w-full h-full flex items-center justify-center relative"
            style={{ background: COVER_GRADIENTS[post.cat] ?? COVER_GRADIENTS.youtube }}>
            <span className="font-display font-bold opacity-15 select-none"
              style={{ fontSize: 'clamp(96px, 18vw, 180px)', color: catData?.color ?? '#fff', lineHeight: 1 }}>
              {post.cat === 'youtube' ? '▲' : post.cat === 'ai' ? '◆' : post.cat === 'marketing' ? '●' : '■'}
            </span>
            <div className="absolute inset-0"
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
          </div>
        </div>

        {/* Excerpt / intro */}
        <p className="text-zinc-300 text-xl leading-relaxed mb-10 border-l-4 pl-6" style={{ borderColor: catData?.color }}>
          {post.excerpt[lang]}
        </p>

        {/* Article body */}
        {body ? (
          body.map((block, i) => <ArticleBlock key={i} block={block} lang={lang} />)
        ) : (
          <div className="border border-white/10 p-10 text-center bg-black">
            <p className="font-mono-jb text-[11px] tracking-wider uppercase mb-3" style={{ color: 'var(--red)' }}>
              {lang === 'en' ? 'Coming soon' : 'Próximamente'}
            </p>
            <p className="text-zinc-400">
              {lang === 'en'
                ? 'The full article is being finalized. Check back soon.'
                : 'El artículo completo está siendo finalizado. Vuelve pronto.'}
            </p>
            <Link href="/blog" className="btn-offset-ghost btn-offset inline-flex mt-6 px-6 py-3 text-sm font-display">
              {lang === 'en' ? '← Back to blog' : '← Volver al blog'}
            </Link>
          </div>
        )}

        {/* Author footer */}
        <div className="mt-16 border border-white/10 p-6 bg-black flex items-center gap-5">
          <div className="w-12 h-12 flex items-center justify-center font-display font-bold shrink-0"
            style={{ background: 'var(--red)', color: '#000', fontSize: '16px' }}>
            {post.author.avatar}
          </div>
          <div>
            <p className="font-display font-bold">{post.author.name}</p>
            <p className="text-zinc-400 text-sm">{post.author.role[lang]}</p>
          </div>
        </div>
      </article>

      {/* ── Related articles ── */}
      {related.length > 0 && (
        <section className="border-t border-white/10 mt-8">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-6">
              {lang === 'en' ? 'Related articles' : 'Artículos relacionados'}
            </p>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {related.map((p) => (
                <RelatedCard key={p.slug} post={p} lang={lang} catColor={catColor} catLabel={catLabel} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Final CTA ── */}
      <section className="border-t border-white/10 bg-black">
        <div className="max-w-4xl mx-auto px-6 py-20 text-center relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(232,77,91,0.18), transparent 70%)' }} />
          <div className="relative">
            <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--red)' }}>YTubViral</p>
            <h2 className="font-display font-bold text-4xl md:text-5xl leading-[0.95] mb-6">
              {lang === 'en' ? 'Put this into practice.' : 'Ponlo en práctica.'}
            </h2>
            <p className="text-zinc-400 text-lg max-w-lg mx-auto mb-8">
              {lang === 'en'
                ? 'Generate optimized titles, scripts and descriptions in seconds. 10 free generations to start.'
                : 'Genera títulos optimizados, scripts y descripciones en segundos. 10 generaciones gratis para empezar.'}
            </p>
            <Link href="/signup" className="btn-offset px-10 py-4 text-base font-display font-bold inline-flex">
              {lang === 'en' ? 'Get started free →' : 'Empezar gratis →'}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-black">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-zinc-500 font-mono-jb text-xs">
            © 2026 YTubViral · {lang === 'en' ? 'Made by creators, for creators.' : 'Hecho por creadores, para creadores.'}
          </p>
          <div className="flex gap-6 text-zinc-500 font-mono-jb text-xs">
            <Link href="/terms" className="hover:text-white transition">{lang === 'en' ? 'Terms' : 'Términos'}</Link>
            <Link href="/privacy" className="hover:text-white transition">{lang === 'en' ? 'Privacy' : 'Privacidad'}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
