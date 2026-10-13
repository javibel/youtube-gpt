'use client';

import { useState, useEffect } from 'react';
import { useLang } from '@/components/LangProvider';
import { hasAcceptedWaitlistResponse } from '@/lib/waitlist-response';

type Lang = 'es' | 'en';

const COPY = {
  es: {
    placeholder: 'tu@email.com',
    cta: 'Reservar mi plaza',
    sending: 'Apuntando...',
    success: 'Solicitud recibida.',
    successSub: 'Esto confirma tu solicitud, no la entrega de un correo.',
    already: 'Ya estás apuntado. Te avisaremos el día del lanzamiento.',
    errorEmail: 'Introduce un email válido.',
    errorServer: 'Solicitud sin confirmar. Puede seguir pendiente.',
    spotsLabel: 'solicitudes registradas',
  },
  en: {
    placeholder: 'you@email.com',
    cta: 'Reserve my spot',
    sending: 'Joining...',
    success: 'Request received.',
    successSub: 'This confirms your request, not email delivery.',
    already: "You're already on the list. We'll notify you on launch day.",
    errorEmail: 'Please enter a valid email.',
    errorServer: 'Request unconfirmed. It may still be pending.',
    spotsLabel: 'registered requests',
  },
};

export default function LaunchClient() {
  const serverLang = useLang();
  const [lang] = useState<Lang>(serverLang);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [count, setCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch('/api/waitlist', { credentials: 'omit', redirect: 'error', cache: 'no-store' }).then(async r => { const d = await r.json(); if (r.status === 200 && d && !Array.isArray(d) && Object.keys(d).length === 1 && Number.isSafeInteger(d.count) && d.count >= 0) setCount(d.count); }).catch(() => {});
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
        method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          lang,
          source: params.get('ref') || 'launch-page',
          referrer: params.get('utm_source') || document.referrer || null,
        }),
      });
      const data = await res.json();
      if (!hasAcceptedWaitlistResponse(res.status, data)) throw new Error('Request unconfirmed');
      setState('success');
    } catch {
      setErrorMsg(t.errorServer);
      setState('error');
    }
  };

  return (
    <>
      {state === 'success' ? (
        <div className="text-center bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 mb-12">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">
            {t.success}
          </h2>
          <p className="text-zinc-400">
            {t.successSub}
          </p>

        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-12">
          <input
            type="email"
            aria-label={lang === 'en' ? 'Email' : 'Correo electrónico'}
            autoComplete="email"
            maxLength={254}
            required
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

      {count !== null && state !== 'success' && (
        <p className="text-center text-sm text-zinc-500 -mt-8 mb-12">
          {count}+ {t.spotsLabel}
        </p>
      )}
    </>
  );
}
