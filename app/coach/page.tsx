'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/components/LangProvider';
import DashboardShell from '@/components/DashboardShell';

type Lang = 'es' | 'en';
type CoachMode = 'create' | 'analyze' | 'optimize' | 'research';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MODES: { key: CoachMode; icon: string; label: { es: string; en: string }; desc: { es: string; en: string } }[] = [
  {
    key: 'create',
    icon: 'M12 5v14M5 12h14',
    label: { es: 'Crear', en: 'Create' },
    desc: { es: 'Ideas, títulos, scripts, hooks', en: 'Ideas, titles, scripts, hooks' },
  },
  {
    key: 'analyze',
    icon: 'M18 20V10M12 20V4M6 20v-6',
    label: { es: 'Analizar', en: 'Analyze' },
    desc: { es: 'Rendimiento, métricas, crecimiento', en: 'Performance, metrics, growth' },
  },
  {
    key: 'optimize',
    icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
    label: { es: 'Optimizar', en: 'Optimize' },
    desc: { es: 'SEO, títulos, descripciones, tags', en: 'SEO, titles, descriptions, tags' },
  },
  {
    key: 'research',
    icon: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
    label: { es: 'Investigar', en: 'Research' },
    desc: { es: 'Nicho, competencia, keywords, gaps', en: 'Niche, competition, keywords, gaps' },
  },
];

const MODE_SUGGESTIONS: Record<CoachMode, { es: string; en: string }[]> = {
  create: [
    { es: 'Dame 5 ideas de vídeos para mi nicho', en: 'Give me 5 video ideas for my niche' },
    { es: 'Escribe un guión para un vídeo tutorial', en: 'Write a script for a tutorial video' },
    { es: 'Dame hooks para los primeros 5 segundos', en: 'Give me hooks for the first 5 seconds' },
    { es: 'Sugiere 3 formatos que funcionen en mi canal', en: 'Suggest 3 formats that work for my channel' },
  ],
  analyze: [
    { es: 'Analiza mis últimos vídeos', en: 'Analyze my recent videos' },
    { es: '¿Qué patrón tienen mis vídeos más exitosos?', en: 'What pattern do my most successful videos have?' },
    { es: '¿Cómo está creciendo mi canal?', en: 'How is my channel growing?' },
    { es: 'Compara mi canal con mis competidores', en: 'Compare my channel with my competitors' },
  ],
  optimize: [
    { es: '¿Cómo puedo mejorar mi CTR?', en: 'How can I improve my CTR?' },
    { es: 'Sugiere mejores títulos para mis últimos vídeos', en: 'Suggest better titles for my recent videos' },
    { es: '¿Qué vídeos debería optimizar primero?', en: 'Which videos should I optimize first?' },
    { es: 'Mejora la descripción de mi último vídeo', en: 'Improve the description of my last video' },
  ],
  research: [
    { es: '¿Qué oportunidades hay en mi nicho?', en: 'What opportunities are there in my niche?' },
    { es: '¿Qué hacen mis competidores que yo no?', en: 'What do my competitors do that I don\'t?' },
    { es: 'Investiga keywords para mi próximo vídeo', en: 'Research keywords for my next video' },
    { es: '¿Qué temas tienen poca competencia?', en: 'What topics have low competition?' },
  ],
};

const MODE_COLORS: Record<CoachMode, string> = {
  create: '#22c55e',
  analyze: '#3b82f6',
  optimize: '#f59e0b',
  research: '#8b5cf6',
};

export default function CoachPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const lang = useLang();
  const [mode, setMode] = useState<CoachMode>('analyze');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Paywall al entrar (E1 #2): null = comprobando, false = free → pantalla de upgrade
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/user/stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => setIsPro(d?.stats?.isPro ?? false))
      .catch(() => setIsPro(false));
  }, [status]);

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
        body: JSON.stringify({ message: text, context: messages, mode, lang }),
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
          <p className="mb-6 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesión para hablar con tu coach.', 'Sign in to talk to your coach.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  // Comprobando plan: spinner breve
  if (isPro === null) {
    return (
      <DashboardShell>
        <div className="yv-page flex items-center justify-center" style={{ minHeight: '60vh' }}>
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  // Paywall ANTES de invertir esfuerzo: el free user no entra al chat (E1 #2)
  if (!isPro) {
    return (
      <DashboardShell>
        <div className="yv-page flex items-center justify-center" style={{ minHeight: '70vh' }}>
          <div className="max-w-md text-center px-6">
            <span className="yv-sidebar__badge inline-block mb-4">PRO</span>
            <h1 className="font-display font-bold text-3xl text-white mb-3">AI Coach</h1>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              {t(
                'Tu asesor de crecimiento personalizado: analiza tu canal, sugiere ideas, optimiza títulos y investiga a tu competencia conversando. Disponible en el plan Pro (50 mensajes/mes) y Business (ilimitado).',
                'Your personalized growth advisor: analyzes your channel, suggests ideas, optimizes titles and researches your competition conversationally. Available on Pro (50 messages/mo) and Business (unlimited).'
              )}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-8 text-left">
              {MODES.map(m => (
                <div key={m.key} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-white text-sm font-display font-bold mb-0.5">{m.label[lang]}</p>
                  <p className="text-zinc-500 text-[13px] leading-snug">{m.desc[lang]}</p>
                </div>
              ))}
            </div>
            <a href="/pricing" className="btn-offset inline-flex px-8 py-3 text-sm font-display">
              {t('Desbloquear con Pro — 9,99€/mes →', 'Unlock with Pro — €9.99/mo →')}
            </a>
            <p className="text-zinc-600 text-[13px] font-mono-jb mt-4">
              {t('Garantía de 30 días · Cancela cuando quieras', '30-day guarantee · Cancel anytime')}
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const suggestions = MODE_SUGGESTIONS[mode].map(s => t(s.es, s.en));

  function switchMode(newMode: CoachMode) {
    if (newMode !== mode) {
      setMode(newMode);
      // Don't clear messages — they can continue in a different mode
    }
  }

  return (
    <DashboardShell>
      <div className="yv-page flex-1 flex flex-col" style={{ height: 'calc(100vh - 56px)', minHeight: 0 }}>
        {/* Header — left-aligned like all other pages */}
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">AI COACH</span>
            <h1 className="yv-page-header__title">
              {t('Tu asesor de crecimiento', 'Your growth advisor')}
            </h1>
            <p className="yv-page-header__desc">
              {t('Pregúntame sobre tu canal, estrategia, SEO, competencia...', 'Ask me about your channel, strategy, SEO, competition...')}
            </p>
          </div>
        </header>

        {/* Mode Selector */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {MODES.map(m => {
            const active = mode === m.key;
            const color = MODE_COLORS[m.key];
            return (
              <button
                key={m.key}
                onClick={() => switchMode(m.key)}
                className={`rounded-lg border px-4 py-3 text-left transition ${active ? 'border-opacity-50' : 'border-white/8 hover:border-white/20'}`}
                style={{
                  background: active ? `${color}12` : 'rgba(255,255,255,0.02)',
                  borderColor: active ? `${color}40` : undefined,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? color : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={m.icon} />
                  </svg>
                  <span className="font-display font-bold text-[13px]" style={{ color: active ? color : '#d4d4d8' }}>
                    {m.label[lang]}
                  </span>
                </div>
                <span className="font-mono-jb text-[13px] hidden sm:block" style={{ color: 'var(--yv-text-4)' }}>{m.desc[lang]}</span>
              </button>
            );
          })}
        </div>

        {/* Messages — fills all remaining space */}
        <div className="flex-1 space-y-4 mb-4 overflow-y-auto min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); }}
                    className="text-left font-mono-jb px-5 py-4 rounded-lg hover:text-white transition text-[13px] leading-snug"
                    style={{ border: '1px solid var(--yv-border)', color: 'var(--yv-text-2)', background: 'rgba(255,255,255,0.03)' }}
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
                className="max-w-[80%] rounded-xl px-5 py-3.5 font-mono-jb leading-relaxed text-[13px]"
                style={{
                  background: msg.role === 'user'
                    ? 'rgba(155, 32, 32, 0.35)'
                    : 'var(--yv-bg-2)',
                  color: msg.role === 'user' ? 'var(--yv-text-1)' : 'var(--yv-text-2)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--yv-border)',
                }}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl px-5 py-3.5" style={{ background: 'var(--yv-bg-2)', border: '1px solid var(--yv-border)' }}>
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-center">
              <span className="inline-block text-red-400 text-[13px] font-mono-jb px-3 py-2 rounded border border-red-500/20" style={{ background: 'rgba(155,32,32,0.15)' }}>
                {error}
              </span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input — pinned at bottom */}
        <div className="pt-4 mt-auto" style={{ borderTop: '1px solid var(--yv-border)' }}>
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('Escribe tu pregunta...', 'Type your question...')}
              rows={1}
              className="flex-1 resize-none rounded-lg px-4 py-3 text-sm font-mono-jb focus:outline-none transition yv-input"
              style={{ background: 'var(--yv-bg-1)' }}
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
          <p className="text-[13px] font-mono-jb mt-2" style={{ color: 'var(--yv-text-4)' }}>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: MODE_COLORS[mode] }} />
              {t('Modo', 'Mode')}: {MODES.find(m => m.key === mode)?.label[lang]}
            </span>
            {' — '}
            {t('Datos reales de tu canal', 'Real channel data')}
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
