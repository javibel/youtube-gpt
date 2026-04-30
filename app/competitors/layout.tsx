import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Analizar competidores YouTube — YTubViral',
  description:
    'Analiza los canales de YouTube de tu competencia. Descubre sus vídeos más exitosos, frecuencia de subida, keywords y estrategias de crecimiento.',
  alternates: { canonical: 'https://ytubviral.com/competitors' },
};

export default function CompetitorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
