'use client';
import { useEffect, useRef, useState } from 'react';
import { beginReviewHistory, reviewHistoryBlocked, type HistoryReceipt } from '@/lib/review-history-client';
import { videoReviewInput, type VideoReviewInput } from '@/lib/video-review-contract';
type Session = { user?: { id?: string; email?: string | null; authSessionRef?: string; requiresVerification?: boolean; requiresTotp?: boolean }; expires?: string } | null;
type Reader = ReturnType<typeof beginReviewHistory>;
type Scope = { key: string; mounted: boolean; reader: Reader | null; running: boolean; current: () => boolean };
export function useReviewHistory(session: Session, status: string, input: VideoReviewInput) {
  let valid = false; try { videoReviewInput(input); valid = true; } catch {}
  const user = session?.user, id = user?.id, email = user?.email, sessionRef = user?.authSessionRef, expiresAt = Date.parse(session?.expires ?? '');
  const eligible = valid && status === 'authenticated' && user?.requiresVerification === false && user.requiresTotp === false && !!id && !!email && !!sessionRef && expiresAt > Date.now();
  const key = JSON.stringify([id, email, sessionRef, session?.expires, status, user?.requiresVerification, user?.requiresTotp, input, valid]);
  const live = useRef({ key, eligible }); live.current = { key, eligible };
  const active = useRef<Scope | null>(null);
  const [view, setView] = useState<{ scope: Scope | null; reader: Reader | null; receipt: HistoryReceipt | null; phase: 'idle' | 'pending' | 'confirmed' | 'unconfirmed'; error: string }>({ scope: null, reader: null, receipt: null, phase: 'idle', error: '' });
  useEffect(() => {
    const scope: Scope = { key, mounted: true, reader: null, running: false, current: () => false }; active.current = scope;
    setView({ scope, reader: null, receipt: null, phase: 'idle', error: '' });
    scope.current = () => scope.mounted && active.current === scope && live.current.key === key && live.current.eligible && document.visibilityState === 'visible' && document.hasFocus();
    const hide = () => scope.reader?.retire(), visibility = () => { if (document.visibilityState === 'hidden') hide(); };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', hide); window.addEventListener('pagehide', hide);
    return () => { scope.mounted = false; scope.reader?.retire(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', hide); window.removeEventListener('pagehide', hide); };
  }, [key]);
  const scope = active.current, visible = scope?.key === key && eligible && scope.mounted ? scope : null;
  const analyze = () => {
    if (!visible?.current() || visible.running || reviewHistoryBlocked(id!)) return;
    visible.reader?.retire(); visible.running = true;
    let reader: Reader;
    reader = beginReviewHistory({ id: id!, email: email!, sessionRef: sessionRef!, expiresAt }, input,
      () => visible.current() && (!reader || visible.reader === reader),
      () => { void Promise.resolve().then(() => { if (visible.mounted && active.current === visible && visible.reader === reader) setView({ scope: visible, reader, receipt: null, phase: 'unconfirmed', error: 'videoReview_unconfirmed' }); }); });
    visible.reader = reader; setView({ scope: visible, reader, receipt: null, phase: 'pending', error: '' });
    void reader.original.then(receipt => { if (visible.current() && visible.reader === reader && reader.read(receipt)) setView({ scope: visible, reader, receipt, phase: 'confirmed', error: '' }); })
      .catch(error => { if (visible.mounted && active.current === visible && visible.reader === reader) setView({ scope: visible, reader, receipt: null, phase: 'unconfirmed', error: error instanceof Error ? error.message : 'videoReview_unconfirmed' }); })
      .finally(() => { if (visible.reader === reader) visible.running = false; });
  };
  const shown = visible && view.scope === visible ? view : null;
  return { analyze, blocked: !!id && reviewHistoryBlocked(id), canAnalyze: !!visible && !visible.running && !reviewHistoryBlocked(id!), loading: shown?.phase === 'pending', error: shown?.error ?? '',
    data: shown?.phase === 'confirmed' && visible?.current() ? shown.reader?.read(shown.receipt) ?? null : null };
}
