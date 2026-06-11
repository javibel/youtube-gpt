import type { Metadata } from 'next';
import Link from 'next/link';
import PricingSection from '@/components/PricingSection';
import PricingComparisonTable from '@/components/PricingComparisonTable';
import PricingFAQ from '@/components/PricingFAQ';
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

      {/* Trust badges */}
      <div className="border-b border-white/10 bg-black">
        <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { icon: '🔒', es: 'Pago seguro con Stripe', en: 'Secure payment via Stripe' },
            { icon: '↩️', es: 'Garantía de 30 días', en: '30-day money-back' },
            { icon: '✂️', es: 'Cancela cuando quieras', en: 'Cancel anytime' },
            { icon: '🇪🇺', es: 'Cumplimiento RGPD', en: 'GDPR compliant' },
          ].map((b, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <span className="text-2xl" aria-hidden>{b.icon}</span>
              <span className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-400">
                {lang === 'en' ? b.en : b.es}
              </span>
            </div>
          ))}
        </div>
      </div>

      <PricingComparisonTable lang={lang} />
      <PricingFAQ lang={lang} />
    </main>
  );
}
