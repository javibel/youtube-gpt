import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad | Privacy Policy',
  description:
    'Política de privacidad de YTubViral: qué datos recogemos, cómo los tratamos y tus derechos RGPD. | YTubViral privacy policy: what data we collect, how we process it, and your GDPR rights.',
  alternates: { canonical: 'https://ytubviral.com/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
