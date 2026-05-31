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

export default function TrendsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
