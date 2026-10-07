'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Action = 'generate'|'continue';
type Failure = 'unconfirmed'|'timeout'|'limit'|'conflict'|'length';
type Operation = { key: string; body: string; action: Action; base: string };
const initial = () => ({ output: '', truncated: false, busy: null as Action|null,
  error: null as Failure|null, slow: false, retry: false, copied: false });

// In-memory interaction identity only: no claim of persistence after reload or server cancellation.
export function useGenericGeneration(userId: string|undefined, email: string|null|undefined,
  authStatus: string, template: string, inputs: Record<string,string>, lang: string,
  onConfirmed: (action: Action) => void) {
  const inputBody = JSON.stringify(Object.fromEntries(Object.keys(inputs).sort().map(k => [k,inputs[k]])));
  const scope = useMemo(() => ({ active: true, pending: null as Operation|null,
    flight: null as Promise<void>|null, output: '', truncated: false, timers: new Set<ReturnType<typeof setTimeout>>(),
    controller: null as AbortController|null }), [userId,email,authStatus,template,inputBody,lang]);
  const active = useRef(scope); active.current = scope;
  const [store,setStore] = useState(() => ({scope,...initial()}));
  const current = useCallback(() => scope.active && active.current === scope
    && authStatus === 'authenticated' && !!userId && !!email && ['es','en'].includes(lang)
    && template !== 'thumbnail' && template !== 'video_preview', [scope,userId,email,authStatus,lang,template]);
  const update = useCallback((value: Partial<ReturnType<typeof initial>>) => {
    if (current()) setStore(old => ({...(old.scope === scope ? old : {scope,...initial()}),...value}));
  }, [scope,current]);
  const run = useCallback((action: Action, retryOnly = false) => {
    if (!current()) return Promise.resolve();
    if (scope.flight) return scope.flight;
    if (!scope.pending) {
      if (retryOnly || (action === 'continue' && (!scope.output || !scope.truncated))) return Promise.resolve();
      // Match the API's retained-context ceiling; do not crop the confirmed base.
      if (action === 'continue' && scope.output.length > 32_000) {update({error:'length',retry:false});return Promise.resolve();}
      try {
        const key = crypto.randomUUID();
        const fields = JSON.parse(inputBody);
        if (action === 'continue') fields._previousContent=scope.output;
        scope.pending={key,action,base:action === 'continue' ? scope.output : '',body:JSON.stringify({template,inputs:fields,lang})};
      } catch {update({error:'unconfirmed',retry:false});return Promise.resolve();}
    }
    // Any retry button resumes the exact failed operation, including its continuation base.
    const op = scope.pending;
    if (op.action === 'generate') {scope.output='';scope.truncated=false;}
    update({busy:op.action,error:null,slow:false,retry:false,output:scope.output,truncated:scope.truncated});
    const controller = new AbortController();scope.controller=controller;
    let timedOut=false;
    const slow=setTimeout(() => update({slow:true}),15_000);
    const deadline=setTimeout(() => {timedOut=true;controller.abort();},90_000);
    scope.timers.add(slow);scope.timers.add(deadline);
    // Set the flight before transport starts so competing clicks share the request.
    const flight = Promise.resolve().then(async () => {
      try {
        if (!current()) return;
        const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':op.key},
          body:op.body,signal:controller.signal});
        const body=await response.json();
        if (!current()) return;
        if (timedOut) throw Error('Timed out');
        if (!response.ok) {
          update({error:response.status === 409 ? 'conflict' : body?.limitReached === true ? 'limit' : 'unconfirmed',retry:true});
          return;
        }
        if (!body || typeof body.content !== 'string' || !body.content.trim() || typeof body.truncated !== 'boolean') throw Error('Invalid result');
        scope.output=op.base+body.content;scope.truncated=body.truncated;scope.pending=null;
        update({output:scope.output,truncated:scope.truncated,error:null,retry:false});
        // Ancillary UI callbacks cannot turn a confirmed result into another operation.
        try {onConfirmed(op.action);} catch {}
      } catch {update({error:timedOut ? 'timeout' : 'unconfirmed',retry:true});}
      finally {
        clearTimeout(slow);clearTimeout(deadline);scope.timers.delete(slow);scope.timers.delete(deadline);
        if (scope.controller === controller) scope.controller=null;
        update({busy:null,slow:false});
      }
    });
    scope.flight=flight;
    void flight.finally(() => {if (scope.flight === flight) scope.flight=null;});
    return flight;
  }, [scope,current,inputBody,template,lang,update,onConfirmed]);
  useEffect(() => {
    scope.active=true;setStore({scope,...initial()});
    return () => {scope.active=false;scope.controller?.abort();scope.timers.forEach(clearTimeout);scope.timers.clear();};
  }, [scope]);
  const view = store.scope === scope && current() ? store : initial();
  const copyOutput = useCallback(async () => {
    if (!current() || !scope.output) return;
    try {
      await navigator.clipboard.writeText(scope.output);
      if (!current()) return;
      update({copied:true});
      const timer=setTimeout(() => {update({copied:false});scope.timers.delete(timer);},1500);
      scope.timers.add(timer);
    } catch {update({copied:false});}
  }, [scope,current,update]);
  return {...view,loading:view.busy === 'generate',continuing:view.busy === 'continue',
    copyOutput,
    generate:useCallback(() => run('generate'),[run]),continueGeneration:useCallback(() => run('continue'),[run]),
    retryGeneration:useCallback(() => run('generate',true),[run])};
}
