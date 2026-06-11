import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aviso Legal | Legal Notice',
  description:
    'Aviso legal de ytubviral.com conforme a la LSSI-CE: titular del sitio, condiciones de acceso y uso. | Legal notice for ytubviral.com under Spanish LSSI-CE law: site owner, access and use conditions.',
  alternates: { canonical: 'https://ytubviral.com/legal' },
  robots: { index: true, follow: true },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
