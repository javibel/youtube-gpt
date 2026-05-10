'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const t = (lang: Lang, es: string, en: string) => lang === 'en' ? en : es;

export default function ChatWidget() {
  const { status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLang(getLangClient()); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Load chat history when first opened
  useEffect(() => {
    if (isOpen && !historyLoaded) {
      fetch('/api/chat')
        .then(r => r.json())
        .then(data => {
          if (data.messages?.length > 0) {
            setMessages(data.messages.map((m: { role: string; content: string }) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })));
          }
          setHistoryLoaded(true);
        })
        .catch(() => setHistoryLoaded(true));
    }
    if (isOpen) inputRef.current?.focus();
  }, [isOpen, historyLoaded]);

  if (status !== 'authenticated') return null;

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Throttle client-side (3s)
    const now = Date.now();
    if (now - lastSentAt < 3000) {
      setError(t(lang, 'Espera un momento antes de enviar otro mensaje.', 'Wait a moment before sending another message.'));
      return;
    }

    if (text.length > 500) {
      setError(t(lang, 'Mensaje demasiado largo (máx 500 caracteres).', 'Message too long (max 500 characters).'));
      return;
    }

    setError(null);
    setInput('');
    setLastSentAt(now);

    const newUserMsg: Message = { role: 'user', content: text };
    const prevMessages = messages;
    const updatedMessages = [...prevMessages, newUserMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, lang }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t(lang, 'Error al enviar el mensaje.', 'Error sending message.'));
        setMessages(prevMessages);
        if (data.limitReached) setRemaining(0);
      } else {
        const assistantMsg: Message = { role: 'assistant', content: data.reply };
        setMessages([...updatedMessages, assistantMsg]);
        if (typeof data.remaining === 'number') setRemaining(data.remaining);
      }
    } catch {
      setError(t(lang, 'Error de conexión. Inténtalo de nuevo.', 'Connection error. Please try again.'));
      setMessages(prevMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isDisabled = isLoading || remaining === 0;

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
              <span className="text-sm font-semibold text-white">
                {t(lang, 'Asistente YTubViral', 'YTubViral Assistant')}
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/40 hover:text-white/80 transition-colors text-xl leading-none"
              aria-label={t(lang, 'Cerrar', 'Close')}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 && (
              <p className="text-white/40 text-[13px] text-center mt-6 leading-relaxed">
                {t(lang,
                  'Pregúntame sobre YTubViral o sobre cómo crear contenido para YouTube, TikTok o Instagram.',
                  'Ask me about YTubViral or how to create content for YouTube, TikTok or Instagram.'
                )}
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed"
                  style={{
                    background: msg.role === 'user' ? '#9B2020' : '#222',
                    color: '#fff',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="rounded-xl px-3 py-2 text-[13px]"
                  style={{ background: '#222', color: '#fff' }}
                >
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div
              className="px-4 py-2 text-[13px] text-red-400 border-t border-white/10 flex-shrink-0"
              style={{ background: '#1a1a1a' }}
            >
              {error}
            </div>
          )}

          {/* Remaining notice */}
          {remaining !== null && remaining <= 2 && remaining > 0 && (
            <div
              className="px-4 py-1.5 text-[13px] text-yellow-400/80 border-t border-white/10 flex-shrink-0"
              style={{ background: '#1a1a1a' }}
            >
              {remaining === 1
                ? t(lang, '1 mensaje restante hoy.', '1 message remaining today.')
                : t(lang, `${remaining} mensajes restantes hoy.`, `${remaining} messages remaining today.`)
              }
            </div>
          )}
          {remaining === 0 && (
            <div
              className="px-4 py-1.5 text-[13px] text-red-400/80 border-t border-white/10 flex-shrink-0"
              style={{ background: '#1a1a1a' }}
            >
              {t(lang,
                'Límite diario alcanzado. Vuelve mañana o actualiza a Pro.',
                'Daily limit reached. Come back tomorrow or upgrade to Pro.'
              )}
            </div>
          )}

          {/* Input */}
          <div
            className="flex items-center gap-2 px-3 py-3 border-t border-white/10 flex-shrink-0"
            style={{ background: '#1a1a1a' }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isDisabled
                ? t(lang, 'Sin mensajes disponibles hoy.', 'No messages available today.')
                : t(lang, 'Escribe tu pregunta...', 'Type your question...')
              }
              maxLength={500}
              disabled={isDisabled}
              className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/30 border border-white/10 focus:outline-none focus:border-white/30 disabled:opacity-40 min-w-0"
            />
            <button
              onClick={sendMessage}
              disabled={isDisabled || !input.trim()}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-30 flex-shrink-0"
              style={{ background: '#9B2020' }}
              aria-label={t(lang, 'Enviar', 'Send')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" fill="white" stroke="none" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{ background: '#9B2020' }}
        aria-label={isOpen
          ? t(lang, 'Cerrar asistente', 'Close assistant')
          : t(lang, 'Abrir asistente', 'Open assistant')
        }
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
