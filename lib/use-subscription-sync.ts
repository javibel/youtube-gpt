'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {beginSync,retainedSync,trustedSyncOutcome,syncBlocked,observeSyncOriginal,validSyncSelection} from '@/lib/subscription-sync-client';
import {otherBillingDenied} from '@/lib/subscription-sync-denial';
import type {SyncOwner,SyncSelection,SyncAttempt,SyncOutcome,SyncReceipt} from '@/lib/subscription-sync-client';
export function useSubscriptionSync(owner:SyncOwner,status:string,lang:string,selection:SyncSelection|null,isCurrent:()=>boolean,onConfirmed:(receipt:SyncReceipt)=>void){
  const account=useMemo(()=>({userId:owner.userId,email:owner.email,status}),[owner.userId,owner.email,status]),activeAccount=useRef(account);activeAccount.current=account;
  const scope=useMemo(()=>({active:true,generation:{},flight:null as Promise<void>|null,delivered:null as SyncAttempt|null}),[account,lang,selection?.subscriptionId,selection?.plan,selection?.status,selection?.cancelAtPeriodEnd,selection?.currentPeriodEnd]);
  const generation=scope.generation,currentScope=useRef(scope);currentScope.current=scope;
  const [view,setView]=useState<{scope:object;generation:object;waiting:boolean;outcome?:SyncOutcome}|null>(null),[,render]=useState(0);
  const consumed=useRef<{account:object;lang:string;attempt:SyncAttempt;outcome:SyncOutcome}|null>(null);
  const canConsume=()=>activeAccount.current===account&&isCurrent()&&status==='authenticated'&&/^[\w-]{1,128}$/.test(owner.userId)&&!!owner.email&&owner.email.length<=320;
  const current=()=>canConsume()&&scope.active&&scope.generation===generation&&currentScope.current===scope;
  const retained=current()?retainedSync(owner):undefined;
  const matches=(a:SyncAttempt)=>!!selection&&a.lang===lang&&Object.entries(a.selection).every(([k,v])=>selection[k as keyof SyncSelection]===v);
  function wait(a:SyncAttempt,pending:Promise<SyncOutcome>){setView({scope,generation,waiting:true});const flight=pending.then(r=>{
    if(!current())return;const trusted=trustedSyncOutcome(a),outcome=r.status==='confirmed'&&trusted?.status==='confirmed'&&matches(a)?trusted:{status:'unconfirmed' as const};
    setView({scope,generation,waiting:false,outcome});
    if(outcome.status==='confirmed'&&scope.delivered!==a&&current()){scope.delivered=a;consumed.current={account,lang,attempt:a,outcome};try{onConfirmed(outcome.receipt);}catch{/* Read failure cannot manufacture or erase the own receipt. */}}
  }).catch(()=>{if(current())setView({scope,generation,waiting:false,outcome:{status:'unconfirmed'}});}).finally(()=>{if(scope.flight===flight)scope.flight=null;});scope.flight=flight;return flight;}
  function start(){if(!current())return Promise.resolve();if(scope.flight)return scope.flight;if(!validSyncSelection(selection)||syncBlocked(owner)||otherBillingDenied(owner)||(lang!=='es'&&lang!=='en'))return Promise.resolve();const a=beginSync(owner,selection,lang,canConsume);if(a)return wait(a,a.waiter);render(n=>n+1);return Promise.resolve();}
  function observe(){if(!current())return Promise.resolve();if(scope.flight)return scope.flight;if(!retained||!matches(retained))return Promise.resolve();return wait(retained,observeSyncOriginal(retained));}
  useEffect(()=>{scope.active=true;render(n=>n+1);return()=>{scope.active=false;scope.generation={};scope.flight=null;};},[scope]);
  const shown=current()&&view?.scope===scope&&view.generation===generation?view:null;
  // A follow-up read may change selection. Only this instance's previously
  // consumed receipt remains an observation of its own original, not that read.
  const own=consumed.current,ownReceipt=current()&&own?.account===account&&own.lang===lang&&trustedSyncOutcome(own.attempt)===own.outcome?own.outcome:undefined;
  const outcome=shown?.outcome??ownReceipt,blocked=current()&&syncBlocked(owner);
  return{start,observe,waiting:!!shown?.waiting,outcome,blocked,confirmed:outcome?.status==='confirmed',hasOriginal:!!retained,pending:!!retained?.pending,selectionMatches:!!retained&&matches(retained),
    canStart:current()&&validSyncSelection(selection)&&!blocked&&!otherBillingDenied(owner)&&!shown?.waiting&&(lang==='es'||lang==='en'),canObserve:current()&&!!retained&&matches(retained)&&!shown?.waiting};
}
