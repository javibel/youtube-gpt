import type { Metadata } from 'next';
import Link from 'next/link';
import PricingSection from '@/components/PricingSection';
import { getServerLang } from '@/lib/server-lang';

export const metadata: Metadata = {
  title: 'Pricing — Free, Pro & Business Plans | YTubViral',
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
  const lang = getServerLang();

  return (
    <main className="min-h-screen bg-black">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'YTubViral',
            description: 'AI-powered YouTube tools: SEO scoring, keyword research, competitor analysis, title generation, and more.',
            brand: { '@type': 'Brand', name: 'YTubViral' },
            url: 'https://ytubviral.com/pricing',
            offers: [
              { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: 'https://ytubviral.com/signup' },
              { '@type': 'Offer', name: 'Pro', price: '9.99', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: 'https://ytubviral.com/signup' },
              { '@type': 'Offer', name: 'Business', price: '29.99', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: 'https://ytubviral.com/signup' },
            ],
          }),
        }}
      />
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-4">
        <Link href="/" className="text-zinc-500 text-sm hover:text-white transition">
          ← {lang === 'en' ? 'Back to home' : 'Volver al inicio'}
        </Link>
      </div>
      <PricingSection lang={lang} />
    </main>
  );
}
