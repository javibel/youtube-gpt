'use client';

import { useState } from 'react';

export default function WaitlistInline({ lang, source = 'homepage-cta' }: { lang: 'es' | 'en'; source?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'already' | 'error'>('idle');
  const [position, setPosition] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || state === 'loading') return;
    setState('loading');
    try {
      // Attribute origin so we know which channel fills the list (J2)
      let referrer: string | null = null;
      try {
        const params = new URLSearchParams(window.location.search);
        referrer = params.get('utm_source') || document.referrer || null;
      } catch { /* noop */ }
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source, referrer, lang }),
      });
      const data = await res.json();
      if (!res.ok) { setState('error'); return; }
      if (data.alreadyJoined) { setState('already'); return; }
      setPosition(data.position || 0);
      setState('done');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div className="mt-10 text-center">
        <div className="inline-flex items-center gap-3 bg-green-500/10 rounded-full px-6 py-3" style={{ boxShadow: 'inset 0 1px 0 rgba(34,197,94,.35)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          <span className="text-green-400 font-display font-bold">
            {lang === 'en' ? `You're #${position} on the list!` : `¡Eres el #${position} en la lista!`}
          </span>
        </div>
        <p className="text-zinc-500 text-sm mt-3">
          {lang === 'en' ? 'Check your inbox for a welcome email.' : 'Revisa tu bandeja para el email de bienvenida.'}
        </p>
      </div>
    );
  }

  if (state === 'already') {
    return (
      <div className="mt-10 text-center">
        <div className="inline-flex items-center gap-3 bg-yellow-500/10 rounded-full px-6 py-3" style={{ boxShadow: 'inset 0 1px 0 rgba(234,179,8,.35)' }}>
          <span className="text-yellow-400 font-display font-bold">
            {lang === 'en' ? 'You\'re already on the list!' : '¡Ya estás en la lista!'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 flex flex-col sm:flex-row gap-3 justify-center max-w-lg mx-auto">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={lang === 'en' ? 'your@email.com' : 'tu@email.com'}
        required
        className="yv-input flex-1 py-4 text-white placeholder:text-zinc-600 font-mono-jb text-[15px]"
      />
      <button
        type="submit"
        disabled={state === 'loading'}
        className="btn-offset px-8 py-4 text-[15px] font-display font-bold whitespace-nowrap disabled:opacity-50"
      >
        {state === 'loading'
          ? (lang === 'en' ? 'Joining...' : 'Uniendo...')
          : (lang === 'en' ? 'Join waitlist →' : 'Unirme a la lista →')}
      </button>
      {state === 'error' && (
        <p className="text-red-400 text-sm mt-2 sm:mt-0 sm:self-center">
          {lang === 'en' ? 'Something went wrong. Try again.' : 'Algo falló. Inténtalo de nuevo.'}
        </p>
      )}
    </form>
  );
}
