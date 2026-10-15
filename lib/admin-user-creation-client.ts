import { validatePassword } from '@/lib/password';
import type { AdminStatsOwner } from '@/lib/admin-stats-client';

export type AdminUserCreationForm = Readonly<{email:string;name:string;password:string}>;
declare const creationReceiptBrand: unique symbol;
export type AdminUserCreationReceipt = {readonly [creationReceiptBrand]:true};
type Created = Readonly<{id:string;email:string;name:string|null}>;
const receipts=new WeakMap<object,{own:object;user:Created}>();
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const email=(v:unknown):v is string=>typeof v==='string'&&v.length<=254&&/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const object=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));

// Input validation only restricts. It returns no credential, receipt or grant.
export function adminUserCreationCandidate(form:AdminUserCreationForm){
  if(typeof form?.email!=='string'||typeof form.name!=='string'||typeof form.password!=='string'||form.email.length>254)return null;
  const targetEmail=form.email.trim().toLowerCase(),name=form.name.trim()||null;
  if(!email(targetEmail)||name!==null&&(name.length>200||/[\x00-\x1f\x7f]/.test(name))||/[\x00-\x1f\x7f]/.test(form.password)||new TextEncoder().encode(form.password).length>72||validatePassword(form.password))return null;
  return Object.freeze({email:targetEmail,name});
}
// Native cookie/JWE/account/admission retain all business authority. This one
// captured fetch can acknowledge only its own command, actor and original ACK.
// No caller-selected transport/status query/retry/recovery path is exposed.
export function beginAdminUserCreation(owner:AdminStatsOwner,form:AdminUserCreationForm,current:()=>boolean,onRetire:()=>void){
  const own={},captured=Object.freeze({...owner}),target=adminUserCreationCandidate(form),startedAt=Date.now(),deadline=performance.now()+25000,controller=new AbortController();
  let body:string|null=target?JSON.stringify({...target,password:form.password}):null,commandRef='',retired=false,expiresAt=Math.min(startedAt+25000,captured.expiresAt),timer:ReturnType<typeof setTimeout>|undefined,rejectStop!:(e:Error)=>void;
  const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(retired)return;retired=true;body=null;controller.abort();clearTimeout(timer);rejectStop(Error('Unconfirmed admin user creation'));onRetire();};
  const check=()=>{if(retired||!current()||controller.signal.aborted||Date.now()<startedAt||Date.now()>=expiresAt||performance.now()>=deadline){retire();throw Error('Unconfirmed admin user creation');}};
  const wait=async<T>(fn:()=>Promise<T>)=>{check();const pending=Promise.resolve().then(()=>{check();return fn();});void pending.catch(()=>{});const value=await Promise.race([pending,stopped]);check();return value;};
  timer=setTimeout(retire,Math.max(0,expiresAt-startedAt));
  const original=(async()=>{try{
    commandRef=crypto.randomUUID();
    if(!id(captured.id)||!email(captured.email)||!count(captured.expiresAt)||!target||!body||new TextEncoder().encode(body).length>4096||!uuid(commandRef))throw Error('Unconfirmed admin user creation');
    const response=await wait(()=>{const sent=body!;body=null;return fetch('/api/admin/create-user',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-YTV-User-Command':commandRef},body:sent,signal:controller.signal});});
    if(response.status!==200||!response.ok||response.redirected||response.headers.get('cache-control')!=='no-store')throw Error('Unconfirmed admin user creation');
    const text=await wait(()=>response.text());if(text.length>8192)throw Error('Unconfirmed admin user creation');
    const value:unknown=JSON.parse(text);check();if(!object(value,['ok','user','adminUserCreation'])||value.ok!==true)throw Error('Unconfirmed admin user creation');
    const ack=value.adminUserCreation,user=value.user;
    if(!object(ack,['commandRef','targetUserId','targetEmail','userId','email','asOf','expiresAt'])||ack.commandRef!==commandRef||!uuid(ack.targetUserId)||ack.targetEmail!==target.email||ack.userId!==captured.id||ack.email!==captured.email
      ||!count(ack.asOf)||ack.asOf<startedAt||ack.asOf>Date.now()||!count(ack.expiresAt)||ack.expiresAt<=ack.asOf||ack.expiresAt-ack.asOf>25000
      ||!object(user,['id','email','name'])||user.id!==ack.targetUserId||user.email!==target.email||user.name!==target.name)throw Error('Unconfirmed admin user creation');
    expiresAt=Math.min(expiresAt,ack.expiresAt);check();clearTimeout(timer);timer=setTimeout(retire,Math.max(0,expiresAt-Date.now()));
    const receipt=Object.freeze({}) as AdminUserCreationReceipt;receipts.set(receipt,{own,user:Object.freeze({id:ack.targetUserId,email:target.email,name:target.name})});return receipt;
  }catch{retire();throw Error('Unconfirmed admin user creation');}})();void original.catch(()=>{});
  const created=(receipt:AdminUserCreationReceipt|null|undefined)=>{try{check();const value=receipt&&receipts.get(receipt);return value&&value.own===own?value.user:null;}catch{return null;}};
  return Object.freeze({original,retire,created,confirmed:(receipt:AdminUserCreationReceipt|null|undefined)=>!!created(receipt)});
}
