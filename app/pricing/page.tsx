import type { Metadata } from 'next';
import Link from 'next/link';
import PricingSection from '@/components/PricingSection';
import PricingComparisonTable from '@/components/PricingComparisonTable';
import PricingFAQ from '@/components/PricingFAQ';
import { getServerLang } from '@/lib/server-lang';
import { LockIcon, UndoIcon, CancelIcon, ShieldCheckIcon } from '@/components/icons';

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
    <main className="min-h-screen" style={{ background: 'var(--yv-bg-0)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          // SoftwareApplication (no Product): YTubViral es software, no un producto
          // físico. `Product` + `offers` hace que Search Console exija campos de
          // comercio (hasMerchantReturnPolicy, shippingDetails) y lo marque como
          // error en "Fragmentos de productos" (detectado 31/08). El resto del
          // sitio ya usa SoftwareApplication.
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'YTubViral',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            description: 'AI-powered YouTube tools: SEO scoring, keyword research, competitor analysis, title generation, and more.',
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
      <div style={{ background: 'var(--yv-bg-0)' }}>
        <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { Icon: LockIcon, es: 'Pago seguro con Stripe', en: 'Secure payment via Stripe' },
            { Icon: UndoIcon, es: 'Garantía de 30 días', en: '30-day money-back' },
            { Icon: CancelIcon, es: 'Cancela cuando quieras', en: 'Cancel anytime' },
            { Icon: ShieldCheckIcon, es: 'Cumplimiento RGPD', en: 'GDPR compliant' },
          ].map((b, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <span className="text-zinc-400" aria-hidden><b.Icon size={24} /></span>
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
