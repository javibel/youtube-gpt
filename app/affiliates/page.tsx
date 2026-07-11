import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AFFILIATES_DORMANT } from '@/lib/features';
import AffiliatesClient from './AffiliatesClient';

// Gateado con generateMetadata: un `export const metadata` estático se evalúa
// aunque la página lance notFound(), y el título/OG del programa se colaba en
// el payload de la 404 — delataba justo lo que la hibernación quiere ocultar.
export async function generateMetadata(): Promise<Metadata> {
  if (AFFILIATES_DORMANT) return {};
  return {
    title: 'Programa de afiliados — 30% recurrente durante 12 meses | YTubViral',
    description: 'Recomienda YTubViral a tu audiencia y gana 30% de comisión recurrente durante 12 meses por cada suscriptor que traigas. Programa curado, sin letra pequeña.',
    alternates: { canonical: 'https://ytubviral.com/affiliates' },
    openGraph: {
      title: 'Programa de afiliados de YTubViral',
      description: '30% de comisión recurrente durante 12 meses por cada suscriptor Pro o Business que traigas.',
      url: 'https://ytubviral.com/affiliates',
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
  };
}

export default function AffiliatesPage() {
  if (AFFILIATES_DORMANT) notFound();
  return <AffiliatesClient />;
}
