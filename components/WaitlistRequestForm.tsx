'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { beginWaitlist, observeWaitlist, retireWaitlistProgress, canObserveWaitlist, claimWaitlistAccepted, waitlistBlocked, subscribeWaitlist, waitlistReferrer, type WaitlistAttempt, type WaitlistOutcome } from '@/lib/waitlist-client';

type Props = { lang: 'es' | 'en'; variant?: 'inline' | 'popup' | 'launch'; source?: string; isActive?: () => boolean };
type Context = { email: string; lang: 'es' | 'en'; source: string; referrer: string | null; path: string; query: string; browserSearch: string };
export default function WaitlistRequestForm(props: Props) {
  return <Suspense fallback={null}><RequestForm {...props} /></Suspense>;
}
function RequestForm({ lang, variant = 'inline', source: suppliedSource = 'homepage-cta', isActive }: Props) {
  const path = usePathname(), query = useSearchParams().toString();
  const params = new URLSearchParams(query);
  const source = variant === 'popup' ? 'exit:' + path : variant === 'launch' ? params.get('ref') || 'launch-page' : suppliedSource;
  const referrer = waitlistReferrer(params.get('utm_source') || (typeof document === 'undefined' ? null : document.referrer));
  const [email, setEmail] = useState(''), [waiting, setWaiting] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<WaitlistOutcome>(), [accepted, setAccepted] = useState(false), [, renderLane] = useState(0);
  const mounted = useRef(true), selection = useRef<Context | undefined>(undefined);
  const command = useRef<{ attempt: WaitlistAttempt; context: Context; observer?: ReturnType<typeof observeWaitlist> } | undefined>(undefined);
  if (!selection.current || selection.current.email !== email || selection.current.lang !== lang || selection.current.source !== source
    || selection.current.referrer !== referrer || selection.current.path !== path || selection.current.query !== query)
    selection.current = { email, lang, source, referrer, path, query, browserSearch: typeof window === 'undefined' ? '' : window.location.search };
  const current = selection.current;
  const live = () => mounted.current && selection.current === current && (!isActive || isActive()) && window.location.pathname === current.path && window.location.search === current.browserSearch;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; const old = command.current; if (old) { retireWaitlistProgress(old.attempt); old.observer?.retire(); } };
  }, []);
  useEffect(() => subscribeWaitlist(() => renderLane(v => v + 1)), []);
  useEffect(() => {
    const old = command.current;
    if (old && old.context !== current) { retireWaitlistProgress(old.attempt); old.observer?.retire(); setWaiting(false); setResult(undefined); setAccepted(false); setError(''); }
  }, [current]);
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const retireField = () => { const old = command.current; if (old) { retireWaitlistProgress(old.attempt); old.observer?.retire(); } setWaiting(false); setResult(undefined); setAccepted(false); setError(''); };
  const observe = async (attempt: WaitlistAttempt) => {
    if (!live() || !canObserveWaitlist(attempt, current)) return;
    const observer = observeWaitlist(attempt, current, live); command.current = { attempt, context: current, observer }; setWaiting(true); setError('');
    const outcome = await observer.promise;
    if (!live() || command.current?.observer !== observer) return;
    setWaiting(false); setResult(outcome); setAccepted(claimWaitlistAccepted(attempt, current, outcome));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!live() || waiting || waitlistBlocked() || accepted) return;
    const attempt = beginWaitlist({ email, lang, source, referrer }, current, live);
    if (!attempt) { setError(t('Revisa el correo y los datos de la solicitud.', 'Check the email and request details.')); return; }
    command.current = { attempt, context: current }; void observe(attempt);
  };
  const own = command.current, pending = waitlistBlocked(), canObserve = !!own && own.context === current && canObserveWaitlist(own.attempt, current);
  const formClass = variant === 'inline' ? 'mt-10 flex flex-col sm:flex-row flex-wrap gap-3 justify-center max-w-lg mx-auto'
    : variant === 'launch' ? 'flex flex-col sm:flex-row flex-wrap gap-3 max-w-md mx-auto mb-12' : 'flex flex-col gap-3';
  const inputClass = variant === 'inline' ? 'yv-input flex-1 py-4 text-white placeholder:text-zinc-600 font-mono-jb text-[15px]'
    : 'flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#e84d5b]';
  if (accepted && own?.context === current) return <div role="status" className={variant === 'launch' ? 'text-center bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 mb-12' : 'mt-4 text-center'}>
    <p className="text-green-400 font-display font-bold">{t('Solicitud recibida', 'Request received')}</p>
    <p className="text-zinc-500 text-sm mt-3">{t('Esto confirma tu solicitud, no la entrega de un correo.', 'This confirms your request, not email delivery.')}</p>
  </div>;
  return <form onSubmit={submit} className={formClass} aria-busy={waiting}>
    <input type="email" aria-label={t('Correo electrónico', 'Email')} autoComplete="email" maxLength={254} required value={email}
      onChange={e => { retireField(); setEmail(e.target.value); }} placeholder={t('tu@email.com', 'your@email.com')} className={inputClass} />
    <button type="submit" disabled={waiting || pending} className="btn-offset px-8 py-3.5 text-sm font-display font-bold disabled:opacity-50 whitespace-nowrap">
      {waiting ? t('Comprobando...', 'Checking...') : t('Unirme a la lista →', 'Join the list →')}
    </button>
    {error ? <p role="alert" className="w-full text-red-400 text-sm">{error}</p> : null}
    {result?.status === 'unconfirmed' || pending && !waiting ? <p role="status" className="w-full text-zinc-400 text-sm">
      {t('Solicitud sin confirmar. Puede seguir pendiente.', 'Request unconfirmed. It may still be pending.')}
    </p> : null}
    {result?.status === 'invalid' || result?.status === 'rate-limited' ? <p role="alert" className="w-full text-red-400 text-sm">
      {result.status === 'rate-limited' ? t('Demasiadas solicitudes. Espera antes de intentarlo de nuevo.', 'Too many requests. Wait before trying again.') : t('Revisa los datos de la solicitud.', 'Check the request details.')}
    </p> : null}
    {result?.status === 'unconfirmed' && canObserve ? <button type="button" disabled={waiting} onClick={() => { if (own) void observe(own.attempt); }} className="w-full text-zinc-400 text-sm">
      {t('Consultar solicitud pendiente', 'Check pending request')}
    </button> : null}
  </form>;
}
