import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free YouTube Tools — SEO Score, Trends, AI Generator | YTubViral',
  description:
    'Free YouTube tools for creators: SEO Score analyzer, trending video explorer, AI title generator, keyword research, and more. No credit card required.',
  alternates: { canonical: 'https://ytubviral.com/tools' },
  openGraph: {
    title: 'Free YouTube Tools for Creators',
    description: 'SEO Score, Trending Explorer, AI Generator and 11 more tools to grow your YouTube channel.',
    url: 'https://ytubviral.com/tools',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
