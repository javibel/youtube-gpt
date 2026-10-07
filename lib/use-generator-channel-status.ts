'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const initial = () => ({ connected:null as boolean|null, cached:false, expired:false, loading:false, error:false });
// Only connection status is needed by the generator; never load growth or AI ideas.
export function useGeneratorChannelStatus(userId:string|undefined,email:string|null|undefined,authStatus:string) {
  const scope=useMemo(()=>({active:true,flight:null as Promise<void>|null}),[userId,email,authStatus]);
  const active=useRef(scope);active.current=scope;
  const [store,setStore]=useState(()=>({scope,...initial()}));
  const current=useCallback(()=>active.current===scope&&scope.active&&authStatus==='authenticated'&&!!userId&&!!email,[scope,authStatus,userId,email]);
  const update=useCallback((patch:Partial<ReturnType<typeof initial>>)=>{if(current())setStore(old=>({...(old.scope===scope?old:{scope,...initial()}),...patch}));},[scope,current]);
  const retryChannel=useCallback(async()=>{
    if(!current())return;if(scope.flight)return scope.flight;
    update({loading:true,error:false});
    const flight=(async()=>{try{
      const response=await fetch('/api/youtube/channel',{cache:'no-store'});if(!response.ok)throw Error();
      const body=await response.json();
      if(!body||body.userId!==userId||typeof body.connected!=='boolean'
        ||!(body.cached===undefined||typeof body.cached==='boolean')||!(body.expired===undefined||typeof body.expired==='boolean')
        ||(body.connected&&(body.expired===true||!body.channel||typeof body.channel.id!=='string'||!body.channel.id.trim())))throw Error();
      update({connected:body.connected,cached:body.connected&&body.cached===true,expired:!body.connected&&body.expired===true});
    }catch{update({error:true});}finally{update({loading:false});}})();
    scope.flight=flight;try{await flight;}finally{if(scope.flight===flight)scope.flight=null;}
  },[scope,current,update,userId]);
  useEffect(()=>{scope.active=true;setStore({scope,...initial()});void retryChannel();return()=>{scope.active=false;};},[scope,retryChannel]);
  const view=store.scope===scope&&current()?store:initial();
  return {...view,error:view.error||(authStatus==='authenticated'&&(!userId||!email)),retryChannel};
}
