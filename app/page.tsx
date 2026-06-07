import type { Metadata } from 'next';
import LandingContent from '@/components/LandingContent';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'YTubViral — Free YouTube SEO Score & AI Tools for Creators',
  description:
    'Paste any YouTube video and get an instant SEO score with specific fixes. Plus AI-powered titles, scripts, keyword research and competitor analysis. Start free.',
  alternates: { canonical: 'https://ytubviral.com' },
};

export default async function LandingPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'YTubViral',
      url: 'https://ytubviral.com',
      description: 'Free YouTube SEO Score and AI-powered growth toolkit for creators',
      publisher: { '@type': 'Organization', name: 'YTubViral' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'YTubViral',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://ytubviral.com',
      description: 'Free YouTube SEO Score with instant diagnostics. AI-powered titles, scripts, keyword research, competitor analysis and more. From €9.99/mo.',
      offers: [
        { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
        { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
        { '@type': 'Offer', price: '29.99', priceCurrency: 'EUR', name: 'Business' },
      ],
    },
  ];

  return <LandingContent jsonLd={jsonLd} />;
}
