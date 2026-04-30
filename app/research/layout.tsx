import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Keyword Research YouTube — YTubViral',
  description:
    'Encuentra las mejores keywords para tus vídeos de YouTube. Analiza volumen de búsqueda, competencia y tendencias con la herramienta de keyword research de YTubViral.',
  alternates: { canonical: 'https://ytubviral.com/research' },
};

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
