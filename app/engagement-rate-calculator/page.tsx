import { Suspense } from 'react';
import EngagementRateClient from './EngagementRateClient';

export default function EngagementRatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <EngagementRateClient />
    </Suspense>
  );
}
