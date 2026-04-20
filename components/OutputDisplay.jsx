import { useState } from 'react';

export default function OutputDisplay({ output, loading, onRegenerate, onCopy }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="neon-card rounded-2xl p-6 min-h-[420px] flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Resultado</h3>
        {output && !loading && (
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className={`btn-neon text-xs px-4 py-1.5 rounded-lg font-medium ${copied ? 'opacity-70' : ''}`}
            >
              {copied ? '✓ Copiado' : '⎘ Copiar'}
            </button>
            <button
              onClick={onRegenerate}
              style={{ borderColor: 'rgba(204,0,255,0.5)', color: '#CC00FF', boxShadow: '0 0 8px rgba(204,0,255,0.15)' }}
              className="text-xs px-4 py-1.5 rounded-lg font-medium border transition hover:bg-purple-900/20"
            >
              ↺ Regenerar
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="w-10 h-10 rounded-full border border-transparent animate-spin"
              style={{ borderTopColor: 'var(--cyan)', boxShadow: '0 0 12px rgba(0,217,255,0.4)' }}
            />
            <p className="text-gray-500 text-sm">Generando contenido...</p>
          </div>
        ) : output ? (
          <div
            className="flex-1 rounded-xl p-5 overflow-y-auto max-h-[500px]"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <pre className="text-gray-200 text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {output}
            </pre>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: 'rgba(0,217,255,0.06)', border: '1px solid rgba(0,217,255,0.15)', boxShadow: '0 0 20px rgba(0,217,255,0.08)' }}
            >
              🚀
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              Completa el formulario y presiona<br />
              <span className="text-gray-500">"Generar Contenido"</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
