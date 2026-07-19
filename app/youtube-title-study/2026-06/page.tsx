import { Suspense } from 'react';
import StudyClient from './StudyClient';

export default function YoutubeTitleStudyArchivePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <StudyClient />
    </Suspense>
  );
}
