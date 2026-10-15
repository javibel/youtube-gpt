import type { AdminStatsOwner } from '@/lib/admin-stats-client';

export type AdminManualGrantForm = Readonly<{email:string;plan:'pro'|'business';durationDays:number}>;
declare const grantReceiptBrand: unique symbol;
export type AdminManualGrantReceipt = {readonly [grantReceiptBrand]:true};
type Granted = Readonly<{email:string;plan:'pro'|'business';currentPeriodEnd:string}>;
const receipts=new WeakMap<object,{own:object;grant:Granted}>();
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const email=(v:unknown):v is string=>typeof v==='string'&&v.length<=254&&/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const object=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function adminManualGrantCandidate(form:AdminManualGrantForm):AdminManualGrantForm|null{
  if(typeof form?.email!=='string'||form.email.length>254||(form.plan!=='pro'&&form.plan!=='business')||!count(form.durationDays)||form.durationDays<1||form.durationDays>365)return null;
  const targetEmail=form.email.trim().toLowerCase();return email(targetEmail)?Object.freeze({email:targetEmail,plan:form.plan,durationDays:form.durationDays}):null;
}
// Native authorization/admission own the effect. A DTO can only restrict the
// response of this captured fetch; it cannot originate/recover/retry a grant.
export function beginAdminManualGrant(owner:AdminStatsOwner,form:AdminManualGrantForm,current:()=>boolean,onRetire:()=>void){
  const own={},captured=Object.freeze({...owner}),target=adminManualGrantCandidate(form),startedAt=Date.now(),deadline=performance.now()+25000,controller=new AbortController();
  let commandRef='',retired=false,expiresAt=Math.min(startedAt+25000,captured.expiresAt),timer:ReturnType<typeof setTimeout>|undefined,rejectStop!:(e:Error)=>void;
  const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(retired)return;retired=true;controller.abort();clearTimeout(timer);rejectStop(Error('Unconfirmed admin manual grant'));onRetire();};
  const check=()=>{if(retired||!current()||controller.signal.aborted||Date.now()<startedAt||Date.now()>=expiresAt||performance.now()>=deadline){retire();throw Error('Unconfirmed admin manual grant');}};
  const wait=async<T>(fn:()=>Promise<T>)=>{check();const pending=Promise.resolve().then(()=>{check();return fn();});void pending.catch(()=>{});const value=await Promise.race([pending,stopped]);check();return value;};
  timer=setTimeout(retire,Math.max(0,expiresAt-startedAt));
  const original=(async()=>{try{
    commandRef=crypto.randomUUID();
    if(!id(captured.id)||!email(captured.email)||!count(captured.expiresAt)||!target||!uuid(commandRef))throw Error('Unconfirmed admin manual grant');
    const body=JSON.stringify(target);
    const response=await wait(()=>fetch('/api/admin/grant-pro',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-YTV-Grant-Command':commandRef},body,signal:controller.signal}));
    if(response.status!==200||!response.ok||response.redirected||response.headers.get('cache-control')!=='no-store')throw Error('Unconfirmed admin manual grant');
    const text=await wait(()=>response.text());if(text.length>8192)throw Error('Unconfirmed admin manual grant');
    const value:unknown=JSON.parse(text);check();if(!object(value,['ok','plan','currentPeriodEnd','adminManualGrant'])||value.ok!==true)throw Error('Unconfirmed admin manual grant');
    const ack=value.adminManualGrant;
    if(!object(ack,['commandRef','subscriptionId','targetUserId','targetEmail','plan','durationDays','currentPeriodStart','currentPeriodEnd','userId','email','asOf','expiresAt'])
      ||ack.commandRef!==commandRef||!uuid(ack.subscriptionId)||!id(ack.targetUserId)||ack.targetEmail!==target.email||ack.plan!==target.plan||ack.durationDays!==target.durationDays
      ||ack.userId!==captured.id||ack.email!==captured.email||!count(ack.asOf)||ack.asOf<startedAt||ack.asOf>Date.now()||!count(ack.expiresAt)||ack.expiresAt<=ack.asOf||ack.expiresAt-ack.asOf>25000
      ||ack.currentPeriodStart!==new Date(ack.asOf).toISOString()||ack.currentPeriodEnd!==new Date(ack.asOf+target.durationDays*86400000).toISOString()
      ||value.plan!==target.plan||value.currentPeriodEnd!==ack.currentPeriodEnd)throw Error('Unconfirmed admin manual grant');
    expiresAt=Math.min(expiresAt,ack.expiresAt);check();clearTimeout(timer);timer=setTimeout(retire,Math.max(0,expiresAt-Date.now()));
    const receipt=Object.freeze({}) as AdminManualGrantReceipt;receipts.set(receipt,{own,grant:Object.freeze({email:target.email,plan:target.plan,currentPeriodEnd:ack.currentPeriodEnd as string})});return receipt;
  }catch{retire();throw Error('Unconfirmed admin manual grant');}})();void original.catch(()=>{});
  const granted=(receipt:AdminManualGrantReceipt|null|undefined)=>{try{check();const value=receipt&&receipts.get(receipt);return value&&value.own===own?value.grant:null;}catch{return null;}};
  return Object.freeze({original,retire,granted,confirmed:(receipt:AdminManualGrantReceipt|null|undefined)=>!!granted(receipt)});
}
