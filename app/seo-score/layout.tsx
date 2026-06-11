import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free YouTube SEO Score Checker — Analyze Any Video | YTubViral',
  description:
    'Paste any YouTube video URL and get an instant SEO score from 0-100 with specific recommendations to improve rankings. Free, no signup required.',
  alternates: { canonical: 'https://ytubviral.com/seo-score' },
  openGraph: {
    title: 'Free YouTube SEO Score Checker',
    description: 'Paste any YouTube video URL and get an instant SEO score with recommendations. Free.',
    url: 'https://ytubviral.com/seo-score',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'YouTube SEO Score Checker',
  url: 'https://ytubviral.com/seo-score',
  description: 'Free tool to analyze any YouTube video SEO and get a score from 0 to 100 with specific improvement recommendations.',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  creator: { '@type': 'Organization', name: 'YTubViral', url: 'https://ytubviral.com' },
};

export default function SeoScoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
