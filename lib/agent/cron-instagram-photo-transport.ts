import { createHmac } from 'node:crypto';

type Input=Readonly<{date:string;caption:string;imageUrl:string}>;
type Ack=Readonly<{containerId:string;postId:string}>;
const unconfirmed=()=>Error('social_publish_unconfirmed');

// Transport only: no DTO, saved container or post ID can start/resume a chain.
// The caller separately owns source/image/day/SQL and its live native purpose.
export function prepareCronInstagramPhotoTransport(context:{signal:AbortSignal;remaining:()=>number;validate:()=>Promise<void>}){
 const account=process.env.INSTAGRAM_ACCOUNT_ID,token=process.env.INSTAGRAM_ACCESS_TOKEN,version=process.env.INSTAGRAM_GRAPH_API_VERSION,secret=process.env.META_APP_SECRET,blobToken=process.env.BLOB_READ_WRITE_TOKEN;
 const store=blobToken?.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_[a-zA-Z0-9]+$/)?.[1];
 if(!account||!/^\d{1,32}$/.test(account)||!token||token.length>4096||/[\x00-\x20\x7f]/.test(token)||!version||!/^v[1-9]\d{0,2}\.0$/.test(version)||!store
   ||secret!==undefined&&(!secret||secret.length>4096||/[\x00-\x20\x7f]/.test(secret))||!context||!(context.signal instanceof AbortSignal)||typeof context.remaining!=='function'||typeof context.validate!=='function')throw unconfirmed();
 const {signal,remaining,validate}=context;
 const check=()=>{if(signal.aborted||process.env.INSTAGRAM_ACCOUNT_ID!==account||process.env.INSTAGRAM_ACCESS_TOKEN!==token||process.env.INSTAGRAM_GRAPH_API_VERSION!==version||process.env.META_APP_SECRET!==secret||process.env.BLOB_READ_WRITE_TOKEN!==blobToken)throw unconfirmed();const time=remaining();if(!Number.isFinite(time)||time<1)throw unconfirmed();return Math.floor(time);};
 check();
 const credentials={access_token:token,...(secret?{appsecret_proof:createHmac('sha256',secret).update(token).digest('hex')}:{})},base=`https://graph.instagram.com/${version}`;
 const json=async(url:string,method:'GET'|'POST',payload?:object):Promise<Record<string,unknown>>=>{
  await validate();const budget=Math.min(30000,check()),controller=new AbortController();let retired=false,body:ReadableStream<Uint8Array>|null|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,rejectWait:(error:Error)=>void=()=>{};
  const interruption=new Promise<never>((_,reject)=>{rejectWait=reject;});void interruption.catch(()=>{});
  const stop=()=>{retired=true;controller.abort();rejectWait(unconfirmed());};signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();const timer=setTimeout(stop,budget);
  const live=()=>{check();if(retired)throw unconfirmed();};
  try{return await Promise.race([(async()=>{
   live();const response=await fetch(url,{method,redirect:'error',cache:'no-store',signal:controller.signal,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,...credentials})}:{})});body=response.body;
   if(retired){void body?.cancel().catch(()=>{});throw unconfirmed();}live();
   if(!response.ok||response.redirected||!body||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw unconfirmed();
   const declared=response.headers.get('content-length'),limit=64*1024;if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)<1||Number(declared)>limit))throw unconfirmed();
   reader=body.getReader();const parts:Buffer[]=[];let size=0;for(;;){const part=await reader.read();live();if(part.done)break;size+=part.value.byteLength;if(size>limit)throw unconfirmed();parts.push(Buffer.from(part.value));}
   if(!size||declared!==null&&Number(declared)!==size)throw unconfirmed();const ack:unknown=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   if(!ack||typeof ack!=='object'||Array.isArray(ack)||'error'in ack)throw unconfirmed();await validate();live();return ack as Record<string,unknown>;
  })(),interruption]);}finally{clearTimeout(timer);signal.removeEventListener('abort',stop);controller.abort();void(reader?reader.cancel():body?.cancel())?.catch(()=>{});}
 };
 const wait=async()=>{
  await validate();if(check()<=5000)throw unconfirmed();
  await new Promise<void>((resolve,reject)=>{let timer:ReturnType<typeof setTimeout>;const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);reject(unconfirmed());};signal.addEventListener('abort',stop,{once:true});timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},5000);if(signal.aborted)stop();});
  check();await validate();check();
 };
 let own:{input:Input;promise:Promise<Ack>}|undefined;
 const publish=(input:Input):Promise<Ack>=>{
  if(own)return input?.date===own.input.date&&input?.caption===own.input.caption&&input?.imageUrl===own.input.imageUrl?own.promise:Promise.reject(unconfirmed());
  const snapshot=Object.freeze({date:input?.date,caption:input?.caption,imageUrl:input?.imageUrl});
  const promise=Promise.resolve().then(async()=>{
   check();if(typeof snapshot.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)||new Date(snapshot.date+'T00:00:00Z').toISOString().slice(0,10)!==snapshot.date||typeof snapshot.caption!=='string'||!snapshot.caption.trim()||snapshot.caption.length>20000||typeof snapshot.imageUrl!=='string')throw unconfirmed();
   const prefix=`https://${store.toLowerCase()}.public.blob.vercel-storage.com/social-cron/${snapshot.date}/`;if(!snapshot.imageUrl.startsWith(prefix)||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.jpg$/.test(snapshot.imageUrl.slice(prefix.length)))throw unconfirmed();
   const container=await json(`${base}/${account}/media`,'POST',{image_url:snapshot.imageUrl,caption:Array.from(snapshot.caption).slice(0,2200).join('')});
   if(Object.keys(container).join(',')!=='id'||typeof container.id!=='string'||!/^\d{1,32}$/.test(container.id))throw unconfirmed();const containerId=container.id;
   for(let read=0;read<10;read++){
    const status=await json(`${base}/${containerId}?`+new URLSearchParams({fields:'status_code',...credentials}),'GET');
    if(Object.keys(status).sort().join(',')!=='id,status_code'||status.id!==containerId)throw unconfirmed();
    if(status.status_code==='FINISHED')break;
    if(status.status_code!=='IN_PROGRESS'||read===9)throw unconfirmed();await wait();
   }
   // Only FINISHED observed in this exact chain reaches media_publish.
   const result=await json(`${base}/${account}/media_publish`,'POST',{creation_id:containerId});
   if(Object.keys(result).join(',')!=='id'||typeof result.id!=='string'||!/^\d{1,32}$/.test(result.id))throw unconfirmed();check();await validate();check();return Object.freeze({containerId,postId:result.id});
  }).catch(()=>{throw unconfirmed();});own={input:snapshot,promise};return promise;
 };
 return Object.freeze({accountId:account,check,publish});
}
