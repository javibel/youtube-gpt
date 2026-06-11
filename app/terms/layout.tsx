import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | Terms and Conditions',
  description:
    'Términos y condiciones de uso del servicio YTubViral: planes, pagos, derechos y obligaciones. | YTubViral terms of service: plans, payments, rights and obligations.',
  alternates: { canonical: 'https://ytubviral.com/terms' },
  robots: { index: true, follow: true },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
