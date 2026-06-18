import { Suspense } from 'react';
import CtrCalculatorClient from './CtrCalculatorClient';

export default function CtrCalculatorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <CtrCalculatorClient />
    </Suspense>
  );
}
