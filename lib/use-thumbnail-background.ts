'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

type Operation = { key?:string;kind:'ai'|'upload'|'crop';topic:string;style:string;lang:string;file?:File;
  originalUrl?:string;eligible:() => boolean;context:string };
const empty = () => ({ backgroundUrl:null as string|null,topic:'',style:'viral',busy:false,pending:false,
  resultContext:'',error:null as 'input'|'unconfirmed'|'timeout'|'limit'|null });
const styles = ['viral','cinematic','minimal','bold'];
export function useThumbnailBackground(userId:string|undefined,email:string|null|undefined,status:string,lang:string,isPro:boolean) {
  const scope = useMemo(() => ({active:true,operation:null as Operation|null,flight:null as Promise<boolean>|null,
    controller:null as AbortController|null,deadline:null as ReturnType<typeof setTimeout>|null}),[userId,email,status,lang]);
  const active = useRef(scope);active.current = scope;
  const paid = useRef(isPro);paid.current = isPro;
  const [store,setStore] = useState(() => ({scope,...empty()}));
  const state = useRef(store);state.current = store;
  const current = () => scope.active && active.current === scope && status === 'authenticated' && !!userId && !!email && ['es','en'].includes(lang);
  const snapshot = () => state.current.scope === scope ? state.current : {scope,...empty()};
  const update = (change:Partial<ReturnType<typeof empty>>) => {
    if(current())setStore(old => current() ? {...(old.scope === scope ? old : {scope,...empty()}),...change} : old);
  };
  const context = () => JSON.stringify([snapshot().topic.trim(),snapshot().style]);
  const live = (op:Operation) => current() && scope.operation === op;
  const discard = () => {
    if(!current())return;
    scope.operation = null;scope.controller?.abort();scope.controller = null;
    if(scope.deadline)clearTimeout(scope.deadline);scope.deadline = null;scope.flight = null;
    update({busy:false,pending:false,error:null});
  };
  const run = (op:Operation) => {
    if(!current() || (!paid.current && !op.key))return Promise.resolve(false);
    if(scope.flight)return scope.flight;
    if(!op.eligible()){discard();return Promise.resolve(false);}
    scope.operation = op;update({busy:true,pending:true,error:null});
    const controller = new AbortController();scope.controller = controller;let timedOut = false;
    let stop:(error:Error)=>void=()=>{};
    const interrupted=new Promise<never>((_,reject)=>{stop=reject;});
    const abort=()=>stop(Error('Unconfirmed'));controller.signal.addEventListener('abort',abort,{once:true});
    const deadline = setTimeout(() => {timedOut = true;controller.abort();},90_000);scope.deadline = deadline;
    const flight = Promise.resolve().then(async () => {
      try {
        if(!live(op))return false;
        const body = new FormData();body.append('source',op.kind === 'ai' ? 'ai' : 'upload');body.append('lang',op.lang);
        if(op.kind === 'ai'){body.append('tema',op.topic);body.append('estilo',op.style);}
        else {if(!op.file)throw Error('Missing original file');body.append('backgroundFile',op.file);}
        const {response,data}=await Promise.race([(async()=>{
          const response=await fetch('/api/thumbnail-background',{method:'POST',body,signal:controller.signal,...(op.key ? {headers:{'Idempotency-Key':op.key}} : {})});
          return {response,data:await response.json()};
        })(),interrupted]);
        if(!live(op))return false;
        if(timedOut)throw Error('Timed out');
        if(!response.ok){update({error:data?.limitReached === true && [403,429].includes(response.status) ? 'limit' : 'unconfirmed'});return false;}
        if(typeof data?.backgroundUrl !== 'string' || !data.backgroundUrl || data.backgroundUrl.length > 4096)throw Error('Invalid image acknowledgement');
        const url = new URL(data.backgroundUrl);if(url.protocol !== 'https:' || url.username || url.password || url.hash)throw Error('Invalid image URL');
        if(op.key && (data.userId!==userId || data.operationKey!==op.key || typeof data.id!=='string' || !/^background_[a-f0-9]{64}$/.test(data.id) || data.prompt!==null))throw Error('Invalid upload receipt');
        // Cancellation/plan changes discard local application, never imply backend rollback.
        if((!paid.current && !op.key) || !op.eligible()){scope.operation = null;update({pending:false});return false;}
        scope.operation = null;update({backgroundUrl:data.backgroundUrl,resultContext:op.context,pending:false,error:null});return true;
      } catch {if(live(op))update({error:timedOut ? 'timeout' : 'unconfirmed'});return false;}
      finally {clearTimeout(deadline);controller.signal.removeEventListener('abort',abort);if(scope.deadline === deadline)scope.deadline = null;if(scope.controller === controller)scope.controller = null;
        if(current() && (scope.operation === op || scope.operation === null))update({busy:false});}
    });
    scope.flight = flight;void flight.finally(() => {if(scope.flight === flight)scope.flight = null;});return flight;
  };
  const generate = () => {
    if(!current() || !paid.current)return Promise.resolve(false);
    if(scope.flight)return scope.flight;
    // Pending uncertainty is never replaced by another input or an automatic retry.
    if(scope.operation)return Promise.resolve(false);
    const {topic,style} = snapshot(),trimmed = topic.trim();
    if(trimmed.length < 3 || trimmed.length > 500 || !styles.includes(style)){update({error:'input'});return Promise.resolve(false);}
    return run({kind:'ai',topic:trimmed,style,lang,eligible:() => true,context:context()});
  };
  const upload = (file:File,originalUrl?:string,eligible:() => boolean = () => true) => {
    if(!current() || !paid.current)return Promise.resolve(false);
    if(scope.flight)return scope.flight;
    if(scope.operation)return Promise.resolve(false);
    if(originalUrl && snapshot().backgroundUrl !== originalUrl)return Promise.resolve(false);
    if(!['image/png','image/jpeg','image/webp'].includes(file.type) || !file.size || file.size > 15*1024*1024){update({error:'input'});return Promise.resolve(false);}
    return run({key:'bg-'+crypto.randomUUID(),kind:originalUrl ? 'crop' : 'upload',file,originalUrl,eligible,topic:snapshot().topic.trim(),style:snapshot().style,lang,context:context()});
  };
  const retry = () => scope.operation ? run(scope.operation) : Promise.resolve(false);
  const cancelCrop = () => {if(current() && scope.operation?.kind === 'crop')discard();};
  const setTopic = (topic:string) => {if(typeof topic === 'string')update({topic});};
  const setStyle = (style:string) => {if(styles.includes(style))update({style});};
  useEffect(() => {
    scope.active = true;setStore({scope,...empty()});
    return () => {scope.active = false;scope.operation = null;scope.controller?.abort();if(scope.deadline)clearTimeout(scope.deadline);};
  },[scope]);
  const view = store.scope === scope && current() ? store : empty();
  return {...view,current,setTopic,setStyle,generate,upload,retry,discard,cancelCrop,
    crop:(source:string,blob:Blob,eligible:() => boolean) => upload(new File([blob],'bg-cropped.png',{type:blob.type}),source,eligible),
    pendingStale:!!scope.operation && scope.operation.context !== context(),
    resultStale:!!view.backgroundUrl && view.resultContext !== context(),
    pendingKind:scope.operation?.kind ?? null};
}

