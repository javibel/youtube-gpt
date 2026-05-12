'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Lang = 'es' | 'en';

const COPY = {
  es: {
    badge: 'LANZAMIENTO EN PRODUCT HUNT',
    h1: '14 herramientas de IA para crecer en YouTube.',
    h1accent: 'Una sola plataforma.',
    sub: 'Apúntate a la lista de espera y consigue 50% de descuento durante 1 año cuando lancemos.',
    placeholder: 'tu@email.com',
    cta: 'Reservar mi plaza',
    sending: 'Apuntando...',
    success: 'Estás dentro.',
    successSub: 'Te avisaremos el día del lanzamiento. Comparte con otros creadores para subir de posición.',
    already: 'Ya estás apuntado. Te avisaremos el día del lanzamiento.',
    errorEmail: 'Introduce un email válido.',
    errorServer: 'Error. Inténtalo de nuevo.',
    tools: [
      'Generador de títulos virales', 'Scripts con IA', 'SEO Score', 'Keyword Research',
      'Análisis de competidores', 'Estimador de ingresos', 'A/B Testing', 'Mejor hora para publicar',
      'Calendario de contenido', 'Análisis de retención', 'Predictor de vídeos', 'Coach IA',
      'Trend Explorer', 'Learning Hub',
    ],
    spotsLabel: 'creadores en la lista',
    back: 'Volver al inicio',
    why: '¿Por qué apuntarse?',
    reasons: [
      ['50% durante 1 año', 'Los primeros en la lista pagan la mitad durante todo un año.'],
      ['Acceso anticipado', 'Serás de los primeros en probar las 14 herramientas antes del lanzamiento público.'],
      ['Vota en Product Hunt', 'Ayúdanos a llegar al #1 el día del lanzamiento y gana beneficios extra.'],
    ],
  },
  en: {
    badge: 'LAUNCHING ON PRODUCT HUNT',
    h1: '14 AI tools to grow on YouTube.',
    h1accent: 'One platform.',
    sub: 'Join the waitlist and get 50% off for 1 year when we launch.',
    placeholder: 'you@email.com',
    cta: 'Reserve my spot',
    sending: 'Joining...',
    success: "You're in.",
    successSub: "We'll notify you on launch day. Share with other creators to move up.",
    already: "You're already on the list. We'll notify you on launch day.",
    errorEmail: 'Please enter a valid email.',
    errorServer: 'Error. Please try again.',
    tools: [
      'Viral Title Generator', 'AI Scripts', 'SEO Score', 'Keyword Research',
      'Competitor Analysis', 'Revenue Estimator', 'A/B Testing', 'Best Time to Post',
      'Content Calendar', 'Retention Analysis', 'Video Predictor', 'AI Coach',
      'Trend Explorer', 'Learning Hub',
    ],
    spotsLabel: 'creators on the list',
    back: 'Back to home',
    why: 'Why join?',
    reasons: [
      ['50% off for 1 year', 'Early supporters pay half price for a full year.'],
      ['Early access', "Be among the first to try all 14 tools before the public launch."],
      ['Vote on Product Hunt', 'Help us reach #1 on launch day and earn extra perks.'],
    ],
  },
};

export default function LaunchPage() {
  const [lang, setLang] = useState<Lang>('es');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'already' | 'error'>('idle');
  const [count, setCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const saved = document.cookie.match(/lang=(es|en)/);
    if (saved) setLang(saved[1] as Lang);
    fetch('/api/waitlist').then(r => r.json()).then(d => setCount(d.count)).catch(() => {});
  }, []);

  const t = COPY[lang];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg(t.errorEmail);
      setState('error');
      return;
    }
    setState('loading');
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          lang,
          source: params.get('ref') || 'launch-page',
          referrer: params.get('utm_source') || document.referrer || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.alreadyJoined) {
        setState('already');
      } else {
        setState('success');
        setCount(data.position);
      }
    } catch {
      setErrorMsg(t.errorServer);
      setState('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="6 6 20 20" fill="none">
              <circle cx="16" cy="16" r="8" fill="#ee4d5e"/>
            </svg>
            <span className="font-bold text-[17px] tracking-tight">
              YTubViral<span style={{ color: '#e84d5b' }}>.</span>com
            </span>
          </Link>
          <button
            onClick={() => setLang(l => l === 'es' ? 'en' : 'es')}
            className="text-sm text-zinc-400 hover:text-white transition-colors border border-zinc-700 rounded px-2.5 py-1"
          >
            {lang === 'es' ? 'EN' : 'ES'}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-3xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-bold tracking-[0.2em] text-[#e84d5b] bg-[#e84d5b]/10 px-4 py-1.5 rounded-full mb-6">
            {t.badge}
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-4">
            {t.h1}<br />
            <span className="text-[#e84d5b]">{t.h1accent}</span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            {t.sub}
          </p>
        </div>

        {/* Form */}
        {state === 'success' || state === 'already' ? (
          <div className="text-center bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 mb-12">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">
              {state === 'success' ? t.success : t.already}
            </h2>
            <p className="text-zinc-400">
              {state === 'success' ? t.successSub : t.already}
            </p>
            {count !== null && (
              <p className="mt-4 text-sm text-zinc-500">
                #{count} {t.spotsLabel}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-12">
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
              placeholder={t.placeholder}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#e84d5b] transition-colors"
            />
            <button
              type="submit"
              disabled={state === 'loading'}
              className="bg-[#e84d5b] hover:bg-[#d43d4b] disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-lg transition-colors whitespace-nowrap"
            >
              {state === 'loading' ? t.sending : t.cta}
            </button>
          </form>
        )}

        {state === 'error' && (
          <p className="text-center text-red-400 text-sm -mt-8 mb-8">{errorMsg}</p>
        )}

        {count !== null && state !== 'success' && state !== 'already' && (
          <p className="text-center text-sm text-zinc-500 -mt-8 mb-12">
            {count}+ {t.spotsLabel}
          </p>
        )}

        {/* Tools grid */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-16">
          {t.tools.map((tool, i) => (
            <div
              key={i}
              className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-300 text-center"
            >
              {tool}
            </div>
          ))}
        </div>

        {/* Why section */}
        <h2 className="text-2xl font-bold text-center mb-8">{t.why}</h2>
        <div className="grid sm:grid-cols-3 gap-6 mb-16">
          {t.reasons.map(([title, desc], i) => (
            <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6">
              <div className="w-10 h-10 rounded-full bg-[#e84d5b]/15 flex items-center justify-center mb-4 text-[#e84d5b] font-bold">
                {i + 1}
              </div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-zinc-400">{desc}</p>
            </div>
          ))}
        </div>

        {/* Back */}
        <div className="text-center">
          <Link href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">
            {t.back}
          </Link>
        </div>
      </main>
    </div>
  );
}
