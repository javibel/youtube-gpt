'use client';

import { useEffect, useRef, useState } from 'react';
import { beginOutlierRead } from '@/lib/outlier-read-client';
import type { OutlierOutcome, OutlierRead, OutlierSelection } from '@/lib/outlier-read-client';
import type { DeleteOwner } from '@/lib/competitor-delete-client';

export function useAnalysisOutliers(owner: DeleteOwner, status: string, selection: OutlierSelection, source: object | null) {
  const scope = JSON.stringify([status, owner.userId, owner.email, selection.channelId, selection.period, selection.threshold]);
  const current = useRef({ scope, source, read: null as OutlierRead | null });
  // Retire old render handlers and response callbacks before effect cleanup.
  if (current.current.scope !== scope || current.current.source !== source) current.current = { scope, source, read: null };
  const mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; source: object | null; read: OutlierRead; outcome?: OutlierOutcome } | null>(null);
  const active = () => mounted.current && current.current.scope === scope && current.current.source === source
    && status === 'authenticated' && !!owner.userId && !!source && !!selection.channelId;
  const relevant = view?.scope === scope && view.source === source && view.read === current.current.read ? view : null;
  function observe(read: OutlierRead, alive: () => boolean = () => true) {
    current.current.read = read;
    const apply = (outcome?: OutlierOutcome) => {
      if (!alive() || !active() || current.current.read !== read) return;
      setView({ scope, source, read, outcome });
    };
    apply(read.outcome ?? read.waitOutcome);
    void read.original.then(apply);
    void read.waiter.then(outcome => { if (!read.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let alive = true;
    if (active()) observe(current.current.read ?? beginOutlierRead(owner, selection), () => alive);
    return () => { alive = false; };
  }, [scope, source]); // eslint-disable-line react-hooks/exhaustive-deps
  function retry() {
    if (!active() || !relevant || current.current.read !== relevant.read || relevant.read.pending) return;
    observe(beginOutlierRead(owner, selection));
  }
  return { retry, data: relevant?.outcome?.status === 'ready' ? relevant.outcome.data : null,
    loading: !!relevant && !relevant.outcome, error: relevant?.outcome?.status === 'error', pending: !!relevant?.read.pending };
}
