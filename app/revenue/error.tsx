'use client';

export default function RevenueError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-bg-0)', color: 'var(--yv-text-1)' }}>
      <div className="text-center max-w-md px-6">
        <h1 className="font-display font-bold text-2xl text-white mb-4">Error en Ingresos</h1>
        <p className="font-mono-jb text-sm mb-2" style={{ color: 'var(--yv-text-3)' }}>
          {error.message}
        </p>
        <pre className="font-mono-jb text-[13px] text-left p-4 rounded-lg mb-6 overflow-auto max-h-40" style={{ background: 'var(--yv-bg-2)', color: 'var(--yv-text-4)' }}>
          {error.stack}
        </pre>
        <button onClick={reset} className="btn-offset px-6 py-2.5 text-sm font-display rounded-lg">
          Reintentar
        </button>
      </div>
    </div>
  );
}
