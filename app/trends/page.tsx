import type { Metadata } from 'next';
import { Suspense } from 'react';
import TrendsClient from './TrendsClient';

export const metadata: Metadata = {
  title: "What's Viral on YouTube Right Now — Live Trends",
  description:
    'The 20 most explosive YouTube videos right now across 12 countries. Updated every 30 minutes. Filter by region, category, language and duration. Free.',
  alternates: { canonical: 'https://ytubviral.com/trends' },
};

export default function TrendsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <TrendsClient />
    </Suspense>
  );
}
