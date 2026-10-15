export type AdminData = {
  overview: { totalUsers:number; proUsers:number; freeUsers:number; mrr:number; conversionRate:number; totalGenerations:number };
  thisMonth: { newUsers:number; newUsersLastMonth:number; generations:number; generationsLastMonth:number };
  templateBreakdown: { template:string; count:number }[];
  daily: { date:string; count:number }[];
  recentUsers: { id:string; email:string; name:string|null; createdAt:string; isPro:boolean; plan:string; generationCount:number }[];
  recentGenerations: { id:string; template:string; createdAt:string; tokensUsed:number|null; userEmail:string }[];
  dataQuality: { source:'stored-admin-aggregates'; freshness:'unconfirmed'; mrr:'fixed-price-estimate'; billingReconciliation:'not-assessed' };
};
export type AdminStatsOwner = Readonly<{ id:string; email:string; expiresAt:number }>;
declare const statsDisplayBrand: unique symbol;
export type AdminStatsDisplay = { readonly [statsDisplayBrand]: true };
const displays=new WeakMap<object,{ owner:object; data:AdminData }>();
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const text=(v:unknown,max=300):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const id=(v:unknown):v is string=>text(v,128)&&/^[\w-]+$/.test(v);
const email=(v:unknown):v is string=>text(v,254)&&v===v.trim().toLowerCase()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const iso=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
function object(value:unknown,keys:string[]):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
function frozen<T>(value:T):T {if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;}
function decode(value:unknown):AdminData {
  const keys=['overview','thisMonth','templateBreakdown','daily','recentUsers','recentGenerations','dataQuality','adminStatsRead'];
  if(!object(value,keys))throw Error('Unconfirmed admin statistics');
  const {overview:o,thisMonth:m,templateBreakdown:t,daily:d,recentUsers:u,recentGenerations:g,dataQuality:q}=value;
  if(!object(o,['totalUsers','proUsers','freeUsers','mrr','conversionRate','totalGenerations'])||![o.totalUsers,o.proUsers,o.freeUsers,o.totalGenerations].every(count)
    ||!finite(o.mrr)||!finite(o.conversionRate)||o.conversionRate>100||Number(o.proUsers)+Number(o.freeUsers)!==o.totalUsers
    ||!object(m,['newUsers','newUsersLastMonth','generations','generationsLastMonth'])||!Object.values(m).every(count))throw Error('Unconfirmed admin statistics');
  if(!Array.isArray(t)||t.length>1000||!t.every(x=>object(x,['template','count'])&&text(x.template,128)&&count(x.count))||new Set(t.map(x=>x.template)).size!==t.length
    ||!Array.isArray(d)||d.length!==7||!d.every(x=>object(x,['date','count'])&&typeof x.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&iso(x.date+'T00:00:00.000Z')&&count(x.count))
    ||d.some((x,n)=>n>0&&Date.parse(x.date)-Date.parse(d[n-1].date)!==86400000))throw Error('Unconfirmed admin statistics');
  if(!Array.isArray(u)||u.length>10||!u.every(x=>object(x,['id','email','name','createdAt','isPro','plan','generationCount'])&&id(x.id)&&email(x.email)&&(x.name===null||typeof x.name==='string'&&x.name.length<=300)&&iso(x.createdAt)&&typeof x.isPro==='boolean'&&text(x.plan,32)&&count(x.generationCount))||new Set(u.map(x=>x.id)).size!==u.length
    ||!Array.isArray(g)||g.length>10||!g.every(x=>object(x,['id','template','createdAt','tokensUsed','userEmail'])&&id(x.id)&&text(x.template,128)&&iso(x.createdAt)&&(x.tokensUsed===null||count(x.tokensUsed)&&x.tokensUsed>0)&&email(x.userEmail))||new Set(g.map(x=>x.id)).size!==g.length
    ||!object(q,['source','freshness','mrr','billingReconciliation'])||q.source!=='stored-admin-aggregates'||q.freshness!=='unconfirmed'||q.mrr!=='fixed-price-estimate'||q.billingReconciliation!=='not-assessed')throw Error('Unconfirmed admin statistics');
  // JSON input was parsed locally; keep only this immutable snapshot, never a
  // caller's object or a later mutable row. Dates/quality are not renewed here.
  return frozen({overview:o,thisMonth:m,templateBreakdown:t,daily:d,recentUsers:u,recentGenerations:g,dataQuality:q} as AdminData);
}
// Public session metadata and current() can only deny a display. Authentication
// stays at the native server purpose. No DTO, decoder or caller-selected fetch
// can originate a private display permit.
export function beginAdminStatsRead(owner:AdminStatsOwner,current:()=>boolean,onRetire:()=>void) {
  const own={},captured=Object.freeze({...owner}),startedAt=Date.now(),deadline=performance.now()+25000,controller=new AbortController();
  let readRef='',retired=false,expiresAt=Math.min(startedAt+25000,captured.expiresAt),timer:ReturnType<typeof setTimeout>|undefined,rejectStop!:(e:Error)=>void;
  const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(retired)return;retired=true;controller.abort();clearTimeout(timer);rejectStop(Error('Unconfirmed admin statistics'));onRetire();};
  const check=()=>{if(retired||!current()||controller.signal.aborted||Date.now()<startedAt||Date.now()>=expiresAt||performance.now()>=deadline){retire();throw Error('Unconfirmed admin statistics');}};
  const wait=async<T>(fn:()=>Promise<T>)=>{check();const pending=Promise.resolve().then(()=>{check();return fn();});void pending.catch(()=>{});const result=await Promise.race([pending,stopped]);check();return result;};
  timer=setTimeout(retire,Math.max(0,expiresAt-startedAt));
  const original=(async()=>{try{
    readRef=crypto.randomUUID();
    if(!id(captured.id)||!email(captured.email)||!Number.isSafeInteger(captured.expiresAt)||!uuid(readRef))throw Error('Unconfirmed admin statistics');
    const response=await wait(()=>fetch('/api/admin/stats',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-YTV-Read-Ref':readRef},signal:controller.signal}));
    if(response.status!==200||!response.ok||response.redirected||response.headers.get('cache-control')!=='no-store')throw Error('Unconfirmed admin statistics');
    const body=await wait(()=>response.text());if(body.length>1024*1024)throw Error('Unconfirmed admin statistics');
    const parsed:unknown=JSON.parse(body);check();if(!object(parsed,['overview','thisMonth','templateBreakdown','daily','recentUsers','recentGenerations','dataQuality','adminStatsRead']))throw Error('Unconfirmed admin statistics');
    const receipt=parsed.adminStatsRead;
    if(!object(receipt,['readRef','userId','email','asOf','expiresAt'])||receipt.readRef!==readRef||receipt.userId!==captured.id||receipt.email!==captured.email
      ||!count(receipt.asOf)||receipt.asOf<startedAt||receipt.asOf>Date.now()||!count(receipt.expiresAt)||receipt.expiresAt<=receipt.asOf||receipt.expiresAt-receipt.asOf>25000)throw Error('Unconfirmed admin statistics');
    expiresAt=Math.min(expiresAt,receipt.expiresAt);check();clearTimeout(timer);timer=setTimeout(retire,Math.max(0,expiresAt-Date.now()));
    const data=decode(parsed);check();const result=Object.freeze({}) as AdminStatsDisplay;displays.set(result,{owner:own,data});return result;
  }catch{retire();throw Error('Unconfirmed admin statistics');}})();void original.catch(()=>{});
  return Object.freeze({original,retire,display(result:AdminStatsDisplay|null|undefined):AdminData|null{try{check();const entry=result&&displays.get(result);return entry?.owner===own?entry.data:null;}catch{return null;}}});
}
