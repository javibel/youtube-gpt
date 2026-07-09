import type { Metadata } from 'next';
import AffiliatesClient from './AffiliatesClient';

export const metadata: Metadata = {
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

export default function AffiliatesPage() {
  return <AffiliatesClient />;
}
