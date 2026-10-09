'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { THUMB_H, type PhotoItem } from '@/lib/thumbnail-types';
import { fetchRemovalPhoto } from '@/lib/thumbnail-removal-response';
import { readPhotoDraft, storePhotoDraft, matchesPhotoDraft, discardPhotoDraft, type StoredPhotoDraft } from '@/lib/thumbnail-photo-draft';

const empty = () => ({ photo: null as PhotoItem | null, originalFile: null as File | null,
  originalSrc: null as string | null, displayFile:null as File|null, draftAvailable:false,draftWarning:false, removed: false, busy: false,
  error: null as 'invalid' | 'decode' | 'unconfirmed' | null });
const valid = (file: Blob) => ['image/png','image/jpeg','image/webp'].includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024;

export function useThumbnailPhoto(userId: string | undefined, email: string | null | undefined,
  status: string, lang: string, isPro: boolean) {
  const scope = useMemo(() => ({ active: true, changed:false,offered:null as StoredPhotoDraft|null,savedRaw:null as string|null,write:null as AbortController|null,operation: null as object | null,
    removal:null as {key:string;file:File;src:string}|null, flight: null as Promise<boolean> | null, controller: null as AbortController | null,
    deadline: null as ReturnType<typeof setTimeout> | null, cancelImage: null as (() => void) | null, urls: new Set<string>() }), [userId,email,status,lang]);
  const active = useRef(scope);active.current = scope;
  const paid = useRef(isPro);paid.current = isPro;
  const [store,setStore] = useState(() => ({ scope,...empty() }));
  const state = useRef(store);state.current = store;
  const current = () => scope.active && active.current === scope && status === 'authenticated'
    && !!userId && !!email && ['es','en'].includes(lang);
  const view = store.scope === scope && current() ? store : empty();
  const update = (change: Partial<ReturnType<typeof empty>>) => {
    if (current()) setStore(old => current() ? { ...(old.scope === scope ? old : {scope,...empty()}),...change } : old);
  };
  const snapshot = () => state.current.scope === scope ? state.current : {scope,...empty()};
  const cancel = () => {
    scope.operation = null;scope.removal = null;scope.cancelImage?.();scope.cancelImage = null;
    scope.controller?.abort();scope.controller = null;if(scope.deadline)clearTimeout(scope.deadline);scope.deadline = null;
  };
  const begin = () => { scope.changed=true;scope.write?.abort();cancel();update({draftAvailable:false});const op = {};scope.operation = op;update({busy:true,error:null});return op; };
  const live = (op: object) => current() && (paid.current || !!scope.removal) && scope.operation === op;
  const release = (url: string) => { if(scope.urls.delete(url))URL.revokeObjectURL(url); };
  const measure = (src: string, op: object) => new Promise<{width:number;height:number}>((resolve,reject) => {
    const img = new Image();let done = false;
    const finish = (ok: boolean) => {
      if(done)return;done = true;clearTimeout(timer);img.onload = null;img.onerror = null;
      if(scope.cancelImage === abort)scope.cancelImage = null;
      if(ok && live(op) && Number.isFinite(img.naturalWidth) && Number.isFinite(img.naturalHeight)
        && img.naturalWidth > 0 && img.naturalHeight > 0 && img.naturalWidth <= 16384 && img.naturalHeight <= 16384
        && img.naturalWidth * img.naturalHeight <= 40_000_000)resolve({width:img.naturalWidth,height:img.naturalHeight});
      else reject(Error('Image unavailable'));
    };
    const abort = () => finish(false);
    const timer = setTimeout(abort,15_000);scope.cancelImage = abort;
    img.onload = () => finish(true);img.onerror = abort;img.src = src;
  });
  const place = async (file: File, op: object, original: boolean, eligible = () => true) => {
    const src = URL.createObjectURL(file);scope.urls.add(src);let applied = false;
    try {
      const size = await measure(src,op);
      if(!live(op) || !eligible())return false;
      const previous = snapshot().photo, height = previous?.height ?? Math.round(THUMB_H * .85);
      const photo = previous ? {...previous,src,width:Math.round(height * size.width / size.height)}
        : {src,x:0,y:THUMB_H-height,width:Math.round(height * size.width / size.height),height,opacity:1};
      update(original ? {photo,originalFile:file,originalSrc:src,displayFile:file,removed:false} : {photo,displayFile:file,removed:true});
      applied = true;return true;
    } finally { if(!applied)release(src); }
  };
  const upload = (file: File, eligible = () => true) => {
    if(!current() || !paid.current)return Promise.resolve(false);
    // A replacement invalidates every asynchronous operation on the previous photo.
    const op = begin();
    if(!valid(file)){update({busy:false,error:'invalid'});return Promise.resolve(false);}
    const flight = place(file,op,true,eligible).catch(() => {if(live(op))update({error:'decode'});return false;})
      .finally(() => {if(current() && scope.operation === op)update({busy:false});if(scope.flight === flight)scope.flight = null;});
    scope.flight = flight;return flight;
  };
  const crop = (source: string, blob: Blob, eligible = () => true) => {
    if(!current() || !paid.current || snapshot().originalSrc !== source)return Promise.resolve(false);
    return upload(new File([blob],'cropped.png',{type:blob.type}),eligible);
  };
  const remove = (explicitRetry = false) => {
    if(!current() || (!paid.current && !scope.removal))return Promise.resolve(false);
    if(scope.flight)return scope.flight;
    const original = snapshot();
    if(!original.originalFile || original.removed || (original.error === 'unconfirmed' && !explicitRetry))return Promise.resolve(false);
    const attempt=scope.removal??{key:'remove-'+crypto.randomUUID(),file:original.originalFile,src:original.originalSrc!};
    const originalFile = attempt.file;
    const op = begin();scope.removal=attempt;const controller = new AbortController();scope.controller = controller;let timedOut = false;
    const deadline = setTimeout(() => {timedOut = true;controller.abort();},45_000);scope.deadline = deadline;
    const flight = Promise.resolve().then(async () => {
      try {
        if(!live(op))return false;
        const blob = await fetchRemovalPhoto(originalFile,controller.signal,{key:attempt.key,userId:userId!});
        if(!live(op))return false;
        if(timedOut || blob.type !== 'image/png' || !valid(blob))throw Error('Removal unconfirmed');
        const applied=await place(new File([blob],'removed.png',{type:'image/png'}),op,false);
        if(applied && scope.removal===attempt)scope.removal=null;return applied;
      } catch {if(live(op))update({error:'unconfirmed'});return false;}
      finally {clearTimeout(deadline);if(scope.deadline === deadline)scope.deadline = null;if(scope.controller === controller)scope.controller = null;if(current() && scope.operation === op)update({busy:false});}
    });
    scope.flight = flight;void flight.finally(() => {if(scope.flight === flight)scope.flight = null;});return flight;
  };
  const restore = () => {
    if(!current() || (!paid.current && !scope.removal))return;
    scope.changed=true;scope.write?.abort();cancel();scope.flight = null;const original = snapshot();
    if(original.photo && original.originalSrc)update({photo:{...original.photo,src:original.originalSrc},displayFile:original.originalFile,removed:false,busy:false,error:null});
  };
  const clear = () => {if(!current())return;scope.changed=true;scope.write?.abort();cancel();scope.flight = null;const removed=!scope.savedRaw||discardPhotoDraft(userId!,email!,lang,scope.savedRaw);if(removed)scope.savedRaw=null;scope.offered=null;update({...empty(),draftWarning:!removed});};
  const updatePhoto = (updates: Partial<PhotoItem>) => {
    if(!current() || !paid.current)return;
    // Canvas geometry cannot replace a file, original identity or owned URL.
    const {x,y,width,height,opacity} = updates;
    const safe = Object.fromEntries(Object.entries({x,y,width,height,opacity}).filter(([,v]) => typeof v === 'number' && Number.isFinite(v)));
    const photo = snapshot().photo;if(photo){scope.changed=true;scope.write?.abort();update({photo:{...photo,...safe}});}
  };
  const restoreDraft = async () => {
    const offered=scope.offered;
    if(!current()||!paid.current||scope.changed||!offered||snapshot().photo||scope.operation)return false;
    if(!matchesPhotoDraft(userId!,email!,lang,offered.raw)){update({draftAvailable:false,draftWarning:true});return false;}
    const op=begin(),originalSrc=URL.createObjectURL(offered.originalFile);scope.urls.add(originalSrc);
    const src=offered.displayFile===offered.originalFile?originalSrc:URL.createObjectURL(offered.displayFile);scope.urls.add(src);let applied=false;
    try{
      await measure(originalSrc,op);if(src!==originalSrc)await measure(src,op);
      if(!live(op)||!matchesPhotoDraft(userId!,email!,lang,offered.raw))return false;
      // Cached derived pixels are an editable file, never an acknowledged removal operation.
      scope.savedRaw=offered.raw;scope.offered=null;
      update({photo:{...offered.geometry,src},originalFile:offered.originalFile,originalSrc,displayFile:offered.displayFile,removed:src!==originalSrc,busy:false,error:null,draftAvailable:false});applied=true;return true;
    }catch{if(live(op))update({error:'decode'});return false;}
    finally{if(!applied){release(src);release(originalSrc);}if(current()&&scope.operation===op){
      if(!applied&&!snapshot().photo&&scope.offered===offered){scope.operation=null;scope.changed=false;update({draftAvailable:matchesPhotoDraft(userId!,email!,lang,offered.raw)});}
      update({busy:false});
    }}
  };
  const discardDraft = () => {
    const offered=scope.offered;if(!current()||!paid.current||scope.changed||!offered||snapshot().photo||scope.operation)return;
    const removed=discardPhotoDraft(userId!,email!,lang,offered.raw);if(removed){scope.offered=null;scope.savedRaw=null;}update({draftAvailable:false,draftWarning:!removed});
  };
  useEffect(() => {
    scope.active = true;scope.offered=readPhotoDraft(userId,email,status,lang);scope.savedRaw=scope.offered?.raw??null;setStore({scope,...empty(),draftAvailable:!!scope.offered});
    return () => {scope.active = false;scope.write?.abort();cancel();for(const url of [...scope.urls])release(url);};
  },[scope]);
  useEffect(() => {
    if(!current())return;
    const retained = new Set([view.photo?.src,view.originalSrc]);
    for(const url of [...scope.urls])if(!retained.has(url) && !scope.cancelImage)release(url);
  },[scope,store]);
  useEffect(() => {
    if(!current()||!view.photo||!view.originalFile||!view.displayFile)return;
    const controller=new AbortController();scope.write?.abort();scope.write=controller;
    const {x,y,width,height,opacity}=view.photo;
    void storePhotoDraft(userId!,email!,lang,view.originalFile,view.displayFile,{x,y,width,height,opacity},controller.signal,scope.savedRaw).then(raw=>{
      if(!current()||controller.signal.aborted||scope.write!==controller)return;
      if(raw)scope.savedRaw=raw;update({draftWarning:!raw});
    });
    return ()=>controller.abort();
  },[scope,view.photo,view.originalFile,view.displayFile]);
  return {...view,current,upload,crop,restoreDraft,discardDraft,removeBackground:() => remove(),retryRemoval:() => remove(true),
    restore,clear,updatePhoto,pendingRemoval:!!scope.removal};
}

