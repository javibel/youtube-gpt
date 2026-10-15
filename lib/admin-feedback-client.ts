export type AdminFeedbackItem = Readonly<{id:string;userId:string;token:string;lang:string;rating:number|null;comment:string|null;submittedAt:string;createdAt:string;user:Readonly<{email:string;name:string|null}>}>;
export type AdminFeedbackData = Readonly<{feedbacks:readonly AdminFeedbackItem[];pending:number;dataQuality:Readonly<{source:'stored-feedback';window:'latest-50-submitted';freshness:'unconfirmed';consistency:'separate-reads'}>}>;
export type AdminFeedbackOwner = Readonly<{id:string;email:string;expiresAt:number}>;
declare const feedbackDisplayBrand: unique symbol;
export type AdminFeedbackDisplay = { readonly [feedbackDisplayBrand]: true };
const displays=new WeakMap<object,{owner:object;data:AdminFeedbackData}>();
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const email=(v:unknown):v is string=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const iso=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
function object(value:unknown,keys:string[]):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
function frozen<T>(value:T):T{if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;}
function decode(value:unknown):AdminFeedbackData{
  if(!object(value,['feedbacks','pending','dataQuality','adminFeedbackRead'])||!Array.isArray(value.feedbacks)||value.feedbacks.length>50||!count(value.pending))throw Error('Unconfirmed admin feedback');
  const rows=value.feedbacks,quality=value.dataQuality;
  if(!object(quality,['source','window','freshness','consistency'])||quality.source!=='stored-feedback'||quality.window!=='latest-50-submitted'||quality.freshness!=='unconfirmed'||quality.consistency!=='separate-reads'
    ||!rows.every(row=>object(row,['id','userId','token','lang','rating','comment','submittedAt','createdAt','user'])&&id(row.id)&&id(row.userId)
      &&typeof row.token==='string'&&row.token.length>0&&typeof row.lang==='string'&&row.lang.length>0
      &&(row.rating===null||(typeof row.rating==='number'&&Number.isInteger(row.rating)&&row.rating>=1&&row.rating<=5))
      &&(row.comment===null||typeof row.comment==='string')&&iso(row.submittedAt)&&iso(row.createdAt)
      &&object(row.user,['email','name'])&&email(row.user.email)&&(row.user.name===null||typeof row.user.name==='string'))
    ||new Set(rows.map(row=>row.id)).size!==rows.length||rows.some((row,n)=>n>0&&Date.parse(row.submittedAt)>Date.parse(rows[n-1].submittedAt)))throw Error('Unconfirmed admin feedback');
  // Keep the submitted window and the separate pending count distinct. Neither
  // this snapshot nor its native correlation receipt asserts operative freshness.
  const data:AdminFeedbackData={feedbacks:rows,pending:value.pending,dataQuality:{source:quality.source,window:quality.window,freshness:quality.freshness,consistency:quality.consistency}};
  return frozen(data);
}
// Public session metadata and current() can only deny a display. Authentication
// stays at the native server purpose. No DTO, decoder or caller-selected fetch
// can originate a private display permit.
export function beginAdminFeedbackRead(owner:AdminFeedbackOwner,current:()=>boolean,onRetire:()=>void) {
  const own={},captured=Object.freeze({...owner}),startedAt=Date.now(),deadline=performance.now()+25000,controller=new AbortController();
  let readRef='',retired=false,expiresAt=Math.min(startedAt+25000,captured.expiresAt),timer:ReturnType<typeof setTimeout>|undefined,rejectStop!:(e:Error)=>void;
  const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(retired)return;retired=true;controller.abort();clearTimeout(timer);rejectStop(Error('Unconfirmed admin feedback'));onRetire();};
  const check=()=>{if(retired||!current()||controller.signal.aborted||Date.now()<startedAt||Date.now()>=expiresAt||performance.now()>=deadline){retire();throw Error('Unconfirmed admin feedback');}};
  const wait=async<T>(fn:()=>Promise<T>)=>{check();const pending=Promise.resolve().then(()=>{check();return fn();});void pending.catch(()=>{});const result=await Promise.race([pending,stopped]);check();return result;};
  timer=setTimeout(retire,Math.max(0,expiresAt-startedAt));
  const original=(async()=>{try{
    readRef=crypto.randomUUID();
    if(!id(captured.id)||!email(captured.email)||!Number.isSafeInteger(captured.expiresAt)||!uuid(readRef))throw Error('Unconfirmed admin feedback');
    const response=await wait(()=>fetch('/api/admin/feedback',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-YTV-Read-Ref':readRef},signal:controller.signal}));
    if(response.status!==200||!response.ok||response.redirected||response.headers.get('cache-control')!=='no-store')throw Error('Unconfirmed admin feedback');
    const body=await wait(()=>response.text());if(body.length>4*1024*1024)throw Error('Unconfirmed admin feedback');
    const parsed:unknown=JSON.parse(body);check();if(!object(parsed,['feedbacks','pending','dataQuality','adminFeedbackRead']))throw Error('Unconfirmed admin feedback');
    const receipt=parsed.adminFeedbackRead;
    if(!object(receipt,['readRef','userId','email','asOf','expiresAt'])||receipt.readRef!==readRef||receipt.userId!==captured.id||receipt.email!==captured.email
      ||!count(receipt.asOf)||receipt.asOf<startedAt||receipt.asOf>Date.now()||!count(receipt.expiresAt)||receipt.expiresAt<=receipt.asOf||receipt.expiresAt-receipt.asOf>25000)throw Error('Unconfirmed admin feedback');
    expiresAt=Math.min(expiresAt,receipt.expiresAt);check();clearTimeout(timer);timer=setTimeout(retire,Math.max(0,expiresAt-Date.now()));
    const data=decode(parsed);check();const result=Object.freeze({}) as AdminFeedbackDisplay;displays.set(result,{owner:own,data});return result;
  }catch{retire();throw Error('Unconfirmed admin feedback');}})();void original.catch(()=>{});
  return Object.freeze({original,retire,display(result:AdminFeedbackDisplay|null|undefined):AdminFeedbackData|null{try{check();const entry=result&&displays.get(result);return entry?.owner===own?entry.data:null;}catch{return null;}}});
}
