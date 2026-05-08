import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'YTubViral — Join the Waitlist | Product Hunt Launch',
  description:
    '14 AI tools to grow on YouTube. Join the waitlist and get 50% off for 1 year. Launching on Product Hunt soon.',
  alternates: { canonical: 'https://ytubviral.com/launch' },
  openGraph: {
    title: 'YTubViral — 14 AI Tools to Grow on YouTube',
    description: 'Join the waitlist and get 50% off for 1 year. Launching on Product Hunt soon.',
    url: 'https://ytubviral.com/launch',
    siteName: 'YTubViral',
    images: [{ url: 'https://ytubviral.com/ph-assets/og-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YTubViral — 14 AI Tools to Grow on YouTube',
    description: 'Join the waitlist and get 50% off for 1 year.',
    images: ['https://ytubviral.com/ph-assets/og-image.png'],
  },
};

export default function LaunchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
