import type { Metadata } from 'next';
import { Suspense } from 'react';
import SeoScoreClient from './SeoScoreClient';

export const metadata: Metadata = {
  title: 'Free YouTube SEO Score — Analyze Any Video',
  description:
    'Paste any YouTube video link and get an instant SEO score from 0 to 100 with AI-powered recommendations. Free, no signup required.',
  alternates: { canonical: 'https://ytubviral.com/seo-score' },
};

export default function SeoScorePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <SeoScoreClient />
    </Suspense>
  );
}
