import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free YouTube Money Calculator — Estimate Earnings by Views & Niche | YTubViral',
  description:
    'Estimate how much a YouTube channel earns from AdSense based on monthly views and niche. Free, no signup, instant per-niche RPM ranges.',
  alternates: { canonical: 'https://ytubviral.com/youtube-money-calculator' },
  openGraph: {
    title: 'Free YouTube Money Calculator',
    description: 'Estimate YouTube AdSense earnings by views and niche. Free, no signup, instant.',
    url: 'https://ytubviral.com/youtube-money-calculator',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

const appLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'YouTube Money Calculator',
  url: 'https://ytubviral.com/youtube-money-calculator',
  description: 'Free tool to estimate YouTube AdSense earnings from monthly views and channel niche using general per-niche RPM ranges.',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  creator: { '@type': 'Organization', name: 'YTubViral', url: 'https://ytubviral.com' },
};

// FAQ en español para coincidir con el contenido renderizado por defecto (getServerLang = 'es').
const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '¿Cuánto paga YouTube por 1000 vistas?',
      acceptedAnswer: { '@type': 'Answer', text: 'Depende muchísimo del nicho y del país de la audiencia. El RPM neto al creador (lo que te queda tras el reparto de YouTube) suele ir de 1-4 $ en música o entretenimiento hasta 7-22 $ en finanzas o negocios. Esta calculadora usa rangos generales por nicho.' },
    },
    {
      '@type': 'Question',
      name: '¿Esta estimación incluye patrocinios?',
      acceptedAnswer: { '@type': 'Answer', text: 'No. Solo estima los ingresos de AdSense (anuncios). Muchos canales ganan más con patrocinios, membresías, afiliados o sus propios productos que con los anuncios. Considera esto un suelo, no un techo.' },
    },
    {
      '@type': 'Question',
      name: '¿Por qué un rango en vez de una cifra exacta?',
      acceptedAnswer: { '@type': 'Answer', text: 'Porque los ingresos reales varían según la época del año (el CPM sube en Q4), el porcentaje de vistas monetizables, la duración del vídeo y la audiencia. Un rango es más honesto que una cifra falsamente precisa.' },
    },
    {
      '@type': 'Question',
      name: '¿Necesito una cuenta?',
      acceptedAnswer: { '@type': 'Answer', text: 'No. La calculadora es gratis y funciona al instante en tu navegador. Si conectas tu canal con una cuenta gratuita, podrás ver tus ingresos reales por país y vídeo en lugar de una estimación.' },
    },
  ],
};

export default function MoneyCalculatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      {children}
    </>
  );
}
