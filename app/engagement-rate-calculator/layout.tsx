import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free YouTube Engagement Rate Calculator — Benchmark Your Video | YTubViral',
  description:
    'Calculate your YouTube engagement rate from views, likes and comments, and benchmark it against YouTube averages. Free, no signup, instant.',
  alternates: { canonical: 'https://ytubviral.com/engagement-rate-calculator' },
  openGraph: {
    title: 'Free YouTube Engagement Rate Calculator',
    description: 'Calculate and benchmark your YouTube engagement rate instantly. Free, no signup.',
    url: 'https://ytubviral.com/engagement-rate-calculator',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

const appLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'YouTube Engagement Rate Calculator',
  url: 'https://ytubviral.com/engagement-rate-calculator',
  description: 'Free tool to calculate your YouTube engagement rate from views, likes and comments and benchmark it against YouTube averages.',
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
      name: '¿Cómo se calcula el engagement rate en YouTube?',
      acceptedAnswer: { '@type': 'Answer', text: 'La fórmula más común es (likes + comentarios) ÷ vistas × 100. Mide qué porcentaje de los que vieron el vídeo interactuaron de forma activa. Algunos creadores también suman las veces compartido o lo calculan sobre suscriptores.' },
    },
    {
      '@type': 'Question',
      name: '¿Qué es un buen engagement rate?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sobre vistas, un 2-4% es normal, un 4-6% es bueno y por encima del 6% es excelente. Los canales pequeños suelen tener engagement más alto porque su audiencia es más fiel. Varía mucho según el formato y el nicho.' },
    },
    {
      '@type': 'Question',
      name: '¿Por qué importa el engagement?',
      acceptedAnswer: { '@type': 'Answer', text: 'YouTube usa las señales de interacción para decidir a quién recomendar el vídeo. Un buen engagement indica que el contenido conecta, y eso ayuda a que el algoritmo lo distribuya más. Pedir likes y comentarios de forma natural en el vídeo sube la tasa.' },
    },
    {
      '@type': 'Question',
      name: '¿Esta calculadora es gratis?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí, gratis y sin registro. El cálculo se hace al instante en tu navegador. Con una cuenta gratuita puedes analizar el rendimiento completo de tu canal, no solo un vídeo.' },
    },
  ],
};

export default function EngagementRateLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      {children}
    </>
  );
}
