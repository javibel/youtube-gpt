import { Suspense } from 'react';
import StudyClient from './StudyClient';

export default function YoutubeTitleStudyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <StudyClient />
    </Suspense>
  );
}
