// Installed Blob protocol12;one native PUT,no SDK retry,lookup or overwrite.
// This transport receives bytes only from its private live native producer.
export function prepareCronBrandImageUpload(){
 const token=process.env.BLOB_READ_WRITE_TOKEN,store=token?.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_[a-zA-Z0-9]+$/)?.[1];
 if(!token||!store)throw Error('daily_brand_image_unconfirmed');
 const check=()=>{if(process.env.BLOB_READ_WRITE_TOKEN!==token)throw Error('daily_brand_image_unconfirmed');};
 const upload=async(bytes:Buffer,date:string,id:string,remaining:()=>number,validate:()=>Promise<void>)=>{
  const config=()=>{check();remaining();};config();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)||bytes.length<4||bytes.length>5*1024*1024||bytes.readUInt16BE(0)!==0xffd8||bytes.readUInt16BE(bytes.length-2)!==0xffd9)throw Error('daily_brand_image_unconfirmed');
  const pathname=`social-cron/${date}/${id}.jpg`,url=`https://${store.toLowerCase()}.public.blob.vercel-storage.com/${pathname}`;
  await validate();config();const controller=new AbortController();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,body:ReadableStream<Uint8Array>|null|undefined,rejectWait:(e:Error)=>void=()=>{},retired=false;
  const interruption=new Promise<never>((_,reject)=>{rejectWait=reject;});void interruption.catch(()=>{});
  const timer=setTimeout(()=>{retired=true;controller.abort();rejectWait(Error('daily_brand_image_unconfirmed'));},Math.min(30000,remaining()));
  try{return await Promise.race([(async()=>{
   const response=await fetch('https://vercel.com/api/blob/?'+new URLSearchParams({pathname}),{method:'PUT',redirect:'error',cache:'no-store',signal:controller.signal,headers:{authorization:'Bearer '+token,'x-vercel-blob-store-id':store,'x-api-version':'12','x-api-blob-request-id':`${store}:${id}`,'x-api-blob-request-attempt':'0','x-vercel-blob-access':'public','x-add-random-suffix':'0','x-allow-overwrite':'0','x-content-type':'image/jpeg','x-content-length':String(bytes.length)},body:Uint8Array.from(bytes)});
   body=response.body;if(retired){void body?.cancel().catch(()=>{});throw Error('daily_brand_image_unconfirmed');}config();
   if(!response.ok||response.redirected||!body||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('daily_brand_image_unconfirmed');
   const declared=response.headers.get('content-length'),limit=64*1024;if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)<1||Number(declared)>limit))throw Error('daily_brand_image_unconfirmed');
   reader=body.getReader();const parts:Buffer[]=[];let size=0;for(;;){const part=await reader.read();config();if(retired)throw Error('daily_brand_image_unconfirmed');if(part.done)break;size+=part.value.byteLength;if(size>limit)throw Error('daily_brand_image_unconfirmed');parts.push(Buffer.from(part.value));}if(!size||declared!==null&&Number(declared)!==size)throw Error('daily_brand_image_unconfirmed');
   const result:unknown=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   if(!result||typeof result!=='object'||!('url'in result)||result.url!==url||!('pathname'in result)||result.pathname!==pathname||!('contentType'in result)||result.contentType!=='image/jpeg')throw Error('daily_brand_image_unconfirmed');
   await validate();config();return Object.freeze({url,pathname,contentType:'image/jpeg' as const});
  })(),interruption]);}finally{clearTimeout(timer);controller.abort();void(reader?reader.cancel():body?.cancel())?.catch(()=>{});}
 };
 return Object.freeze({upload,check});
}
