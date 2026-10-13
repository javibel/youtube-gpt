'use client';
import { Suspense, useEffect, useId, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { beginAffiliateApplication, observeAffiliateApplication, retireAffiliateApplicationProgress, canObserveAffiliateApplication, claimAffiliateApplicationAccepted,
  affiliateApplicationBlocked, affiliateApplicationDormant, subscribeAffiliateApplication, type AffiliateApplicationAttempt, type AffiliateApplicationOutcome } from '@/lib/affiliate-application-client';

type Context = { name: string; email: string; channelInfo: string; lang: 'es' | 'en'; path: string; query: string; browserSearch: string };
export default function AffiliateApplicationForm({ lang }: { lang: 'es' | 'en' }) {
  return <Suspense fallback={null}><RequestForm lang={lang} /></Suspense>;
}
function RequestForm({ lang }: { lang: 'es' | 'en' }) {
  const fieldId = useId();
  const path = usePathname(), query = useSearchParams().toString();
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [channelInfo, setChannelInfo] = useState('');
  const [waiting, setWaiting] = useState(false), [error, setError] = useState(''), [accepted, setAccepted] = useState(false);
  const [result, setResult] = useState<AffiliateApplicationOutcome>(), [, renderLane] = useState(0);
  const mounted = useRef(true), selection = useRef<Context | undefined>(undefined);
  const command = useRef<{ attempt: AffiliateApplicationAttempt; context: Context; observer?: ReturnType<typeof observeAffiliateApplication> } | undefined>(undefined);
  if (!selection.current || selection.current.name !== name || selection.current.email !== email || selection.current.channelInfo !== channelInfo
    || selection.current.lang !== lang || selection.current.path !== path || selection.current.query !== query)
    selection.current = { name, email, channelInfo, lang, path, query, browserSearch: typeof window === 'undefined' ? '' : window.location.search };
  const current = selection.current;
  const live = () => mounted.current && selection.current === current && window.location.pathname === current.path && window.location.search === current.browserSearch;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; const old = command.current; if (old) { retireAffiliateApplicationProgress(old.attempt); old.observer?.retire(); } };
  }, []);
  useEffect(() => subscribeAffiliateApplication(() => renderLane(v => v + 1)), []);
  useEffect(() => {
    const old = command.current;
    if (old && old.context !== current) { retireAffiliateApplicationProgress(old.attempt); old.observer?.retire(); setWaiting(false); setResult(undefined); setAccepted(false); setError(''); }
  }, [current]);
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const retireField = () => { const old = command.current; if (old) { retireAffiliateApplicationProgress(old.attempt); old.observer?.retire(); } setWaiting(false); setResult(undefined); setAccepted(false); setError(''); };
  const observe = async (attempt: AffiliateApplicationAttempt) => {
    if (!live() || !canObserveAffiliateApplication(attempt, current)) return;
    const observer = observeAffiliateApplication(attempt, current, live);
    command.current = { attempt, context: current, observer }; setWaiting(true); setError('');
    const outcome = await observer.promise;
    if (!live() || command.current?.observer !== observer) return;
    setWaiting(false); setResult(outcome); setAccepted(claimAffiliateApplicationAccepted(attempt, current, outcome));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!live() || waiting || affiliateApplicationBlocked() || accepted) return;
    const attempt = beginAffiliateApplication({ name, email, channelInfo, lang }, current, live);
    if (!attempt) { setError(t('Revisa los datos de la solicitud.', 'Check the application details.')); return; }
    command.current = { attempt, context: current }; void observe(attempt);
  };
  const own = command.current, pending = affiliateApplicationBlocked(), canObserve = !!own && own.context === current && canObserveAffiliateApplication(own.attempt, current);
  if (affiliateApplicationDormant()) return <p role="status" className="text-zinc-400 text-sm">{t('El programa no está disponible.', 'The program is unavailable.')}</p>;
  if (accepted && own?.context === current) return <div role="status" className="rounded-xl px-4 py-3 text-sm text-green-400">
    <p>{t('Solicitud recibida.', 'Request received.')}</p>
    <p>{t('Esto no confirma aprobación ni entrega de un correo.', 'This does not confirm approval or email delivery.')}</p>
  </div>;
  const labelClass = 'block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2';
  return <form onSubmit={submit} className="space-y-4 max-w-lg" aria-busy={waiting}>
    <div><label htmlFor={fieldId+'-name'} className={labelClass}>{t('Nombre', 'Name')}</label>
      <input id={fieldId+'-name'} name="name" type="text" autoComplete="name" maxLength={100} required value={name}
        onChange={e => { retireField(); setName(e.target.value); }} className="soft-field py-3 px-4 text-sm" placeholder={t('Tu nombre o el de tu canal', 'Your name or channel name')} />
    </div>
    <div><label htmlFor={fieldId+'-email'} className={labelClass}>{t('Correo electrónico', 'Email')}</label>
      <input id={fieldId+'-email'} name="email" type="email" autoComplete="email" maxLength={254} required value={email}
        onChange={e => { retireField(); setEmail(e.target.value); }} className="soft-field py-3 px-4 text-sm" placeholder="you@email.com" />
    </div>
    <div><label htmlFor={fieldId+'-channel'} className={labelClass}>{t('Tu canal/audiencia y cómo piensas promocionarlo', 'Your channel/audience and how you plan to promote it')}</label>
      <textarea id={fieldId+'-channel'} name="channelInfo" maxLength={2000} value={channelInfo} rows={4} onChange={e => { retireField(); setChannelInfo(e.target.value); }}
        className="soft-field py-3 px-4 text-sm" placeholder={t('Describe tu canal y audiencia', 'Describe your channel and audience')} />
    </div>
    {error ? <p role="alert" className="text-red-400 text-sm">{error}</p> : null}
    {result?.status === 'unconfirmed' || pending && !waiting ? <p role="status" className="text-zinc-400 text-sm">{t('Solicitud sin confirmar. Puede seguir pendiente.', 'Request unconfirmed. It may still be pending.')}</p> : null}
    {result && ['invalid', 'rate-limited', 'unavailable'].includes(result.status) ? <p role="alert" className="text-red-400 text-sm">
      {result.status === 'unavailable' ? t('El programa no está disponible.', 'The program is unavailable.') : result.status === 'rate-limited'
        ? t('Demasiadas solicitudes. Espera antes de intentarlo de nuevo.', 'Too many requests. Wait before trying again.') : t('Revisa los datos de la solicitud.', 'Check the application details.')}
    </p> : null}
    <button type="submit" disabled={waiting || pending} className="btn-offset py-3.5 px-7 font-display font-bold text-[15px] disabled:opacity-60">
      {waiting ? t('Comprobando...', 'Checking...') : t('Enviar solicitud →', 'Submit application →')}
    </button>
    {result?.status === 'unconfirmed' && canObserve ? <button type="button" disabled={waiting} onClick={() => { if (own) void observe(own.attempt); }} className="block text-zinc-400 text-sm">
      {t('Consultar solicitud pendiente', 'Check pending request')}
    </button> : null}
  </form>;
}
