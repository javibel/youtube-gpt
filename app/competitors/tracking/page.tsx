'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/components/LangProvider';
import DashboardShell from '@/components/DashboardShell';
import { FlameIcon, BoltIcon, LeafIcon } from '@/components/icons';
import { beginCompetitorDeletion, competitorDeletionBlocked, mergeCompetitorDeletions, retainedCompetitorDeletions } from '@/lib/competitor-delete-client';
import type { DeleteOutcome } from '@/lib/competitor-delete-client';
import { beginCompetitorListRead } from '@/lib/competitor-list-read';
import type { CompetitorRecord as Competitor } from '@/lib/competitor-list-read';
import { beginCompetitorCreation, competitorCreationBlocked, mergeCompetitorCreations, retainedCompetitorCreation } from '@/lib/competitor-create-client';
import type { CreationAttempt, CreationOutcome } from '@/lib/competitor-create-client';
import { beginOutlierRead } from '@/lib/outlier-read-client';
import type { OutlierRead, OutlierOutcome } from '@/lib/outlier-read-client';
import { beginCompetitorIntel, intelRetryAllowed } from '@/lib/competitor-intel-client';
import type { IntelRead, IntelOutcome } from '@/lib/competitor-intel-client';

type Lang = 'es' | 'en';

type IntelTab = 'trending' | 'new' | 'opportunities';

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function fmtHours(h: number, lang: Lang): string {
  if (h < 1) return lang === 'en' ? 'just now' : 'ahora';
  if (h < 24) return `${Math.round(h)}h`;
  const days = Math.round(h / 24);
  return lang === 'en' ? `${days}d ago` : `hace ${days}d`;
}

function GrowthBadge({ value, suffix }: { value: number; suffix: string }) {
  if (value === 0) return null;
  return (
    <span className="font-mono-jb text-[13px]" style={{ color: value > 0 ? '#22c55e' : '#e84d5b' }}>
      {value > 0 ? '+' : ''}{fmtNum(value)} <span style={{ color: 'var(--yv-text-4)' }}>{suffix}</span>
    </span>
  );
}

function Sparkline({ points, color = '#9B2020' }: { points: number[]; color?: string }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 120;
  const h = 24;
  const pts = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function CompetitorTrackingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const lang = useLang();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [listOwner, setListOwner] = useState('');
  const [listUnavailable, setListUnavailable] = useState(false);
  const [adding, setAdding] = useState(false);
  const [creationUnconfirmed, setCreationUnconfirmed] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');
  const [errorUpgrade, setErrorUpgrade] = useState(false);
  const [deleteStates, setDeleteStates] = useState<Record<string, 'pending' | 'unconfirmed' | 'rejected' | 'confirmed'>>({});
  const owner = { userId: session?.user?.id ?? '', email: session?.user?.email ?? '' };
  const ownerKey = JSON.stringify([status, owner.userId, owner.email]);
  const currentOwner = useRef(ownerKey); currentOwner.current = ownerKey;
  const currentRead = useRef<{ ownerKey: string; entry: ReturnType<typeof beginCompetitorListRead> | null }>({ ownerKey, entry: null });
  if (currentRead.current.ownerKey !== ownerKey) currentRead.current = { ownerKey, entry: null };
  const currentCreation = useRef<{ ownerKey: string; attempt: CreationAttempt | null }>({ ownerKey, attempt: null });
  if (currentCreation.current.ownerKey !== ownerKey) currentCreation.current = { ownerKey, attempt: null };
  const mounted = useRef(true);
  const channels = listOwner === ownerKey ? [...new Set(competitors.map(c => c.channelId))].sort() : [];
  const outlierScope = JSON.stringify([ownerKey, channels]);
  const currentOutliers = useRef<{ scope: string; reads: Record<string, OutlierRead> }>({ scope: outlierScope, reads: {} });
  if (currentOutliers.current.scope !== outlierScope) currentOutliers.current = { scope: outlierScope, reads: {} };
  type OutlierView = { read: OutlierRead; outcome: OutlierOutcome | { status: 'pending' } };
  const [outlierState, setOutlierState] = useState<{ scope: string; values: Record<string, OutlierView> }>({ scope: outlierScope, values: {} });
  const outlierMap = outlierState.scope === outlierScope ? outlierState.values : {};
  const [expandedOutliers, setExpandedOutliers] = useState<string | null>(null);
  const [intelTab, setIntelTab] = useState<IntelTab>('trending');
  const intelScope = JSON.stringify([ownerKey, lang, channels]);
  const currentIntel = useRef<{ scope: string; read: IntelRead | null }>({ scope: intelScope, read: null });
  if (currentIntel.current.scope !== intelScope) currentIntel.current = { scope: intelScope, read: null };
  type IntelView = { read: IntelRead; outcome: IntelOutcome | { status: 'pending' } };
  const [intelState, setIntelState] = useState<{ scope: string; value: IntelView | null }>({ scope: intelScope, value: null });
  const intel = intelState.scope === intelScope ? intelState.value : null;
  const intelData = intel?.outcome.status === 'ready' ? intel.outcome.data : null;
  const trending = intelData?.trending ?? [], newUploads = intelData?.newUploads ?? [], opportunities = intelData?.opportunities ?? [];
  const intelLoading = !intel || intel.outcome.status === 'pending';
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function applyDeletion(capturedOwner: string, id: string, outcome: DeleteOutcome) {
    if (!mounted.current || currentOwner.current !== capturedOwner) return;
    if (outcome.status === 'confirmed') setCompetitors(prev => prev.filter(c => c.id !== id));
    setDeleteStates(prev => ({ ...prev, [id]: outcome.status }));
  }
  function applyCreation(capturedOwner: string, attempt: CreationAttempt, outcome: CreationOutcome) {
    if (!mounted.current || currentOwner.current !== capturedOwner || currentCreation.current.attempt !== attempt) return;
    setAdding(false); setErrorUpgrade(false);
    setCreationUnconfirmed(outcome.status === 'unconfirmed' || competitorCreationBlocked(attempt.owner));
    if (outcome.status === 'confirmed') {
      setCompetitors(prev => mergeCompetitorDeletions(attempt.owner, mergeCompetitorCreations(attempt.owner, prev)));
      setUrlInput(prev => prev.trim() === attempt.input ? '' : prev); setError('');
    } else if (outcome.status === 'unconfirmed') {
      setError(t('El alta no está confirmada. Conservamos la solicitud original.', 'The addition is unconfirmed. The original request is retained.'));
    } else {
      const msgs: Record<string, string> = {
        limit_reached: t(`Has llegado al máximo de competidores de tu plan${outcome.max ? ` (${outcome.max})` : ''}.`, `You've reached your plan's competitor limit${outcome.max ? ` (${outcome.max})` : ''}.`),
        invalid_url: t('URL no válida. Usa youtube.com/@canal o youtube.com/channel/UCxxx', 'Invalid URL. Use youtube.com/@channel or youtube.com/channel/UCxxx'),
        channel_not_found: t('Canal no encontrado.', 'Channel not found.'),
        already_tracked: t('Ya estás siguiendo este canal.', 'Already tracking this channel.'),
      };
      setErrorUpgrade(outcome.error === 'limit_reached');
      setError(msgs[outcome.error] || t('No se pudo añadir el competidor.', 'The competitor could not be added.'));
    }
  }
  function observeCreation(capturedOwner: string, attempt: CreationAttempt) {
    currentCreation.current = { ownerKey: capturedOwner, attempt };
    const terminal = attempt.outcome ?? attempt.waitOutcome;
    if (terminal) applyCreation(capturedOwner, attempt, terminal);
    else { setAdding(true); setCreationUnconfirmed(false); setError(''); setErrorUpgrade(false); }
    void attempt.original.then(result => applyCreation(capturedOwner, attempt, result));
    void attempt.waiter.then(result => { if (attempt.outcome?.status !== 'confirmed') applyCreation(capturedOwner, attempt, result); });
  }
  function readCompetitors() {
    const capturedOwner = ownerKey;
    if (status !== 'authenticated' || !owner.userId || !mounted.current || currentOwner.current !== capturedOwner) return;
    const read = beginCompetitorListRead(owner);
    currentRead.current = { ownerKey: capturedOwner, entry: read };
    setListOwner(capturedOwner); setLoading(true); setListUnavailable(false);
    const apply = (outcome: Awaited<typeof read.original>) => {
      if (!mounted.current || currentOwner.current !== capturedOwner || currentRead.current.entry !== read) return;
      setCompetitors(prev => mergeCompetitorDeletions(owner, mergeCompetitorCreations(owner, outcome.status === 'ready' ? outcome.competitors : prev)));
      setListUnavailable(outcome.status !== 'ready'); setLoading(false);
    };
    void read.original.then(apply);
    void read.waiter.then(outcome => { if (read.outcome?.status !== 'ready') apply(outcome); });
  }
  useEffect(() => {
    setCompetitors([]); setDeleteStates({});
    setAdding(false); setCreationUnconfirmed(false); setError(''); setErrorUpgrade(false); setUrlInput('');
    setExpandedOutliers(null);
    setLoading(status === 'authenticated');
    setListOwner(ownerKey); setListUnavailable(false);
    if (status !== 'authenticated' || !owner.userId) { setLoading(false); setListUnavailable(status === 'authenticated'); return; }
    const capturedOwner = ownerKey;
    const creation = retainedCompetitorCreation(owner);
    if (creation) {
      if (creation.outcome?.status !== 'confirmed') setUrlInput(creation.input);
      observeCreation(capturedOwner, creation);
    } else if (competitorCreationBlocked(owner)) {
      setCreationUnconfirmed(true);
      setError(t('El alta anterior no está confirmada.', 'The previous addition is unconfirmed.'));
    }
    for (const attempt of retainedCompetitorDeletions<Competitor>(owner)) {
      setDeleteStates(prev => ({ ...prev, [attempt.row.id]: attempt.outcome?.status ?? attempt.waitOutcome?.status ?? 'pending' }));
      void attempt.waiter.then(result => { if (attempt.outcome?.status !== 'confirmed') applyDeletion(capturedOwner, attempt.row.id, result); });
      void attempt.original.then(result => applyDeletion(capturedOwner, attempt.row.id, result));
    }
    readCompetitors();
  }, [ownerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function observeOutlier(channelId: string, alive: () => boolean, retry?: OutlierRead) {
    const capturedOwner = ownerKey, capturedScope = outlierScope;
    if (status !== 'authenticated' || !owner.userId || listOwner !== capturedOwner || !mounted.current
      || currentOwner.current !== capturedOwner || currentOutliers.current.scope !== capturedScope || !channels.includes(channelId)) return;
    const previous = currentOutliers.current.reads[channelId];
    if (retry && (previous !== retry || retry.pending)) return;
    const read = retry ? beginOutlierRead(owner, { channelId, period: '90d', threshold: 10 })
      : previous ?? beginOutlierRead(owner, { channelId, period: '90d', threshold: 10 });
    currentOutliers.current.reads[channelId] = read;
    const apply = (outcome: OutlierView['outcome']) => {
      if (!alive() || !mounted.current || currentOwner.current !== capturedOwner || currentOutliers.current.scope !== capturedScope
        || currentOutliers.current.reads[channelId] !== read) return;
      setOutlierState(prev => ({ scope: capturedScope, values: { ...(prev.scope === capturedScope ? prev.values : {}), [channelId]: { read, outcome } } }));
    };
    apply(read.outcome ?? read.waitOutcome ?? { status: 'pending' });
    void read.original.then(apply);
    void read.waiter.then(result => { if (!read.outcome) apply(result); });
  }

  // Strict setup and remounts observe each original account/channel read.
  useEffect(() => {
    let active = true;
    for (const channelId of channels) observeOutlier(channelId, () => active);
    return () => { active = false; };
  }, [outlierScope]); // eslint-disable-line react-hooks/exhaustive-deps

  function observeIntel(alive: () => boolean = () => true, retry?: IntelRead) {
    const capturedOwner = ownerKey, capturedScope = intelScope;
    if (status !== 'authenticated' || !owner.userId || !channels.length || listOwner !== capturedOwner || !mounted.current
      || currentOwner.current !== capturedOwner || currentIntel.current.scope !== capturedScope) return;
    if (retry && (currentIntel.current.read !== retry || !intelRetryAllowed(retry))) return;
    const read = beginCompetitorIntel(owner, { language: lang, channelIds: channels }, retry);
    currentIntel.current.read = read;
    const apply = (outcome: IntelView['outcome']) => {
      if (!alive() || !mounted.current || currentOwner.current !== capturedOwner || currentIntel.current.scope !== capturedScope
        || currentIntel.current.read !== read) return;
      setIntelState({ scope: capturedScope, value: { read, outcome } });
    };
    apply(read.outcome ?? read.waitOutcome ?? { status: 'pending' });
    void read.original.then(apply);
    void read.waiter.then(outcome => { if (!read.outcome) apply(outcome); });
  }
  useEffect(() => {
    let active = true;
    observeIntel(() => active);
    return () => { active = false; };
  }, [intelScope]); // eslint-disable-line react-hooks/exhaustive-deps

  function addCompetitor() {
    const capturedOwner = ownerKey;
    if (!urlInput.trim() || status !== 'authenticated' || !owner.userId || currentOwner.current !== capturedOwner || !mounted.current) return;
    const attempt = beginCompetitorCreation(owner, urlInput);
    if (!attempt) { setAdding(false); setCreationUnconfirmed(true); setError(t('El alta anterior no está confirmada.', 'The previous addition is unconfirmed.')); return; }
    setUrlInput(attempt.input);
    observeCreation(capturedOwner, attempt);
  }

  async function removeCompetitor(id: string) {
    const capturedOwner = ownerKey;
    if (status !== 'authenticated' || !owner.userId || !mounted.current || currentOwner.current !== capturedOwner) return;
    const selected = competitors.find(c => c.id === id); if (!selected) return;
    const attempt = beginCompetitorDeletion(owner, selected);
    if (!attempt) { applyDeletion(capturedOwner, id, { status: 'unconfirmed' }); return; }
    setDeleteStates(prev => ({ ...prev, [id]: 'pending' }));
    void attempt.original.then(result => applyDeletion(capturedOwner, id, result));
    const result = await attempt.waiter;
    if (attempt.outcome?.status !== 'confirmed') applyDeletion(capturedOwner, id, result);
  }

  if (status === 'loading' || loading || listOwner !== ownerKey) {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--yv-bg-0)', color: 'var(--yv-text-2)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--yv-bg-0)', color: 'var(--yv-text-2)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Tracking', 'Tracking')}</h1>
          <p className="mb-6 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesión para continuar.', 'Sign in to continue.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="yv-page">
        {listUnavailable && <div role="status" className="mb-6 text-sm text-amber-300">
          <p>{t('No se pudo cargar la lista de competidores.', 'The competitor list could not be loaded.')}</p>
          {currentRead.current.entry?.pending && <p>{t('La lectura anterior sigue pendiente.', 'The previous read is still pending.')}</p>}
          <button type="button" onClick={readCompetitors} disabled={!owner.userId || currentRead.current.entry?.pending} className="btn-offset mt-2 px-4 py-2 disabled:opacity-50">{t('Reintentar lista', 'Retry list')}</button>
        </div>}
        {/* Title */}
        <div className="yv-page-header mb-8">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">
              {t('SEGUIMIENTO DE COMPETIDORES', 'COMPETITOR TRACKING')}
            </span>
            <h1 className="yv-page-header__title">
              {t('Tracking', 'Tracking')}<br />
              <span style={{ color: 'var(--yv-brand)' }}>{t('de competidores.', 'competitors.')}</span>
            </h1>
            <p className="yv-page-header__desc">
              {t(
                'Sigue a tus canales competidores. Monitorizamos suscriptores, vistas y vídeos cada 6 horas.',
                'Track your competitor channels. We monitor subscribers, views and videos every 6 hours.'
              )}
            </p>
          </div>
        </div>

        {/* Add competitor */}
        <div className="mb-8 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={urlInput}
            disabled={adding || creationUnconfirmed}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCompetitor()}
            placeholder={t('youtube.com/@canal o ID del canal', 'youtube.com/@channel or channel ID')}
            className="soft-field flex-1 px-4 py-3 font-mono-jb text-sm"
          />
          <button
            onClick={addCompetitor}
            disabled={adding || creationUnconfirmed || !owner.userId || !urlInput.trim()}
            className="btn-offset px-6 py-3 text-sm font-display disabled:opacity-50 flex items-center gap-2"
          >
            {adding ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            )}
            {t('Añadir', 'Add')}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg border border-red-500/30" style={{ background: 'rgba(232,77,91,0.08)' }}>
            <p className="text-sm text-red-400 font-mono-jb">
              {error}{' '}
              {errorUpgrade && (
                <a href="/pricing" className="underline" style={{ color: 'var(--yv-brand)' }}>
                  {t('Ampliar plan', 'Upgrade plan')}
                </a>
              )}
            </p>
          </div>
        )}

        {/* Competitor list */}
        {competitors.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(155,32,32,0.1)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--yv-brand)" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3 className="font-display font-bold text-xl text-white mb-2">
              {t('Sin competidores', 'No competitors yet')}
            </h3>
            <p className="font-mono-jb text-sm max-w-md mx-auto" style={{ color: 'var(--yv-text-3)' }}>
              {t(
                'Añade la URL de un canal de YouTube para empezar a seguir su crecimiento.',
                'Add a YouTube channel URL to start tracking their growth.'
              )}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {competitors.map(comp => (
            <div key={comp.id} className="yv-card p-5">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                {comp.channelThumb ? (
                  <img src={comp.channelThumb} alt="" className="w-12 h-12 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-lg" style={{ background: 'var(--yv-brand)' }}>
                    {comp.channelName[0]?.toUpperCase()}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <a href={`https://youtube.com/channel/${comp.channelId}`} target="_blank" rel="noopener noreferrer"
                        className="font-display font-bold text-white hover:underline">
                        {comp.channelName}
                      </a>
                      <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                        {t('Seguido desde', 'Tracked since')} {new Date(comp.addedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={() => removeCompetitor(comp.id)}
                      disabled={deleteStates[comp.id] === 'pending' || competitorDeletionBlocked(owner, comp.id)}
                      className="hover:text-red-400 transition p-1" style={{ color: 'var(--yv-text-4)' }}
                      title={t('Dejar de seguir', 'Untrack')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  {(deleteStates[comp.id] === 'unconfirmed' || (deleteStates[comp.id] !== 'pending' && competitorDeletionBlocked(owner, comp.id))) && <p role="status" className="text-sm text-amber-300 mb-3">{t('El borrado no está confirmado. Conservamos este competidor.', 'Deletion is unconfirmed. This competitor is kept.')}</p>}
                  {deleteStates[comp.id] === 'rejected' && !competitorDeletionBlocked(owner, comp.id) && <p role="status" className="text-sm text-red-400 mb-3">{t('No se pudo borrar el competidor.', 'The competitor could not be deleted.')}</p>}

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <p className="font-display font-bold text-white">{fmtNum(comp.subscribers)}</p>
                      <p className="font-mono-jb text-[13px] uppercase" style={{ color: 'var(--yv-text-4)' }}>{t('Subs', 'Subs')}</p>
                      {comp.growth && <GrowthBadge value={comp.growth.subs30d} suffix="30d" />}
                    </div>
                    <div>
                      <p className="font-display font-bold text-white">{fmtNum(comp.totalViews)}</p>
                      <p className="font-mono-jb text-[13px] uppercase" style={{ color: 'var(--yv-text-4)' }}>{t('Vistas', 'Views')}</p>
                      {comp.growth && <GrowthBadge value={comp.growth.views30d} suffix="30d" />}
                    </div>
                    <div>
                      <p className="font-display font-bold text-white">{fmtNum(comp.videoCount)}</p>
                      <p className="font-mono-jb text-[13px] uppercase" style={{ color: 'var(--yv-text-4)' }}>{t('Vídeos', 'Videos')}</p>
                    </div>
                  </div>

                  {/* Sparkline + Outlier badge row */}
                  {outlierMap[comp.channelId]?.outcome.status === 'pending' && <p role="status" className="text-sm mb-3" style={{ color: 'var(--yv-text-4)' }}>{t('Cargando outliers…', 'Loading outliers…')}</p>}
                  {outlierMap[comp.channelId]?.outcome.status === 'error' && <div role="status" className="text-sm mb-3 text-amber-300">
                    <p>{t('No se pudieron cargar los outliers.', 'Outliers could not be loaded.')}</p>
                    {outlierMap[comp.channelId].read.pending && <p>{t('La lectura anterior sigue pendiente.', 'The previous read is still pending.')}</p>}
                    <button className="underline disabled:opacity-50" aria-label={t(`Reintentar outliers de ${comp.channelName}`, `Retry outliers for ${comp.channelName}`)}
                      disabled={outlierMap[comp.channelId].read.pending}
                      onClick={() => observeOutlier(comp.channelId, () => true, outlierMap[comp.channelId].read)}>{t('Reintentar outliers', 'Retry outliers')}</button>
                  </div>}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {comp.snapshots.length > 2 && (
                        <>
                          <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{t('Subs', 'Subs')}</span>
                          <Sparkline points={comp.snapshots.map(s => s.subscribers)} />
                        </>
                      )}
                    </div>
                    {(() => {
                      const outcome = outlierMap[comp.channelId]?.outcome;
                      if (outcome?.status !== 'ready') return null;
                      const od = outcome.data;
                      if (od.outliers.length === 0) return <span className="text-sm" style={{ color: 'var(--yv-text-4)' }}>{t('Sin outliers en este periodo.', 'No outliers in this period.')}</span>;
                      return (
                        <button
                          onClick={() => { if (mounted.current && currentOwner.current === ownerKey && currentOutliers.current.scope === outlierScope) setExpandedOutliers(expandedOutliers === comp.channelId ? null : comp.channelId); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition hover:opacity-80"
                          style={{ background: 'rgba(255,107,0,0.12)', border: '1px solid rgba(255,107,0,0.25)' }}
                        >
                          <FlameIcon size={13} style={{ color: '#FF6B00' }} />
                          <span className="font-mono-jb text-[13px] font-bold" style={{ color: '#FF6B00' }}>
                            {od.outliers.length} outlier{od.outliers.length > 1 ? 's' : ''}
                          </span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="2.5"
                            style={{ transform: expandedOutliers === comp.channelId ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      );
                    })()}
                  </div>

                  {/* Expanded outlier videos */}
                  {expandedOutliers === comp.channelId && outlierMap[comp.channelId]?.outcome.status === 'ready' && (() => {
                    const outcome = outlierMap[comp.channelId].outcome;
                    if (outcome.status !== 'ready' || !outcome.data.outliers.length) return null;
                    return (
                    <div className="mt-3 pt-3 space-y-2" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }}>
                      <p className="font-mono-jb text-[13px] mb-2" style={{ color: 'var(--yv-text-4)' }}>
                        {t('Vídeos con 10x+ vistas sobre la mediana (90d)', 'Videos with 10x+ views above median (90d)')}
                      </p>
                      {outcome.data.outliers.slice(0, 5).map(v => (
                        <a key={v.videoId} href={`https://www.youtube.com/watch?v=${v.videoId}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition">
                          <div className="relative flex-shrink-0">
                            <img src={v.thumbnail} alt="" className="w-16 h-9 rounded object-cover" />
                            <span className="absolute -top-1 -right-1 font-mono-jb text-[8px] font-bold px-1 py-0.5 rounded-full"
                              style={{ background: '#FF6B00', color: '#000' }}>
                              {v.multiplier}x
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-zinc-300 truncate">{v.title}</p>
                            <span className="font-mono-jb text-[13px] px-1.5 py-0.5 rounded mt-0.5 inline-flex items-center gap-1"
                              style={{
                                background: v.type === 'viral' ? 'rgba(232,77,91,0.12)' : 'rgba(0,229,255,0.12)',
                                color: v.type === 'viral' ? '#e84d5b' : '#00E5FF',
                              }}>
                              {v.type === 'viral' ? <><BoltIcon size={11} /> Viral</> : <><LeafIcon size={11} /> Evergreen</>}
                            </span>
                          </div>
                          <p className="font-mono-jb text-[13px] font-bold flex-shrink-0" style={{ color: '#FF6B00' }}>
                            {fmtNum(v.views)}
                          </p>
                        </a>
                      ))}
                    </div>
                  ); })()}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Competitor Intelligence v2 */}
        {channels.length > 0 && (
          <div className="mt-10 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-1" style={{ color: '#818cf8' }}>
                  {t('INTELIGENCIA COMPETITIVA', 'COMPETITIVE INTELLIGENCE')}
                </p>
                <h2 className="font-display font-bold text-2xl text-white">
                  {t('¿Qué hacen tus competidores?', 'What are your competitors doing?')}
                </h2>
              </div>
              <button type="button" aria-label={t('Actualizar inteligencia', 'Refresh intelligence')}
                disabled={!intel || !intelRetryAllowed(intel.read)} onClick={() => { if (intel) observeIntel(() => true, intel.read); }}
                className="btn-offset px-4 py-2 text-sm disabled:opacity-50">{t('Actualizar', 'Refresh')}</button>
            </div>

            {intel?.outcome.status === 'unconfirmed' && <p role="status" className="text-sm text-amber-300">
              {t('El análisis no está confirmado. Conservamos la solicitud original; no se repetirá automáticamente.', 'The analysis is unconfirmed. The original request is retained and will not be repeated automatically.')}
            </p>}
            {intel?.outcome.status === 'deferred' && <p role="status" className="text-sm text-amber-300">
              {t('El análisis anterior ha terminado. Pulsa Actualizar para analizar esta selección.', 'The previous analysis has finished. Press Refresh to analyze this selection.')}
            </p>}
            {intel?.outcome.status === 'rejected' && <p role="status" className="text-sm text-amber-300">
              {intel.outcome.error === 'pro_required' ? t('La inteligencia competitiva requiere el plan Pro.', 'Competitive intelligence requires the Pro plan.')
                : intel.outcome.error === 'selection_changed' ? t('La selección de competidores ha cambiado. Recarga la lista antes de actualizar el análisis.', 'The competitor selection changed. Reload the list before refreshing the analysis.')
                : t('No se pudo iniciar el análisis de competidores.', 'The competitor analysis could not be started.')}
            </p>}
            {intel?.outcome.status === 'rejected' && intel.outcome.error === 'selection_changed' && <button type="button"
              onClick={readCompetitors} disabled={currentRead.current.entry?.pending} className="btn-offset px-4 py-2 text-sm disabled:opacity-50">
              {t('Recargar selección', 'Reload selection')}</button>}
            {intelData?.collectionStatus === 'partial' && <p role="status" className="text-sm text-amber-300">
              {t('Cobertura parcial: algunos canales no están disponibles. Los resultados solo incluyen los canales consultados correctamente.', 'Partial coverage: some channels are unavailable. Results only include successfully queried channels.')}
            </p>}
            {intelData && intelData.analyzedChannelIds.length < intelData.channelIds.length && <p className="text-sm text-amber-300">
              {t('Este análisis incluye los primeros 10 canales de la selección.', 'This analysis includes the first 10 channels in the selection.')}
            </p>}

            {/* Intel tabs */}
            <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)' }}>
              {([
                { key: 'trending' as IntelTab, label: t('Trending', 'Trending'), count: trending.length },
                { key: 'new' as IntelTab, label: t('Nuevos', 'New'), count: newUploads.length },
                { key: 'opportunities' as IntelTab, label: t('Oportunidades', 'Opportunities'), count: opportunities.length },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setIntelTab(tab.key)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono-jb text-[13px] tracking-wider transition-all"
                  style={{
                    background: intelTab === tab.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: intelTab === tab.key ? '#fff' : 'var(--text-dim)',
                    border: intelTab === tab.key ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                  }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[13px]" style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8' }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {intelLoading && (
              <div className="flex items-center gap-3 py-10 justify-center">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{t('Analizando competidores...', 'Analyzing competitors...')}</span>
              </div>
            )}

            {/* Trending videos */}
            {!intelLoading && intelTab === 'trending' && trending.length > 0 && (
              <div className="yv-card overflow-hidden">
                <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
                  <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase" style={{ color: 'var(--yv-text-3)' }}>
                    {t('VÍDEOS TRENDING DE COMPETIDORES (7 DÍAS)', 'COMPETITOR TRENDING VIDEOS (7 DAYS)')}
                  </p>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
                  {trending.map((v, i) => (
                    <a key={v.videoId} href={`https://youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition group">
                      <span className="font-display font-bold text-lg w-6 flex-shrink-0 text-center" style={{ color: i < 3 ? '#818cf8' : 'var(--text-faint)' }}>
                        {i + 1}
                      </span>
                      <img src={v.thumbnail} alt="" className="w-20 h-11 rounded object-cover flex-shrink-0" style={{ border: '1px solid var(--line)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-white line-clamp-1 group-hover:text-zinc-200">{v.title}</p>
                        <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{v.channelName} · {fmtHours(v.ageHours, lang)}</p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="font-display font-bold text-sm" style={{ color: '#818cf8' }}>{fmtNum(v.vph)}</p>
                          <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>VPH</p>
                        </div>
                        <div className="text-right hidden sm:block">
                          <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-2)' }}>{fmtNum(v.views)}</p>
                          <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{t('vistas', 'views')}</p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* New uploads */}
            {!intelLoading && intelTab === 'new' && newUploads.length > 0 && (
              <div className="yv-card overflow-hidden">
                <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
                  <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase" style={{ color: 'var(--yv-text-3)' }}>
                    {t('NUEVOS VÍDEOS (ÚLTIMAS 48H)', 'NEW UPLOADS (LAST 48H)')}
                  </p>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
                  {newUploads.map(v => (
                    <a key={v.videoId} href={`https://youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition group">
                      <div className="relative flex-shrink-0">
                        <img src={v.thumbnail} alt="" className="w-20 h-11 rounded object-cover" style={{ border: '1px solid var(--line)' }} />
                        {v.ageHours <= 6 && (
                          <span className="absolute -top-1 -left-1 px-1.5 py-0.5 rounded-full font-mono-jb text-[8px] font-bold" style={{ background: '#22c55e', color: '#000' }}>
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-white line-clamp-1 group-hover:text-zinc-200">{v.title}</p>
                        <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{v.channelName} · {fmtHours(v.ageHours, lang)}</p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="font-display font-bold text-sm text-white">{fmtNum(v.views)}</p>
                          <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{fmtNum(v.vph)} VPH</p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {intelData && intelTab === 'trending' && trending.length === 0 && <div className="yv-card p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('No se encontraron vídeos trending en los canales consultados.', 'No trending videos were found in the queried channels.')}</p>
            </div>}
            {/* Empty new uploads */}
            {intelData && intelTab === 'new' && newUploads.length === 0 && (
              <div className="yv-card p-8 text-center">
                <p className="text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('No se encontraron vídeos de las últimas 48 horas en los canales consultados.', 'No videos from the last 48 hours were found in the queried channels.')}</p>
              </div>
            )}

            {/* Missed opportunities */}
            {!intelLoading && intelTab === 'opportunities' && opportunities.length > 0 && (
              <div className="grid gap-3">
                {opportunities.map((opp, i) => (
                  <div key={i} className="yv-card p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-mono-jb text-[13px] font-bold" style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8' }}>
                            {i + 1}
                          </span>
                          <h4 className="font-display font-bold text-white text-sm">{opp.topic}</h4>
                        </div>
                        <p className="text-[13px] leading-relaxed mb-2" style={{ color: 'var(--yv-text-2)' }}>{opp.suggestion}</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                            {t('Cubierto por:', 'Covered by:')}
                          </span>
                          {opp.coveredBy.map(ch => (
                            <span key={ch} className="font-mono-jb text-[13px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                              {ch}
                            </span>
                          ))}
                          {opp.totalViews > 0 && (
                            <span className="font-mono-jb text-[13px]" style={{ color: '#818cf8' }}>
                              {fmtNum(opp.totalViews)} {t('vistas', 'views')}
                            </span>
                          )}
                        </div>
                      </div>
                      <a
                        href={`/generate?prefill=${encodeURIComponent(opp.topic)}`}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono-jb text-[13px] tracking-wider hover:bg-white/[0.06] transition"
                        style={{ border: '1px solid var(--line)', color: 'var(--text-dim)' }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
                        </svg>
                        {t('Crear', 'Create')}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty opportunities */}
            {intelData && intelTab === 'opportunities' && opportunities.length === 0 && (
              <div className="yv-card p-8 text-center">
                <p role="status" className="text-sm" style={{ color: 'var(--yv-text-3)' }}>{intelData.opportunitiesStatus === 'unavailable'
                  ? t('Las oportunidades no están disponibles. La generación no se repetirá desde esta lectura.', 'Opportunities are unavailable. Generation will not be repeated from this read.')
                  : intelData.opportunitiesStatus === 'not_applicable'
                    ? t('No hay suficientes vídeos para analizar oportunidades.', 'There are not enough videos to analyze opportunities.')
                    : t('No se encontraron oportunidades en este análisis.', 'No opportunities were found in this analysis.')}</p>
              </div>
            )}
          </div>
        )}

        {/* Link to one-off analysis */}
        {competitors.length > 0 && (
          <div className="mt-8 text-center">
            <a href="/competitors" className="font-mono-jb text-[13px] hover:opacity-80 transition" style={{ color: 'var(--yv-text-4)' }}>
              {t('Ir al análisis detallado de competidores', 'Go to detailed competitor analysis')} →
            </a>
          </div>
        )}

        <p className="mt-6 font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
          {competitors.length}/10 {t('competidores', 'competitors')}
        </p>
      </div>
    </DashboardShell>
  );
}
