'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Snapshot = { dataUrl: string; meta: { topic: string; hasPhoto: boolean; textCount: number } };
type Operation = { key: string; file: File; meta: string; context: string };
const initial = () => ({ busy: false, pending: false, error: null as 'unconfirmed' | 'timeout' | 'conflict' | 'limit' | 'capture' | null,
  savedUrl: '', savedContext: '' });

export function useThumbnailSave(userId: string | undefined, email: string | null | undefined, status: string,
  lang: string, isPro: boolean, context: string, capture: () => Snapshot | null, onSaved?: (url: string) => void) {
  const scope = useMemo(() => ({ active: true, operation: null as Operation | null,
    flight: null as Promise<void> | null, controller: null as AbortController | null,
    deadline: null as ReturnType<typeof setTimeout> | null }), [userId,email,status,lang]);
  const active = useRef(scope); active.current = scope;
  const latest = useRef({ isPro,context,capture,onSaved }); latest.current = { isPro,context,capture,onSaved };
  const [store,setStore] = useState(() => ({ scope,...initial() }));
  const current = () => scope.active && active.current === scope && status === 'authenticated' && !!userId && !!email && ['es','en'].includes(lang);
  const update = (change: Partial<ReturnType<typeof initial>>) => {
    if (current()) setStore(old => current() ? { ...(old.scope === scope ? old : { scope,...initial() }),...change } : old);
  };
  const run = (retryOnly = false) => {
    if (!current()) return Promise.resolve();
    if (scope.flight) return scope.flight;
    if (!scope.operation) {
      if (retryOnly || !latest.current.isPro) return Promise.resolve();
      try {
        const snapshot = latest.current.capture();
        if (!snapshot) throw Error('Capture unavailable');
        if (typeof snapshot.meta.topic !== 'string' || snapshot.meta.topic.length > 500
          || typeof snapshot.meta.hasPhoto !== 'boolean' || !Number.isSafeInteger(snapshot.meta.textCount)
          || snapshot.meta.textCount < 0 || snapshot.meta.textCount > 1000) throw Error('Invalid capture metadata');
        const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(snapshot.dataUrl);
        if (!match || match[1].length > 28_000_000) throw Error('Invalid capture');
        const binary = atob(match[1]); if (!binary.length || binary.length > 20 * 1024 * 1024) throw Error('Capture too large');
        const bytes = Uint8Array.from(binary,c => c.charCodeAt(0));
        scope.operation = { key: crypto.randomUUID(),file: new File([bytes],'thumbnail.png',{type:'image/png'}),
          meta: JSON.stringify(snapshot.meta),context: latest.current.context };
      } catch { update({error:'capture'});return Promise.resolve(); }
    }
    const op = scope.operation;
    update({busy:true,pending:true,error:null});
    const controller = new AbortController();scope.controller = controller;let timedOut = false;
    const deadline = setTimeout(() => { timedOut=true;controller.abort(); },60_000);scope.deadline = deadline;
    const flight = Promise.resolve().then(async () => {
      try {
        if (!current()) return;
        const body = new FormData();body.append('image',op.file);body.append('meta',op.meta);
        const response = await fetch('/api/thumbnail-save',{method:'POST',headers:{'Idempotency-Key':op.key},body,signal:controller.signal});
        const data = await response.json();
        if (!current()) return;
        if (timedOut) throw Error('Timed out');
        if (!response.ok) { update({error:response.status === 409 ? 'conflict' : data?.limitReached === true ? 'limit' : 'unconfirmed'});return; }
        if (data?.userId !== userId || data?.operationKey !== op.key || typeof data?.id !== 'string' || !data.id || typeof data?.imageUrl !== 'string'
          || data.imageUrl.length > 4096) throw Error('Invalid acknowledgement');
        const url = new URL(data.imageUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('Invalid image URL');
        scope.operation = null;update({savedUrl:data.imageUrl,savedContext:op.context,pending:false,error:null});
        try { latest.current.onSaved?.(data.imageUrl); } catch {}
      } catch { update({error:timedOut ? 'timeout' : 'unconfirmed'}); }
      finally { clearTimeout(deadline);if(scope.deadline===deadline)scope.deadline=null;if(scope.controller===controller)scope.controller=null;update({busy:false}); }
    });
    scope.flight = flight;
    void flight.finally(() => { if(scope.flight===flight)scope.flight=null; });
    return flight;
  };
  useEffect(() => {
    scope.active=true;setStore({scope,...initial()});
    return () => { scope.active=false;scope.controller?.abort();if(scope.deadline)clearTimeout(scope.deadline); };
  }, [scope]);
  const view = store.scope===scope && current() ? store : initial();
  return { ...view, savedStale: !!view.savedUrl && view.savedContext !== context,
    pendingStale: !!scope.operation && scope.operation.context !== context,
    save: () => run(), retrySave: () => run(true), current };
}
