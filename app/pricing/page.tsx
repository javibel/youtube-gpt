import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — Free, Pro & Business Plans',
  description:
    'Compare YTubViral plans. Free forever with 14 AI-powered YouTube tools. Pro at 9.99 EUR/mo for unlimited access. Business at 29.99 EUR/mo for teams.',
  alternates: { canonical: 'https://ytubviral.com/pricing' },
  openGraph: {
    title: 'YTubViral Pricing — Free, Pro & Business',
    description: 'Compare plans. Start free with 14 AI tools for YouTube creators.',
    url: 'https://ytubviral.com/pricing',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

export default function PricingPage() {
  redirect('/#pricing');
}
