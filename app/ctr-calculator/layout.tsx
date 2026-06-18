import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free YouTube CTR Calculator — Benchmark Your Click-Through Rate | YTubViral',
  description:
    'Calculate your YouTube CTR from impressions and clicks, and instantly benchmark it against YouTube averages. Free, no signup, instant results.',
  alternates: { canonical: 'https://ytubviral.com/ctr-calculator' },
  openGraph: {
    title: 'Free YouTube CTR Calculator',
    description: 'Calculate and benchmark your YouTube click-through rate instantly. Free, no signup.',
    url: 'https://ytubviral.com/ctr-calculator',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

const appLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'YouTube CTR Calculator',
  url: 'https://ytubviral.com/ctr-calculator',
  description: 'Free tool to calculate your YouTube CTR from impressions and clicks and benchmark it against YouTube averages.',
  applicationCategory: 'UtilitiesApplication',
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
      name: '¿Qué es un buen CTR en YouTube?',
      acceptedAnswer: { '@type': 'Answer', text: 'La mayoría de los vídeos tienen un CTR de impresiones de entre 2% y 10%. Por debajo de 2% suele indicar que la miniatura o el título no atraen; entre 4% y 6% es un buen rango; por encima de 6% es excelente. El CTR varía mucho según el nicho, el tamaño del canal y la fuente de tráfico.' },
    },
    {
      '@type': 'Question',
      name: '¿Cómo se calcula el CTR?',
      acceptedAnswer: { '@type': 'Answer', text: 'CTR = (clics ÷ impresiones) × 100. Si tu vídeo tuvo 10.000 impresiones y 500 clics, tu CTR es del 5%. Una impresión cuenta cada vez que tu miniatura se muestra a alguien en YouTube.' },
    },
    {
      '@type': 'Question',
      name: '¿Un CTR muy alto siempre es bueno?',
      acceptedAnswer: { '@type': 'Answer', text: 'No necesariamente. Un CTR altísimo con poca retención puede indicar clickbait: la gente entra pero se va enseguida, y YouTube deja de recomendar el vídeo. El objetivo es un buen CTR junto a una buena retención.' },
    },
    {
      '@type': 'Question',
      name: '¿Esta calculadora es gratis?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí, gratis y sin registro. El cálculo se hace al instante en tu navegador. Si quieres comparar miniaturas y títulos con A/B testing real, puedes crear una cuenta gratuita.' },
    },
  ],
};

export default function CtrCalculatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      {children}
    </>
  );
}
