'use client';
import { useEffect, useRef, useState } from 'react';
import { beginScoreRead } from '@/lib/optimize-score-client';
import type { ScoreOwner, ScoreRead, ScoreOutcome } from '@/lib/optimize-score-client';
import type { OptimizeDraft } from '@/lib/optimize-score';

export function useOptimizeScore(owner: ScoreOwner, status: string, draft: OptimizeDraft, source: object | null, enabled: boolean) {
  const scope = JSON.stringify([status, owner.userId, owner.email, draft.videoId, draft.title, draft.description, draft.tags, enabled]);
  const current = useRef({ scope, source, read: null as ScoreRead | null, retired: false });
  if (current.current.scope !== scope || current.current.source !== source) current.current = { scope, source, read: null, retired: false };
  const mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; source: object; read: ScoreRead; outcome?: ScoreOutcome } | null>(null);
  const active = () => mounted.current && !current.current.retired && current.current.scope === scope && current.current.source === source
    && status === 'authenticated' && !!owner.userId && !!source;
  const relevant = view?.scope === scope && view.source === source && view.read === current.current.read && active() ? view : null;
  function observe(read: ScoreRead, alive: () => boolean = () => true) {
    current.current.read = read;
    const apply = (outcome?: ScoreOutcome) => {
      if (alive() && active() && current.current.read === read && source) setView({ scope, source, read, outcome });
    };
    apply(read.outcome ?? read.waitOutcome);
    void read.original.then(apply);
    void read.waiter.then(outcome => { if (!read.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let alive = true;
    const timer = active() && enabled ? setTimeout(() => {
      if (alive && active()) observe(current.current.read ?? beginScoreRead(owner, draft), () => alive);
    }, 400) : undefined;
    return () => { alive = false; clearTimeout(timer); };
  }, [scope, source]); // eslint-disable-line react-hooks/exhaustive-deps
  function retry() {
    if (active() && enabled && relevant?.outcome?.status === 'error' && !relevant.read.pending && current.current.read === relevant.read) observe(beginScoreRead(owner, draft));
  }
  return { canEdit: active, retire: () => { if (active()) current.current.retired = true; }, retry,
    data: relevant?.outcome?.status === 'ready' ? relevant.outcome.data : null,
    loading: active() && enabled && !relevant?.outcome, error: relevant?.outcome?.status === 'error', pending: !!relevant?.read.pending };
}
