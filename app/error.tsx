'use client';

import { getLangClient } from '@/lib/get-lang-client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const lang = getLangClient();
  const isEn = lang === 'en';

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <div className="text-center max-w-md px-6">
        <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--red)' }}>
          {isEn ? 'ERROR' : 'ERROR'}
        </p>
        <h1 className="font-display font-bold text-3xl text-white mb-4">
          {isEn ? 'Something went wrong' : 'Algo salió mal'}
        </h1>
        <p className="text-zinc-400 text-sm mb-2 leading-relaxed">
          {error.message}
        </p>
        <button onClick={reset} className="btn-offset px-6 py-2.5 text-sm font-display rounded-lg mt-6">
          {isEn ? 'Retry' : 'Reintentar'}
        </button>
      </div>
    </div>
  );
}
