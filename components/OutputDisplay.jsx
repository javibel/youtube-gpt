import { useState } from 'react';

export default function OutputDisplay({ output, loading, onRegenerate, onCopy }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="yv-glass p-6 min-h-[420px] flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h3 className="yv-eyebrow">Resultado</h3>
        {output && !loading && (
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className={`yv-chip text-[13px] px-4 py-1.5 font-medium ${copied ? 'opacity-70' : ''}`}
            >
              {copied ? '✓ Copiado' : '⎘ Copiar'}
            </button>
            <button
              onClick={onRegenerate}
              className="yv-chip text-[13px] px-4 py-1.5 font-medium"
              style={{ color: 'var(--yv-brand-lift)' }}
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
              className="w-10 h-10 rounded-full border border-transparent spin-r"
              style={{ borderTopColor: 'var(--yv-brand)' }}
            />
            <p className="text-gray-500 text-sm">Generando contenido...</p>
          </div>
        ) : output ? (
          <div
            className="flex-1 p-5 overflow-y-auto max-h-[500px]"
            style={{ borderRadius: 'var(--yv-radius)', background: 'rgba(0,0,0,.34)', boxShadow: 'var(--yv-sunken)' }}
          >
            <pre className="text-gray-200 text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {output}
            </pre>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <div
              className="yv-glass yv-glass--brand w-16 h-16 flex items-center justify-center text-3xl"
              style={{ borderRadius: 'var(--yv-radius-lg)' }}
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
