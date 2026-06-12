import type { Metadata } from 'next';

// /learn es la versión interna (dashboard) del Learning Hub público.
// noindex para que no compita con /features/learning-hub/* en Google.
export const metadata: Metadata = {
  title: 'Learning Hub',
  robots: { index: false, follow: true },
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
