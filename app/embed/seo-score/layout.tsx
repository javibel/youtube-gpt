import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'YouTube SEO Score Widget — YTubViral',
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
