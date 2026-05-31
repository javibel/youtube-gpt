import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'YouTube Trending Videos Right Now — YTubViral',
  description:
    'See what\'s going viral on YouTube right now. Top 20 trending videos updated every 30 minutes with views per hour, engagement stats, and category breakdowns.',
  alternates: { canonical: 'https://ytubviral.com/trends' },
  openGraph: {
    title: 'YouTube Trending Videos Right Now',
    description: 'Top 20 trending videos updated every 30 minutes. See what\'s exploding on YouTube.',
    url: 'https://ytubviral.com/trends',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'YouTube Trending Explorer',
  url: 'https://ytubviral.com/trends',
  description: 'Free tool to see the top 20 trending YouTube videos in real time, updated every 30 minutes.',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  creator: { '@type': 'Organization', name: 'YTubViral', url: 'https://ytubviral.com' },
};

export default function TrendsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
