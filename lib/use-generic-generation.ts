'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readGenericRecovery, storeGenericRecovery, clearGenericRecovery, recoveryForm, type GenericRecovery } from '@/lib/generic-generation-recovery';

type Action = 'generate'|'continue';
type Failure = 'unconfirmed'|'timeout'|'limit'|'conflict'|'length';
type Operation = { key: string; body: string; action: Action; base: string };
const initial = () => ({ output: '', truncated: false, busy: null as Action|null,
  error: null as Failure|null, slow: false, retry: false, copied: false, restored:false, storageUnavailable:false });

// A local pending record permits only explicit retained-result lookup after reload.
export function useGenericGeneration(userId: string|undefined, email: string|null|undefined,
  authStatus: string, template: string, inputs: Record<string,string>, lang: string,
  onConfirmed: (action: Action) => void) {
  const inputBody = JSON.stringify(Object.fromEntries(Object.keys(inputs).sort().map(k => [k,inputs[k]])));
  const account=useMemo(()=>({}),[userId,email,authStatus,lang]);
  const [recovery,setRecovery]=useState<{account:typeof account;record:GenericRecovery|null}>(()=>({account,record:null}));
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
    const readOnly=!!scope.pending;
    if (!scope.pending) {
      if (retryOnly || (action === 'continue' && (!scope.output || !scope.truncated))) return Promise.resolve();
      // Match the API's retained-context ceiling; do not crop the confirmed base.
      if (action === 'continue' && scope.output.length > 32_000) {update({error:'length',retry:false});return Promise.resolve();}
      try {
        const key = crypto.randomUUID();
        const fields = JSON.parse(inputBody);
        if (action === 'continue') fields._previousContent=scope.output;
        scope.pending={key,action,base:action === 'continue' ? scope.output : '',body:JSON.stringify({template,inputs:fields,lang})};
        const record:GenericRecovery={version:1,...scope.pending};
        const stored=storeGenericRecovery(userId!,email!,lang,record);
        update({storageUnavailable:!stored,restored:false});
        setRecovery({account,record:stored?record:null});
      } catch {update({error:'unconfirmed',retry:false});return Promise.resolve();}
    }
    // Any retry button resumes the exact failed operation, including its continuation base.
    const op = scope.pending;
    if (op.action === 'generate') {scope.output='';scope.truncated=false;}
    update({busy:op.action,error:null,slow:false,retry:false,output:scope.output,truncated:scope.truncated});
    const controller = new AbortController();scope.controller=controller;
    let timedOut=false;
    let stopWait:(error:Error)=>void=()=>{};
    const interrupted=new Promise<never>((_,reject)=>{stopWait=reject;});
    // Cleanup may abort before the transport microtask starts.
    void interrupted.catch(()=>{});
    const abort=()=>stopWait(Error('Unconfirmed generation'));
    controller.signal.addEventListener('abort',abort,{once:true});
    const slow=setTimeout(() => update({slow:true}),15_000);
    const deadline=setTimeout(() => {timedOut=true;controller.abort();},90_000);
    scope.timers.add(slow);scope.timers.add(deadline);
    // Set the flight before transport starts so competing clicks share the request.
    const flight = Promise.resolve().then(async () => {
      try {
        if (!current()) return;
        const response=await Promise.race([fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':op.key,
          ...(readOnly ? {'X-Generation-Recovery':'retained-only-v1'} : {})},
          body:op.body,signal:controller.signal}),interrupted]);
        const body=await Promise.race([response.json(),interrupted]);
        if (!current()) return;
        if (timedOut) throw Error('Timed out');
        if (!response.ok) {
          update({error:response.status === 409 ? 'conflict' : body?.limitReached === true ? 'limit' : 'unconfirmed',retry:true});
          return;
        }
        if (!body || typeof body.content !== 'string' || !body.content.trim() || typeof body.truncated !== 'boolean') throw Error('Invalid result');
        scope.output=op.base+body.content;scope.truncated=body.truncated;scope.pending=null;
        clearGenericRecovery(userId!,email!,lang,op.key);
        setRecovery({account,record:readGenericRecovery(userId,email,authStatus,lang)});
        update({output:scope.output,truncated:scope.truncated,error:null,retry:false,restored:false,storageUnavailable:false});
        // Ancillary UI callbacks cannot turn a confirmed result into another operation.
        try {onConfirmed(op.action);} catch {}
      } catch {update({error:timedOut ? 'timeout' : 'unconfirmed',retry:true});}
      finally {
        controller.signal.removeEventListener('abort',abort);
        clearTimeout(slow);clearTimeout(deadline);scope.timers.delete(slow);scope.timers.delete(deadline);
        if (scope.controller === controller) scope.controller=null;
        update({busy:null,slow:false});
      }
    });
    scope.flight=flight;
    void flight.finally(() => {if (scope.flight === flight) scope.flight=null;});
    return flight;
  }, [scope,current,inputBody,template,lang,update,onConfirmed,userId,email,authStatus,account]);
  useEffect(() => {
    scope.active=true;setStore({scope,...initial()});
    const record=readGenericRecovery(userId,email,authStatus,lang);
    setRecovery({account,record});
    if(record&&current()){
      const form=recoveryForm(record);
      const canonical=JSON.stringify(Object.fromEntries(Object.keys(form.inputs).sort().map(k=>[k,form.inputs[k]])));
      if(form.template===template&&canonical===inputBody){
        scope.pending={key:record.key,body:record.body,base:record.base,action:record.action};
        scope.output=record.base;scope.truncated=record.action==='continue';
        setStore({scope,...initial(),output:record.base,truncated:scope.truncated,error:'unconfirmed',retry:true,restored:true});
      }
    }
    return () => {scope.active=false;scope.controller?.abort();scope.timers.forEach(clearTimeout);scope.timers.clear();};
  }, [scope]);
  const view = store.scope === scope && current() ? store : initial();
  const discardGeneration=useCallback(()=>{
    if(!current()||scope.flight)return;
    if(scope.pending)clearGenericRecovery(userId!,email!,lang,scope.pending.key);
    setRecovery({account,record:readGenericRecovery(userId,email,authStatus,lang)});
    scope.pending=null;update({error:null,retry:false,storageUnavailable:false});
  },[scope,current,update,userId,email,authStatus,lang,account]);
  const restoreRequest=useCallback(()=>{
    if(!current()||scope.flight)return null;
    const record=readGenericRecovery(userId,email,authStatus,lang);
    return record?recoveryForm(record):null;
  },[current,scope,userId,email,authStatus,lang]);
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
    copyOutput,discardGeneration,restoreRequest,recoveryAvailable:recovery.account===account&&current()&&!!recovery.record,
    generate:useCallback(() => run('generate'),[run]),continueGeneration:useCallback(() => run('continue'),[run]),
    retryGeneration:useCallback(() => run('generate',true),[run])};
}
