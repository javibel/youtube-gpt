import type { AdminStatsOwner } from '@/lib/admin-stats-client';

export type AdminUserDeletionTarget = Readonly<{userId:string;email:string}>;
declare const deletionReceiptBrand: unique symbol;
export type AdminUserDeletionReceipt = {readonly [deletionReceiptBrand]:true};
const receipts=new WeakMap<object,object>();
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const email=(v:unknown):v is string=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
function object(v:unknown,keys:string[]):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));}

// A private original fetch can acknowledge only its captured command. Session
// metadata, view/UUID/JSON and current() only restrict; native server cookie,
// account and purpose checks retain all mutation authority. No retry or status
// query can recover this receipt, and retirement never establishes rollback.
export function beginAdminUserDeletion(owner:AdminStatsOwner,selection:AdminUserDeletionTarget,current:()=>boolean,onRetire:()=>void){
  const own={},captured=Object.freeze({...owner}),command=Object.freeze({userId:selection.userId,email:selection.email}),startedAt=Date.now(),deadline=performance.now()+25000,controller=new AbortController();
  let commandRef='',retired=false,expiresAt=Math.min(startedAt+25000,captured.expiresAt),timer:ReturnType<typeof setTimeout>|undefined,rejectStop!:(e:Error)=>void;
  const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(retired)return;retired=true;controller.abort();clearTimeout(timer);rejectStop(Error('Unconfirmed admin user deletion'));onRetire();};
  const check=()=>{if(retired||!current()||controller.signal.aborted||Date.now()<startedAt||Date.now()>=expiresAt||performance.now()>=deadline){retire();throw Error('Unconfirmed admin user deletion');}};
  const wait=async<T>(fn:()=>Promise<T>)=>{check();const pending=Promise.resolve().then(()=>{check();return fn();});void pending.catch(()=>{});const value=await Promise.race([pending,stopped]);check();return value;};
  timer=setTimeout(retire,Math.max(0,expiresAt-startedAt));
  const original=(async()=>{try{
    commandRef=crypto.randomUUID();
    if(!id(captured.id)||!email(captured.email)||!count(captured.expiresAt)||!uuid(commandRef)||!id(command.userId)||!email(command.email)||command.email!==command.email.trim().toLowerCase()||command.userId===captured.id||command.email===captured.email)throw Error('Unconfirmed admin user deletion');
    const body=JSON.stringify(command);
    const response=await wait(()=>fetch('/api/admin/delete-user',{method:'DELETE',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-YTV-Delete-Command':commandRef},body,signal:controller.signal}));
    if(response.status!==200||!response.ok||response.redirected||response.headers.get('cache-control')!=='no-store')throw Error('Unconfirmed admin user deletion');
    const text=await wait(()=>response.text());if(text.length>8192)throw Error('Unconfirmed admin user deletion');
    const value:unknown=JSON.parse(text);check();if(!object(value,['ok','adminUserDeletion'])||value.ok!==true)throw Error('Unconfirmed admin user deletion');
    const ack=value.adminUserDeletion;
    if(!object(ack,['commandRef','targetUserId','targetEmail','userId','email','asOf','expiresAt'])||ack.commandRef!==commandRef||ack.targetUserId!==command.userId||ack.targetEmail!==command.email||ack.userId!==captured.id||ack.email!==captured.email
      ||!count(ack.asOf)||ack.asOf<startedAt||ack.asOf>Date.now()||!count(ack.expiresAt)||ack.expiresAt<=ack.asOf||ack.expiresAt-ack.asOf>25000)throw Error('Unconfirmed admin user deletion');
    expiresAt=Math.min(expiresAt,ack.expiresAt);check();clearTimeout(timer);timer=setTimeout(retire,Math.max(0,expiresAt-Date.now()));
    const receipt=Object.freeze({}) as AdminUserDeletionReceipt;receipts.set(receipt,own);return receipt;
  }catch{retire();throw Error('Unconfirmed admin user deletion');}})();void original.catch(()=>{});
  return Object.freeze({original,retire,confirmed(receipt:AdminUserDeletionReceipt|null|undefined){try{check();return !!receipt&&receipts.get(receipt)===own;}catch{return false;}}});
}
