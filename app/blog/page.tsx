import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { BLOG_POSTS, BLOG_CATEGORIES, type Lang } from '@/lib/blog-data';

export const metadata: Metadata = {
  title: 'Blog — YTubViral | Estrategias, IA y crecimiento para YouTubers',
  description:
    'Artículos prácticos sobre el algoritmo de YouTube, títulos virales, scripts con IA, thumbnails y monetización. Escrito por creadores, para creadores.',
  alternates: { canonical: 'https://ytubviral.com/blog' },
  openGraph: {
    title: 'Blog — YTubViral',
    description: 'Estrategias, IA y crecimiento para YouTubers',
    url: 'https://ytubviral.com/blog',
    type: 'website',
  },
};

const COVER_GRADIENTS: Record<string, string> = {
  youtube:   'linear-gradient(135deg, #FF0033 0%, #1a0005 100%)',
  ai:        'linear-gradient(135deg, #00E5FF 0%, #001a2e 100%)',
  marketing: 'linear-gradient(135deg, #FF00AA 0%, #1a0010 100%)',
  tutorials: 'linear-gradient(135deg, #7CFF00 0%, #001a00 100%)',
};

function BlogCover({ cat, index, image }: { cat: string; index: number; image?: string }) {
  if (image) {
    return (
      <div className="w-full h-full relative overflow-hidden">
        <Image src={image} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
      </div>
    );
  }
  const gradient = COVER_GRADIENTS[cat] ?? COVER_GRADIENTS.youtube;
  const catData = BLOG_CATEGORIES[cat as keyof typeof BLOG_CATEGORIES];
  const symbols = ['▲', '●', '◆', '■', '▼', '◉', '▸', '⬡', '◈'];
  return (
    <div
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
      style={{ background: gradient }}
    >
      <span
        className="select-none font-display font-bold opacity-20"
        style={{ fontSize: 'clamp(64px, 12vw, 120px)', color: catData?.color ?? '#fff', lineHeight: 1 }}
      >
        {symbols[index % symbols.length]}
      </span>
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
    </div>
  );
}

export default async function BlogListPage() {
  const cookieStore = await cookies();
  const lang: Lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';

  const featured = BLOG_POSTS[0];
  const rest = BLOG_POSTS.slice(1);

  const catLabel = (cat: string) => BLOG_CATEGORIES[cat as keyof typeof BLOG_CATEGORIES]?.name[lang] ?? cat;
  const catColor = (cat: string) => BLOG_CATEGORIES[cat as keyof typeof BLOG_CATEGORIES]?.color ?? '#FF0033';

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
            <Link href="/" className="font-mono-jb text-[11px] tracking-wider uppercase text-zinc-400 hover:text-white transition">
              {lang === 'en' ? '← Home' : '← Inicio'}
            </Link>
            <Link href="/signup" className="btn-offset px-4 py-2 text-[13px] font-display">
              {lang === 'en' ? 'Get started free' : 'Empezar gratis'}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="border-b border-white/10 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 60% 0%, rgba(232,77,91,0.12), transparent 60%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--red)' }}>
            {lang === 'en' ? 'Blog · Knowledge base' : 'Blog · Base de conocimiento'}
          </p>
          <h1 className="font-display font-bold leading-[0.95] max-w-3xl" style={{ fontSize: 'clamp(36px,6vw,80px)' }}>
            {lang === 'en'
              ? <>Strategies, AI &amp;<br />YouTube growth.</>
              : <>Estrategias, IA y<br />crecimiento en YouTube.</>}
          </h1>
          <p className="text-zinc-400 text-lg mt-6 max-w-xl">
            {lang === 'en'
              ? 'Practical articles written by creators. No fluff, no gatekeeping.'
              : 'Artículos prácticos escritos por creadores. Sin relleno, sin secretismos.'}
          </p>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            <span className="soft-chip px-4 py-1.5 font-mono-jb text-[11px] tracking-wider uppercase soft-chip-active">
              {lang === 'en' ? 'All' : 'Todos'}
            </span>
            {Object.entries(BLOG_CATEGORIES).map(([key, val]) => (
              <span key={key} className="soft-chip px-4 py-1.5 font-mono-jb text-[11px] tracking-wider uppercase text-zinc-400"
                style={{ borderColor: val.color + '33' }}>
                {val.name[lang]}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured post ── */}
      <section className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-6">
            {lang === 'en' ? 'Featured' : 'Destacado'}
          </p>
          <Link href={`/blog/${featured.slug}`} className="group grid md:grid-cols-2 gap-0 border border-white/10 hover:border-white/20 transition-colors bg-black">
            <div className="h-64 md:h-auto relative overflow-hidden">
              <BlogCover cat={featured.cat} index={0} image={featured.image} />
            </div>
            <div className="p-8 md:p-10 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono-jb text-[10px] tracking-wider uppercase px-2.5 py-1 border"
                    style={{ color: catColor(featured.cat), borderColor: catColor(featured.cat) + '55', background: catColor(featured.cat) + '11' }}>
                    {catLabel(featured.cat)}
                  </span>
                  <span className="font-mono-jb text-[10px] text-zinc-600">{featured.readMin} min read</span>
                </div>
                <h2 className="font-display font-bold text-2xl md:text-3xl leading-tight mb-4 group-hover:text-zinc-100 transition-colors">
                  {featured.title[lang]}
                </h2>
                <p className="text-zinc-400 text-[15px] leading-relaxed">{featured.excerpt[lang]}</p>
              </div>
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center font-display font-bold text-xs"
                    style={{ background: 'var(--red)', color: '#000' }}>
                    {featured.author.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{featured.author.name}</p>
                    <p className="font-mono-jb text-[10px] text-zinc-500">{featured.date[lang]}</p>
                  </div>
                </div>
                <span className="font-mono-jb text-[11px] tracking-wider uppercase" style={{ color: 'var(--red)' }}>
                  {lang === 'en' ? 'Read →' : 'Leer →'}
                </span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Post grid + sidebar ── */}
      <section className="max-w-7xl mx-auto px-6 py-12 grid lg:grid-cols-[1fr_300px] gap-12">
        {/* Posts grid */}
        <div>
          <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-6">
            {lang === 'en' ? 'Latest articles' : 'Últimos artículos'}
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {rest.map((post, i) => (
              <Link key={post.slug} href={`/blog/${post.slug}`}
                className="group flex flex-col border border-white/10 bg-black hover:border-white/20 transition-colors">
                <div className="h-44 relative overflow-hidden">
                  <BlogCover cat={post.cat} index={i + 1} image={post.image} />
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-mono-jb text-[10px] tracking-wider uppercase px-2 py-0.5 border"
                      style={{ color: catColor(post.cat), borderColor: catColor(post.cat) + '55', background: catColor(post.cat) + '11' }}>
                      {catLabel(post.cat)}
                    </span>
                    <span className="font-mono-jb text-[10px] text-zinc-600">{post.readMin} min</span>
                  </div>
                  <h3 className="font-display font-bold text-lg leading-tight mb-3 group-hover:text-zinc-100 transition-colors flex-1">
                    {post.title[lang]}
                  </h3>
                  <p className="text-zinc-500 text-sm leading-relaxed line-clamp-3">{post.excerpt[lang]}</p>
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/8">
                    <span className="font-mono-jb text-[10px] text-zinc-600">{post.date[lang]}</span>
                    <span className="font-mono-jb text-[10px] tracking-wider uppercase" style={{ color: 'var(--red)' }}>
                      {lang === 'en' ? 'Read →' : 'Leer →'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* CTA */}
          <div className="border border-white/10 p-6 bg-black relative overflow-hidden">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(232,77,91,0.15), transparent 70%)' }} />
            <div className="relative">
              <p className="font-mono-jb text-[10px] tracking-wider uppercase mb-3" style={{ color: 'var(--red)' }}>
                {lang === 'en' ? 'Try it free' : 'Pruébalo gratis'}
              </p>
              <p className="font-display font-bold text-xl mb-3">
                {lang === 'en' ? 'Stop writing titles manually.' : 'Deja de escribir títulos a mano.'}
              </p>
              <p className="text-zinc-400 text-sm mb-5">
                {lang === 'en'
                  ? '10 free generations. No credit card required.'
                  : '10 generaciones gratis. Sin tarjeta.'}
              </p>
              <Link href="/signup" className="btn-offset w-full px-4 py-3 text-sm font-display block text-center">
                {lang === 'en' ? 'Get started →' : 'Empezar →'}
              </Link>
            </div>
          </div>

          {/* Popular */}
          <div className="border border-white/10 p-6 bg-black">
            <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-4">
              {lang === 'en' ? 'Popular this week' : 'Popular esta semana'}
            </p>
            <div className="space-y-4">
              {BLOG_POSTS.slice(0, 4).map((p, i) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="flex gap-3 group">
                  <span className="font-mono-jb text-[11px] text-zinc-700 mt-0.5 shrink-0">0{i + 1}</span>
                  <p className="font-display font-bold text-sm leading-tight group-hover:text-zinc-300 transition-colors">
                    {p.title[lang]}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="border border-white/10 p-6 bg-black">
            <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-4">
              {lang === 'en' ? 'Categories' : 'Categorías'}
            </p>
            <div className="space-y-2">
              {Object.entries(BLOG_CATEGORIES).map(([key, val]) => {
                const count = BLOG_POSTS.filter((p) => p.cat === key).length;
                return (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: val.color }} />
                      <span className="text-sm text-zinc-300">{val.name[lang]}</span>
                    </div>
                    <span className="font-mono-jb text-[10px] text-zinc-600">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 bg-black mt-8">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
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
