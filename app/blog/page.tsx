import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getServerLang } from '@/lib/server-lang';
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

export default function BlogListPage() {
  const lang = getServerLang();
  return (
    <Suspense>
      <BlogContent lang={lang} />
    </Suspense>
  );
}
