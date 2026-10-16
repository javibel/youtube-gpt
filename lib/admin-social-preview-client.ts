import type { AdminStatsOwner } from '@/lib/admin-stats-client';

export type SocialPreview=Readonly<{facebook:string;instagram:string;tiktok:null;twitter:null}>;
declare const previewReceiptBrand:unique symbol;
export type SocialPreviewReceipt={readonly[previewReceiptBrand]:true};
const receipts=new WeakMap<object,{own:object;preview:SocialPreview}>();
const object=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=20000&&v.trim().length>0;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);

// Session metadata/current() can veto only. The server's native cookie and
// original producer keep all authority. One transport, body and response read;
// no injectable fetch, status lookup, retry, reset or recovered receipt.
export function beginAdminSocialPreview(owner:AdminStatsOwner,type:'morning'|'evening',current:()=>boolean,onRetire:()=>void){
  const own={},captured=Object.freeze({...owner}),at=Date.now(),started=performance.now(),controller=new AbortController(),transport=fetch;
  let expiresAt=Math.min(at+55000,captured.expiresAt),retired=false,timer:ReturnType<typeof setTimeout>|undefined,rejectStop!:(error:Error)=>void;
  const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(retired)return;retired=true;controller.abort();clearTimeout(timer);rejectStop(Error('Unconfirmed social preview'));onRetire();};
  const check=()=>{if(retired||!current()||controller.signal.aborted||Date.now()<at||Date.now()>=expiresAt||performance.now()<started||performance.now()>=started+55000){retire();throw Error('Unconfirmed social preview');}};
  const wait=async<T>(fn:()=>Promise<T>)=>{check();const pending=Promise.resolve().then(()=>{check();return fn();});void pending.catch(()=>{});const value=await Promise.race([pending,stopped]);check();return value;};
  timer=setTimeout(retire,Math.max(0,expiresAt-at));
  const original=(async()=>{try{
    const commandRef=crypto.randomUUID();
    if(typeof captured.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(captured.id)||typeof captured.email!=='string'||captured.email.length>254||!/^\S+@\S+\.\S+$/.test(captured.email)||!integer(captured.expiresAt)||!['morning','evening'].includes(type)||!uuid(commandRef))throw Error('Unconfirmed social preview');
    const body=JSON.stringify({action:'test',type});
    const response=await wait(()=>transport('/api/agent/run',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','x-ytv-social-preview-command':commandRef},body,signal:controller.signal}));
    if(response.status!==200||!response.ok||response.redirected||response.headers.get('cache-control')!=='no-store')throw Error('Unconfirmed social preview');
    const read=response.text.bind(response),raw=await wait(read);if(raw.length>250000)throw Error('Unconfirmed social preview');
    const value:unknown=JSON.parse(raw);check();
    if(!object(value,['ok','preview','socialPreview'])||value.ok!==true)throw Error('Unconfirmed social preview');
    const ack=value.socialPreview,p=value.preview;
    if(!object(ack,['commandRef','userId','email','type','asOf','expiresAt'])||ack.commandRef!==commandRef||ack.userId!==captured.id||ack.email!==captured.email||ack.type!==type
      ||!integer(ack.asOf)||ack.asOf<at||ack.asOf>Date.now()||!integer(ack.expiresAt)||ack.expiresAt<=ack.asOf||ack.expiresAt-ack.asOf>55000
      ||!object(p,['facebook','instagram','tiktok','twitter'])||!text(p.facebook)||!text(p.instagram)||p.tiktok!==null||p.twitter!==null)throw Error('Unconfirmed social preview');
    expiresAt=Math.min(expiresAt,ack.expiresAt);check();clearTimeout(timer);timer=setTimeout(retire,Math.max(0,expiresAt-Date.now()));
    const receipt=Object.freeze({})as SocialPreviewReceipt;receipts.set(receipt,{own,preview:Object.freeze({facebook:p.facebook,instagram:p.instagram,tiktok:null,twitter:null})});return receipt;
  }catch{retire();throw Error('Unconfirmed social preview');}})();void original.catch(()=>{});
  return Object.freeze({original,retire,display(receipt:SocialPreviewReceipt|null|undefined):SocialPreview|null{try{check();const entry=receipt&&receipts.get(receipt);return entry?.own===own?entry.preview:null;}catch{return null;}}});
}
