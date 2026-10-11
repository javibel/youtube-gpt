'use client';

import { useEffect, useRef, useState } from 'react';
import { beginCompetitorAnalysis, pendingCompetitorAnalysis, retainedCompetitorAnalysis } from '@/lib/competitor-analysis-client';
import type { AnalysisOutcome, AnalysisRead, AnalysisSelection } from '@/lib/competitor-analysis-client';
import type { DeleteOwner } from '@/lib/competitor-delete-client';

export function useCompetitorAnalysis(owner: DeleteOwner, status: string, selection: AnalysisSelection) {
  const scope = JSON.stringify([status, owner.userId, owner.email, selection.input.trim(), selection.language]);
  const current = useRef({ scope, read: null as AnalysisRead | null });
  if (current.current.scope !== scope) current.current = { scope, read: null };
  const mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; outcome?: AnalysisOutcome; loading: boolean }>({ scope, loading: false });
  const active = () => mounted.current && current.current.scope === scope && status === 'authenticated' && !!owner.userId;
  const matches = (read: AnalysisRead) => read.owner.userId === owner.userId && read.owner.email === owner.email
    && read.selection.input === selection.input.trim() && read.selection.language === selection.language;
  const retained = retainedCompetitorAnalysis(owner), pending = pendingCompetitorAnalysis(owner);
  const relevant = view.scope === scope ? view : undefined;
  const outcome = relevant?.outcome;
  function observe(read: AnalysisRead, alive: () => boolean = () => true) {
    current.current.read = read;
    const apply = (result?: AnalysisOutcome) => {
      if (!alive() || !active() || current.current.read !== read) return;
      setView({ scope, outcome: matches(read) ? result : undefined, loading: read.pending && !read.waitOutcome });
    };
    apply(read.outcome ?? read.waitOutcome);
    void read.original.then(apply);
    void read.waiter.then(result => { if (!read.outcome) apply(result); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let alive = true;
    if (active()) {
      const read = pendingCompetitorAnalysis(owner) ?? retainedCompetitorAnalysis(owner);
      if (read && (read.pending || matches(read))) observe(read, () => alive);
      else setView({ scope, loading: false });
    }
    return () => { alive = false; };
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  function analyze() {
    if (!active() || !selection.input.trim()) return;
    observe(beginCompetitorAnalysis(owner, selection));
  }
  return { analyze, loading: !!relevant?.loading, pending: !!pending,
    previous: pending && pending.owner.email === owner.email && !matches(pending) ? pending.selection : undefined,
    result: outcome?.status === 'ready' ? outcome.data : null,
    error: outcome?.status === 'error' ? outcome.error : '',
    retained: retained?.pending ? retained.selection : undefined };
}
