'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

const PREVIEW_MESSAGES = [
  {
    role: 'user',
    content: '¿Cómo mejoro el CTR de mis títulos?',
  },
  {
    role: 'assistant',
    content: 'Ve a Generar > Títulos Virales, describe tu vídeo y recibirás 5 opciones optimizadas. Los títulos incluyen números, emociones y palabras clave de alto impacto para maximizar clics.',
  },
  {
    role: 'user',
    content: '¿Qué keywords debería usar para un canal de finanzas?',
  },
  {
    role: 'assistant',
    content: 'Usa la herramienta Keyword Research. Escribe términos como "inversión" o "ahorro" y verás nivel de competencia, puntuación de oportunidad y los vídeos más vistos. Busca keywords con oportunidad alta y competencia media.',
  },
];

export default function ChatWidgetPreview() {
  const [isOpen, setIsOpen] = useState(false);
  const { status } = useSession();

  // Si está autenticado, el widget real (ChatWidget) lo gestiona desde el layout
  if (status === 'authenticated') return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div
          className="w-80 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10"
          style={{ height: '420px', background: '#111' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0"
            style={{ background: '#1a1a1a' }}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-white">Asistente YTubViral</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/40 hover:text-white/80 transition-colors text-xl leading-none"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          {/* Conversación de ejemplo */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {PREVIEW_MESSAGES.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed"
                  style={{
                    background: msg.role === 'user' ? '#9B2020' : '#222',
                    color: '#fff',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div
            className="px-4 py-4 border-t border-white/10 flex-shrink-0"
            style={{ background: '#1a1a1a' }}
          >
            <p className="text-xs text-white/50 text-center mb-3">
              Crea una cuenta gratis para usar el asistente
            </p>
            <a
              href="/signup"
              className="block w-full text-center text-xs font-semibold py-2.5 rounded-lg text-white transition-opacity hover:opacity-90"
              style={{ background: '#9B2020' }}
            >
              Empezar gratis
            </a>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{ background: '#9B2020' }}
        aria-label={isOpen ? 'Cerrar asistente' : 'Abrir asistente'}
      >
        {isOpen ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </div>
  );
}
