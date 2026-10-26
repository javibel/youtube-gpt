import type { Metadata } from 'next';
import { getServerLang } from '@/lib/server-lang';
import { getPosts, type Lang } from '@/lib/blog-data';
import BlogContent from './BlogContent';

export const metadata: Metadata = {
  title: 'Blog — Estrategias, IA y crecimiento para YouTubers',
  description:
    'Artículos prácticos sobre el algoritmo de YouTube, títulos virales, scripts con IA, thumbnails y monetización.',
  alternates: { canonical: 'https://ytubviral.com/blog' },
  openGraph: {
    title: 'Blog — Estrategias, IA y crecimiento para YouTubers',
    description: 'Artículos prácticos sobre el algoritmo de YouTube, títulos virales, scripts con IA, thumbnails y monetización. Aprende a crecer como creador con herramientas de inteligencia artificial.',
    url: 'https://ytubviral.com/blog',
    type: 'website',
    images: [{ url: '/og-blog.webp', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog — Estrategias, IA y crecimiento para YouTubers',
    description: 'Artículos prácticos sobre el algoritmo de YouTube, títulos virales, scripts con IA, thumbnails y monetización.',
    images: ['/og-blog.webp'],
  },
};

// JSON-LD del índice del blog (A3): Blog + lista de los últimos posts
function blogJsonLd(lang: Lang) { return {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'YTubViral Blog',
  url: `https://ytubviral.com${lang === 'en' ? '/en' : ''}/blog`,
  description: 'Artículos prácticos sobre el algoritmo de YouTube, títulos virales, scripts con IA, thumbnails y monetización.',
  publisher: { '@type': 'Organization', name: 'YTubViral', url: 'https://ytubviral.com' },
  blogPost: getPosts(lang).slice(0, 10).map((p) => ({
    '@type': 'BlogPosting',
    headline: p.title[lang],
    url: `https://ytubviral.com${lang === 'en' ? '/en' : ''}/blog/${p.slug}`,
    // date.en ('Oct 15, 2025') es el formato parseable — date.es no lo es
    datePublished: new Date(p.languages ? p.date[lang] : p.date.en).toISOString().slice(0, 10),
    author: { '@type': 'Person', name: p.author.name },
  })),
}; }

export default function BlogListPage() {
  const lang = getServerLang();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd(lang)).replace(/</g, '\\u003c') }} />
      {/* BlogContent es Server Component: se prerenderiza entero. El único trozo
          que usa searchParams es <BlogFilter>, con su propio Suspense dentro. */}
      <BlogContent lang={lang} />
    </>
  );
}
