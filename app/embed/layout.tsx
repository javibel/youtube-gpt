import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free YouTube SEO Score Widget — Embed on Your Site | YTubViral',
  description:
    'Add a free YouTube SEO analyzer widget to your website. One line of HTML, no API key required. Analyze any video\'s SEO score instantly.',
  alternates: { canonical: 'https://ytubviral.com/embed' },
  openGraph: {
    title: 'Free YouTube SEO Score Widget',
    description: 'Embed a free YouTube SEO analyzer on your website. One line of HTML.',
    url: 'https://ytubviral.com/embed',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

export default function EmbedRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
