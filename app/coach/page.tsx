'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function CoachPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('es');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLang(getLangClient()); }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError('');
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context: messages }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === 'pro_required') {
          setError(t('Necesitas el plan Pro para usar el Coach.', 'You need the Pro plan to use the Coach.'));
        } else if (json.error === 'throttled') {
          setError(t('Espera unos segundos antes de enviar otro mensaje.', 'Wait a few seconds before sending another message.'));
        } else {
          setError(json.error || t('Error de conexión', 'Connection error'));
        }
        return;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: json.reply }]);
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('AI Coach', 'AI Coach')}</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para hablar con tu coach.', 'Sign in to talk to your coach.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  const suggestions = [
    t('¿Cómo puedo mejorar mi CTR?', 'How can I improve my CTR?'),
    t('¿Qué tipo de contenido debería crear?', 'What type of content should I create?'),
    t('Analiza mis últimos vídeos', 'Analyze my recent videos'),
    t('¿Cómo compito con otros canales?', 'How do I compete with other channels?'),
  ];

  return (
    <div className="min-h-screen grain flex flex-col" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      {/* Header */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/dashboard" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
              <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
            </svg>
            <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </a>
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              {t('Panel', 'Dashboard')}
            </a>
            <a href="/seo-score" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              SEO Score
            </a>
            <a href="/research" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              {t('Investigar', 'Research')}
            </a>
            <a href="/profile" title={t('Mi perfil', 'My profile')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-white/30 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </a>
            <button onClick={() => signOut({ callbackUrl: '/' })} title={t('Cerrar sesión', 'Sign out')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-red-500/50 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Chat area */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-6">
        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-1">
            AI Coach
          </h1>
          <p className="text-zinc-500 font-mono-jb text-xs">
            {t('Tu asesor personal de crecimiento en YouTube', 'Your personal YouTube growth advisor')}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 mb-4 overflow-y-auto min-h-0" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {messages.length === 0 && (
            <div className="space-y-3 mt-8">
              <p className="text-zinc-500 font-mono-jb text-xs text-center mb-4">
                {t('Pregúntame sobre tu canal, estrategia, SEO, competencia...', 'Ask me about your channel, strategy, SEO, competition...')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); }}
                    className="text-left text-sm font-mono-jb px-4 py-3 rounded-lg border border-white/10 hover:border-white/25 transition text-zinc-400 hover:text-white"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 text-sm font-mono-jb leading-relaxed ${
                  msg.role === 'user'
                    ? 'text-white'
                    : 'text-zinc-300 border border-white/10'
                }`}
                style={{
                  background: msg.role === 'user'
                    ? 'rgba(155, 32, 32, 0.35)'
                    : 'rgba(255,255,255,0.04)',
                }}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl px-4 py-3 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-center">
              <span className="inline-block text-red-400 text-xs font-mono-jb px-3 py-2 rounded border border-red-500/20" style={{ background: 'rgba(155,32,32,0.15)' }}>
                {error}
              </span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-white/10 pt-4">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('Escribe tu pregunta...', 'Type your question...')}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-white/15 px-4 py-3 text-sm font-mono-jb text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition"
              style={{ background: 'rgba(255,255,255,0.04)' }}
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="btn-offset px-5 py-3 text-sm font-display rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              )}
            </button>
          </div>
          <p className="text-zinc-600 text-[10px] font-mono-jb mt-2 text-center">
            {t('El coach usa los datos reales de tu canal para darte consejos personalizados.', 'The coach uses your real channel data to give you personalized advice.')}
          </p>
        </div>
      </div>
    </div>
  );
}
