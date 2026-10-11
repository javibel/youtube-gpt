import {syncDenied,otherBillingDenied,denySync} from '@/lib/subscription-sync-denial';
export type SyncOwner=Readonly<{userId:string;email:string}>;
export type SyncSelection=Readonly<{subscriptionId:string|null;plan:string|null;status:string|null;cancelAtPeriodEnd:boolean|null;currentPeriodEnd:string|null}>;
export type SyncReceipt=Readonly<{ok:true;userId:string;email:string;key:string;selectedSubscriptionId:string|null;subscriptionId:string|null;synced:boolean;status:string|null;plan:string|null;mode:'simulated'}>;
export type SyncOutcome={status:'confirmed';receipt:SyncReceipt}|{status:'unconfirmed'};
export interface SyncAttempt {readonly owner:SyncOwner;readonly key:string;readonly selection:SyncSelection;readonly lang:'es'|'en';readonly original:Promise<SyncOutcome>;readonly waiter:Promise<SyncOutcome>;readonly pending:boolean}
const attempts=new Map<string,SyncAttempt>(),records=new WeakMap<SyncAttempt,{pending:boolean;outcome?:SyncOutcome}>();
const identity=(owner:SyncOwner)=>JSON.stringify([owner.userId,owner.email]);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[\w-]{1,128}$/.test(v);
const uncertain=():SyncOutcome=>Object.freeze({status:'unconfirmed'});
export const retainedSync=(owner:SyncOwner)=>attempts.get(identity(owner));
export const syncBlocked=(owner:SyncOwner)=>attempts.has(identity(owner))||syncDenied(owner);
export function validSyncSelection(s:SyncSelection|null|undefined):s is SyncSelection {
  if(!s)return false;
  if(s.subscriptionId===null)return s.plan===null&&s.status===null&&s.cancelAtPeriodEnd===null&&s.currentPeriodEnd===null;
  return id(s.subscriptionId)&&['free','pro','business'].includes(s.plan??'')&&['active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused'].includes(s.status??'')
    &&typeof s.cancelAtPeriodEnd==='boolean'&&(s.currentPeriodEnd===null||(typeof s.currentPeriodEnd==='string'&&Number.isFinite(Date.parse(s.currentPeriodEnd))&&new Date(s.currentPeriodEnd).toISOString()===s.currentPeriodEnd));
}
export function trustedSyncOutcome(a:SyncAttempt):SyncOutcome|undefined{return attempts.get(identity(a.owner))===a?records.get(a)?.outcome:undefined;}
function receipt(v:unknown,a:SyncAttempt):SyncReceipt|null {
  if(!v||typeof v!=='object'||Array.isArray(v))return null;const r=v as Record<string,unknown>;
  if(Object.keys(r).length!==10||r.ok!==true||r.userId!==a.owner.userId||r.email!==a.owner.email||r.key!==a.key||r.selectedSubscriptionId!==a.selection.subscriptionId||r.mode!=='simulated'||typeof r.synced!=='boolean')return null;
  if(r.synced){if(!id(r.subscriptionId)||(a.selection.subscriptionId!==null&&r.subscriptionId!==a.selection.subscriptionId)||!['pro','business'].includes(r.plan as string)||!['active','trialing'].includes(r.status as string))return null;}
  else if(r.subscriptionId!==a.selection.subscriptionId||r.plan!==null||r.status!==null)return null;
  return Object.freeze({ok:true,userId:a.owner.userId,email:a.owner.email,key:a.key,selectedSubscriptionId:a.selection.subscriptionId,subscriptionId:r.subscriptionId as string|null,synced:r.synced,status:r.status as string|null,plan:r.plan as string|null,mode:'simulated'});
}
function bounded(original:Promise<SyncOutcome>,deadline:number):Promise<SyncOutcome>{let timer:ReturnType<typeof setTimeout>|undefined;return(async()=>{try{const r=await Promise.race([original,new Promise<SyncOutcome>(resolve=>{timer=setTimeout(()=>resolve(uncertain()),Math.max(0,deadline-performance.now()));})]);return performance.now()>=deadline?uncertain():r;}finally{clearTimeout(timer);}})();}
export function observeSyncOriginal(a:SyncAttempt):Promise<SyncOutcome>{return attempts.get(identity(a.owner))===a&&records.has(a)?bounded(a.original,performance.now()+60_000):Promise.resolve(uncertain());}
export function beginSync(owner:SyncOwner,selection:SyncSelection,lang:'es'|'en',canConsume:()=>boolean):SyncAttempt|null {
  if(!id(owner.userId)||typeof owner.email!=='string'||!owner.email||owner.email.length>320||!validSyncSelection(selection)||!['es','en'].includes(lang)||!canConsume()||syncBlocked(owner)||otherBillingDenied(owner))return null;
  let key:string;try{key=crypto.randomUUID();if(!id(key))return null;}catch{return null;}
  const own=Object.freeze({userId:owner.userId,email:owner.email}),selected=Object.freeze({...selection}),body=JSON.stringify({subscriptionId:selected.subscriptionId});
  if(!denySync(own))return null;
  const state:{pending:boolean;outcome?:SyncOutcome}={pending:true},a={owner:own,key,selection:selected,lang} as SyncAttempt;
  attempts.set(identity(own),a);records.set(a,state);const deadline=performance.now()+60_000;
  const original=Promise.resolve().then(async():Promise<SyncOutcome>=>{try{
    if(performance.now()>=deadline||!canConsume())return uncertain();
    const response=await fetch('/api/stripe/sync',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Idempotency-Key':key},body});
    if(!canConsume())return uncertain();const value:unknown=await response.json();if(!canConsume())return uncertain();
    const accepted=response.ok&&response.status===200?receipt(value,a):null;return accepted?Object.freeze({status:'confirmed',receipt:accepted}):uncertain();
  }catch{return uncertain();}}).then(r=>{state.pending=false;state.outcome=r;return r;});
  Object.defineProperties(a,{original:{value:original},waiter:{value:bounded(original,deadline)},pending:{get:()=>state.pending}});return Object.freeze(a);
}
