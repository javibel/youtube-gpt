import type { Metadata } from 'next';
import ToolsContent from '@/components/ToolsContent';

export const metadata: Metadata = {
  title: 'Herramientas Gratis de YouTube | Free YouTube Tools — YTubViral',
  description:
    'Herramientas gratis para creadores de YouTube: SEO Score, Tendencias, Generador IA, Keywords y más. Sin registro. / Free YouTube tools: SEO Score, Trends, AI Generator, Keyword Research and more. No signup.',
  alternates: { canonical: 'https://ytubviral.com/tools' },
};

export default function ToolsPage() {
  return <ToolsContent />;
}
