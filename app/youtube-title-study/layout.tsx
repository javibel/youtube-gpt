import type { Metadata } from 'next';

// Cifras derivadas del mismo dataset que renderiza la página (data/title-study-2026-07.json)
// — si se refresca el dataset, actualizar aquí también (metadata no puede importar del
// client component, pero sí del lib compartido).
import { STUDY_META, TOPIC_SLUGS } from '@/lib/title-study-data';

const fmtEs = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const TOTAL = STUDY_META.trending.sampleSize + STUDY_META.nicheGlobal.sampleSize;
const TOTAL_ES = fmtEs(TOTAL);

export const metadata: Metadata = {
  title: `Anatomía de un título de YouTube: análisis de ${TOTAL_ES} vídeos`,
  description:
    `Analizamos los títulos de ${TOTAL_ES} vídeos reales de YouTube (trending global + top por nicho). Datos sobre longitud, números, listicles y palabras gancho de los títulos que funcionan.`,
  alternates: { canonical: 'https://ytubviral.com/youtube-title-study' },
  openGraph: {
    title: `La anatomía de un título de YouTube: ${TOTAL_ES} vídeos analizados`,
    description: 'Estudio de datos: qué tienen en común los títulos de YouTube que funcionan. Longitud, números, listicles y palabras gancho, con datos reales.',
    url: 'https://ytubviral.com/youtube-title-study',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

const articleLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: `La anatomía de un título de YouTube: análisis de ${TOTAL_ES} vídeos`,
  description: `Estudio de datos sobre los títulos de ${TOTAL_ES} vídeos reales de YouTube: longitud, números, listicles y palabras gancho de los títulos que más vistas consiguen.`,
  url: 'https://ytubviral.com/youtube-title-study',
  datePublished: '2026-06-27',
  dateModified: STUDY_META.date,
  author: { '@type': 'Organization', name: 'YTubViral', url: 'https://ytubviral.com' },
  publisher: { '@type': 'Organization', name: 'YTubViral', url: 'https://ytubviral.com' },
  image: 'https://ytubviral.com/og-image.png',
};

const datasetLd = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: `Anatomía de títulos de YouTube — ${TOTAL_ES} vídeos`,
  description: `Métricas de título (longitud, números, listicles, palabras gancho, mayúsculas) calculadas sobre ${TOTAL_ES} vídeos reales de YouTube: ${fmtEs(STUDY_META.trending.sampleSize)} del chart mostPopular en ${STUDY_META.trending.regions} regiones y ${fmtEs(STUDY_META.nicheGlobal.sampleSize)} de los más vistos en ${TOPIC_SLUGS.length} nichos de creador (consultas EN+ES).`,
  url: 'https://ytubviral.com/youtube-title-study',
  datePublished: '2026-06-27',
  dateModified: STUDY_META.date,
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
