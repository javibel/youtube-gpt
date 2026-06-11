'use client';

import { useState, useEffect } from 'react';
import { useLang } from '@/components/LangProvider';

type Lang = 'es' | 'en';

const COPY = {
  es: {
    placeholder: 'tu@email.com',
    cta: 'Reservar mi plaza',
    sending: 'Apuntando...',
    success: 'Estás dentro.',
    successSub: 'Te avisaremos el día del lanzamiento. Comparte con otros creadores para subir de posición.',
    already: 'Ya estás apuntado. Te avisaremos el día del lanzamiento.',
    errorEmail: 'Introduce un email válido.',
    errorServer: 'Error. Inténtalo de nuevo.',
    spotsLabel: 'creadores en la lista',
  },
  en: {
    placeholder: 'you@email.com',
    cta: 'Reserve my spot',
    sending: 'Joining...',
    success: "You're in.",
    successSub: "We'll notify you on launch day. Share with other creators to move up.",
    already: "You're already on the list. We'll notify you on launch day.",
    errorEmail: 'Please enter a valid email.',
    errorServer: 'Error. Please try again.',
    spotsLabel: 'creators on the list',
  },
};

export default function LaunchClient() {
  const serverLang = useLang();
  const [lang] = useState<Lang>(serverLang);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'already' | 'error'>('idle');
  const [count, setCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
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
    <>
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
    </>
  );
}
