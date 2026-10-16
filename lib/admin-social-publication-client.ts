import type { AdminStatsOwner } from '@/lib/admin-stats-client';

type Publication=Readonly<{platform:'facebook'|'instagram';recordId:string;postId:string}>;
export type SocialPublication=Readonly<{type:'morning'|'evening';date:string;publications:readonly Publication[]}>;
declare const publicationReceiptBrand:unique symbol;
export type SocialPublicationReceipt={readonly[publicationReceiptBrand]:true};
const receipts=new WeakMap<object,{own:object;publication:SocialPublication}>();
const object=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);

// Browser metadata can veto only. The server retains its native cookie,
// publisher and SQL authority. One original transport/body, no retry or lookup.
export function beginAdminSocialPublication(owner:AdminStatsOwner&Readonly<{authSessionRef:string}>,type:'morning'|'evening',current:()=>boolean,onRetire:()=>void){
  const own={},captured=Object.freeze({...owner}),at=Date.now(),started=performance.now(),controller=new AbortController(),transport=fetch;
  let expiresAt=Math.min(at+55000,captured.expiresAt),retired=false,timer:ReturnType<typeof setTimeout>|undefined,rejectStop!:(error:Error)=>void;
  const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(retired)return;retired=true;controller.abort();clearTimeout(timer);rejectStop(Error('Unconfirmed social publication'));onRetire();};
  const check=()=>{if(retired||!current()||controller.signal.aborted||Date.now()<at||Date.now()>=expiresAt||performance.now()<started||performance.now()>=started+55000){retire();throw Error('Unconfirmed social publication');}};
  const wait=async<T>(fn:()=>Promise<T>)=>{check();const pending=Promise.resolve().then(()=>{check();return fn();});void pending.catch(()=>{});const value=await Promise.race([pending,stopped]);check();return value;};
  timer=setTimeout(retire,Math.max(0,expiresAt-at));
  const original=(async()=>{try{
    const commandRef=crypto.randomUUID();
    if(typeof captured.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(captured.id)||typeof captured.email!=='string'||captured.email.length>254||!/^\S+@\S+\.\S+$/.test(captured.email)||!integer(captured.expiresAt)||!uuid(captured.authSessionRef)||!['morning','evening'].includes(type)||!uuid(commandRef))throw Error('Unconfirmed social publication');
    const body=JSON.stringify({action:'publish',type});
    const response=await wait(()=>transport('/api/agent/run',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','x-ytv-social-publish-command':commandRef},body,signal:controller.signal}));
    if(response.status!==200||!response.ok||response.redirected||response.headers.get('cache-control')!=='no-store')throw Error('Unconfirmed social publication');
    const read=response.text.bind(response),raw=await wait(read);if(raw.length>8192)throw Error('Unconfirmed social publication');
    const value:unknown=JSON.parse(raw);check();
    if(!object(value,['ok','socialPublication'])||value.ok!==true)throw Error('Unconfirmed social publication');
    const ack=value.socialPublication;
    if(!object(ack,['commandRef','userId','email','sessionRef','type','date','asOf','expiresAt','publications'])||ack.commandRef!==commandRef||ack.userId!==captured.id||ack.email!==captured.email||ack.sessionRef!==captured.authSessionRef||ack.type!==type
      ||!integer(ack.asOf)||ack.asOf<at||ack.asOf>Date.now()||!integer(ack.expiresAt)||ack.expiresAt<=ack.asOf||ack.expiresAt-ack.asOf>55000
      ||ack.date!==new Date(ack.asOf).toISOString().slice(0,10)||!Array.isArray(ack.publications)||ack.publications.length!==2)throw Error('Unconfirmed social publication');
    const publications:Publication[]=[];
    for(const [i,platform]of(['facebook','instagram']as const).entries()){
      const p=ack.publications[i];
      if(!object(p,['platform','recordId','postId'])||p.platform!==platform||!uuid(p.recordId)||typeof p.postId!=='string'||!(platform==='facebook'?/^\d{1,32}_\d{1,32}$/:/^\d{1,32}$/).test(p.postId))throw Error('Unconfirmed social publication');
      publications.push(Object.freeze({platform,recordId:p.recordId,postId:p.postId}));
    }
    if(publications[0].recordId===publications[1].recordId)throw Error('Unconfirmed social publication');
    expiresAt=Math.min(expiresAt,ack.expiresAt);check();clearTimeout(timer);timer=setTimeout(retire,Math.max(0,expiresAt-Date.now()));
    const receipt=Object.freeze({})as SocialPublicationReceipt;
    receipts.set(receipt,{own,publication:Object.freeze({type,date:ack.date as string,publications:Object.freeze(publications)})});return receipt;
  }catch{retire();throw Error('Unconfirmed social publication');}})();void original.catch(()=>{});
  return Object.freeze({original,retire,display(receipt:SocialPublicationReceipt|null|undefined):SocialPublication|null{try{check();const entry=receipt&&receipts.get(receipt);return entry?.own===own?entry.publication:null;}catch{return null;}}});
}
