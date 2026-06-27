import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Anatomía de un título de YouTube: análisis de 1.814 vídeos',
  description:
    'Analizamos los títulos de 1.814 vídeos reales de YouTube (trending global + top por nicho). Datos sobre longitud, números, listicles y palabras gancho de los títulos que funcionan.',
  alternates: { canonical: 'https://ytubviral.com/youtube-title-study' },
  openGraph: {
    title: 'La anatomía de un título de YouTube: 1.814 vídeos analizados',
    description: 'Estudio de datos: qué tienen en común los títulos de YouTube que funcionan. Longitud, números, listicles y palabras gancho, con datos reales.',
    url: 'https://ytubviral.com/youtube-title-study',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

const articleLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'La anatomía de un título de YouTube: análisis de 1.814 vídeos',
  description: 'Estudio de datos sobre los títulos de 1.814 vídeos reales de YouTube: longitud, números, listicles y palabras gancho de los títulos que más vistas consiguen.',
  url: 'https://ytubviral.com/youtube-title-study',
  datePublished: '2026-06-27',
  dateModified: '2026-06-27',
  author: { '@type': 'Organization', name: 'YTubViral', url: 'https://ytubviral.com' },
  publisher: { '@type': 'Organization', name: 'YTubViral', url: 'https://ytubviral.com' },
  image: 'https://ytubviral.com/og-image.png',
};

const datasetLd = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'Anatomía de títulos de YouTube — 1.814 vídeos',
  description: 'Métricas de título (longitud, números, listicles, palabras gancho, mayúsculas) calculadas sobre 1.814 vídeos reales de YouTube: 1.027 del chart mostPopular en 30 regiones y 787 de los más vistos en 16 nichos de creador.',
  url: 'https://ytubviral.com/youtube-title-study',
  datePublished: '2026-06-27',
  creator: { '@type': 'Organization', name: 'YTubViral', url: 'https://ytubviral.com' },
  measurementTechnique: 'YouTube Data API v3 (videos.list chart=mostPopular; search.list order=viewCount)',
  variableMeasured: ['title length', 'numbers in title', 'listicle format', 'hook words', 'capitalization', 'brackets'],
};

export default function StudyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd) }} />
      {children}
    </>
  );
}
