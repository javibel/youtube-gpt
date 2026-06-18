import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free YouTube Title Analyzer — Score Your Title 0-100 | YTubViral',
  description:
    'Type your YouTube video title and get an instant 0-100 score with concrete tips to improve CTR and SEO. Free, no signup, works before you publish.',
  alternates: { canonical: 'https://ytubviral.com/title-analyzer' },
  openGraph: {
    title: 'Free YouTube Title Analyzer',
    description: 'Score any YouTube title from 0-100 with instant CTR & SEO tips. Free, no signup.',
    url: 'https://ytubviral.com/title-analyzer',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

const appLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'YouTube Title Analyzer',
  url: 'https://ytubviral.com/title-analyzer',
  description: 'Free tool to score any YouTube video title from 0 to 100 with instant CTR and SEO recommendations, before publishing.',
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
      name: '¿Cuál es la longitud ideal de un título de YouTube?',
      acceptedAnswer: { '@type': 'Answer', text: 'Entre 40 y 70 caracteres. YouTube muestra el título completo en resultados y sugeridos hasta unos 70 caracteres; a partir de ahí lo recorta con puntos suspensivos. Menos de 30 desaprovecha el espacio para keywords y gancho.' },
    },
    {
      '@type': 'Question',
      name: '¿Sirven los números en los títulos?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. Los números ("7 trucos", "en 5 minutos", "2026") aumentan el CTR porque prometen contenido concreto y fácil de consumir. Úsalos cuando encajen de forma natural.' },
    },
    {
      '@type': 'Question',
      name: '¿Por qué penaliza escribir en mayúsculas?',
      acceptedAnswer: { '@type': 'Answer', text: 'Escribir varias palabras en mayúsculas se percibe como spam o clickbait agresivo y puede reducir la confianza del espectador. Resaltar una sola palabra clave funciona; el título entero en mayúsculas, no.' },
    },
    {
      '@type': 'Question',
      name: '¿Esta herramienta es gratis?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí, totalmente gratis y sin registro. El análisis se hace al instante en tu navegador. Si quieres que la IA genere títulos optimizados por ti, puedes crear una cuenta gratuita con 10 generaciones al mes.' },
    },
  ],
};

export default function TitleAnalyzerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      {children}
    </>
  );
}
