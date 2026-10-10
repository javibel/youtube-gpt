'use client';

import { useEffect, useRef, useState } from 'react';
import { beginCompetitorCreation, competitorCreationBlocked, retainedCompetitorCreation, mergeCompetitorCreations } from '@/lib/competitor-create-client';
import type { CreationAttempt, CreationOutcome } from '@/lib/competitor-create-client';
import { beginCompetitorListRead } from '@/lib/competitor-list-read';
import type { CompetitorRecord } from '@/lib/competitor-list-read';
import { mergeCompetitorDeletions } from '@/lib/competitor-delete-client';
import type { DeleteOwner } from '@/lib/competitor-delete-client';

type Read = ReturnType<typeof beginCompetitorListRead>;
type View = { scope: string; list: 'checking' | 'ready' | 'unavailable'; rows: CompetitorRecord[];
  attempt?: CreationAttempt; outcome?: CreationOutcome | { status: 'pending' }; blocked: boolean };
const matches = (attempt: CreationAttempt, channelId: string) => attempt.input === channelId
  || attempt.input.match(/\/channel\/(UC[\w-]+)(?:[/?#]|$)/)?.[1] === channelId
  || attempt.outcome?.status === 'confirmed' && attempt.outcome.competitor.channelId === channelId;

// GET supplies list membership only. An uncertain addition can be confirmed
// solely by its original POST acknowledgement, never by a later listed row.
export function useCompetitorTracking(owner: DeleteOwner, status: string, channelId: string) {
  const scope = JSON.stringify([status, owner.userId, owner.email, channelId]);
  const current = useRef<{ scope: string; read: Read | null; attempt: CreationAttempt | null }>({ scope, read: null, attempt: null });
  if (current.current.scope !== scope) current.current = { scope, read: null, attempt: null };
  const mounted = useRef(true);
  const [view, setView] = useState<View>({ scope, list: 'checking', rows: [], blocked: false });
  const relevant = view.scope === scope ? view : null;
  const visibleRows = mergeCompetitorDeletions(owner, relevant?.rows ?? []);
  const member = visibleRows.some(row => row.channelId === channelId);
  const matching = relevant?.attempt && matches(relevant.attempt, channelId);
  const outcome = matching ? relevant?.outcome : undefined;
  const state = outcome?.status === 'confirmed' && member ? 'tracked' : relevant?.blocked ? outcome?.status === 'pending' ? 'loading' : 'unconfirmed'
    : member ? 'tracked' : relevant?.list === 'checking' || !relevant ? 'checking' : 'idle';
  const error = outcome?.status === 'rejected' ? outcome.error : '';

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = () => mounted.current && current.current.scope === scope && status === 'authenticated' && !!owner.userId;
  const selectable = () => /^UC[\w-]{20,}$/.test(channelId);
  function synchronize(attempt?: CreationAttempt, result?: View['outcome']) {
    if (!active()) return;
    const blocked = competitorCreationBlocked(owner);
    setView(prev => ({ ...(prev.scope === scope ? prev : { scope, list: 'checking', rows: [] }), blocked,
      attempt, outcome: result ?? attempt?.outcome ?? attempt?.waitOutcome ?? (attempt ? { status: 'pending' } : undefined) }));
  }
  function observe(attempt: CreationAttempt, alive: () => boolean = () => true) {
    current.current.attempt = attempt;
    const apply = (result?: View['outcome']) => {
      if (!alive() || !active() || current.current.attempt !== attempt) return;
      synchronize(attempt, result);
    };
    apply();
    void attempt.original.then(result => {
      if (!alive() || !active() || current.current.attempt !== attempt) return;
      if (result.status === 'confirmed') setView(prev => ({ ...(prev.scope === scope ? prev : { scope, list: 'checking', rows: [], blocked: false }),
        rows: mergeCompetitorDeletions(owner, mergeCompetitorCreations(owner, prev.scope === scope ? prev.rows : [])) }));
      apply(result);
    });
    void attempt.waiter.then(result => { if (attempt.outcome?.status !== 'confirmed') apply(result); });
  }
  function readList(alive: () => boolean = () => true) {
    if (!active() || !selectable()) return;
    const read = current.current.read?.pending ? current.current.read : beginCompetitorListRead(owner); current.current.read = read;
    setView(prev => ({ ...(prev.scope === scope ? prev : { scope, rows: [], blocked: false }), list: 'checking' }));
    const apply = (result: Awaited<Read['original']>) => {
      if (!alive() || !active() || current.current.read !== read) return;
      setView(prev => ({ ...(prev.scope === scope ? prev : { scope, rows: [], blocked: false }), list: result.status === 'ready' ? 'ready' : 'unavailable',
        rows: mergeCompetitorDeletions(owner, mergeCompetitorCreations(owner, result.status === 'ready' ? result.competitors : prev.scope === scope ? prev.rows : [])),
        blocked: competitorCreationBlocked(owner) }));
    };
    void read.original.then(apply);
    void read.waiter.then(result => { if (read.outcome?.status !== 'ready') apply(result); });
  }
  useEffect(() => {
    let alive = true;
    if (!active()) return;
    const attempt = retainedCompetitorCreation(owner);
    synchronize(attempt);
    if (attempt) observe(attempt, () => alive);
    readList(() => alive);
    return () => { alive = false; };
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  function track() {
    if (!active() || !selectable()) return;
    const liveMember = mergeCompetitorDeletions(owner, mergeCompetitorCreations(owner, view.scope === scope ? view.rows : [])).some(row => row.channelId === channelId);
    if (liveMember && !competitorCreationBlocked(owner)) return;
    // The coordinator owns admission, including storage failures and retained
    // attempts. A read-only blocked check cannot persist a failed admission.
    const attempt = beginCompetitorCreation(owner, channelId);
    if (attempt) observe(attempt); else synchronize();
  }
  return { state, error, max: outcome?.status === 'rejected' ? outcome.max : undefined,
    listUnavailable: relevant?.list === 'unavailable', listPending: !!current.current.read?.pending,
    previousInput: relevant?.blocked && relevant.attempt && !matching ? relevant.attempt.input : '',
    retained: relevant?.attempt ? { input: relevant.attempt.input, outcome: relevant.outcome } : undefined,
    blocked: !!relevant?.blocked, track, refreshList: () => readList() };
}
