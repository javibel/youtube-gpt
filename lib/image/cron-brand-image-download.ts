// A provider reference is data from the still-live native task,never recovery.
// This bounded downloader has no model,provider key,Blob or publication access.
export function prepareCronBrandImageDownload(){
 const declaration=process.env.BRAND_IMAGE_DOWNLOAD_HOSTS;
 const hosts=(declaration??'').split(',').map(v=>v.trim().toLowerCase());
 if(!declaration||hosts.length>16||hosts.some(h=>h.length>253||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/.test(h)||/\.(?:local|internal|localhost)$/.test(h)))throw Error('daily_brand_image_unconfirmed');
 const check=()=>{if(process.env.BRAND_IMAGE_DOWNLOAD_HOSTS!==declaration)throw Error('daily_brand_image_unconfirmed');};
 const download=async(urlText:string,remaining:()=>number,validate:()=>Promise<void>):Promise<Buffer>=>{
  const config=()=>{check();remaining();};config();
  const url=new URL(urlText);if(urlText.length>4096||url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!hosts.includes(url.hostname))throw Error('daily_brand_image_unconfirmed');
  await validate();config();const controller=new AbortController();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,body:ReadableStream<Uint8Array>|null|undefined,rejectWait:(e:Error)=>void=()=>{},retired=false;
  const stop=()=>{retired=true;controller.abort();rejectWait(Error('daily_brand_image_unconfirmed'));},interruption=new Promise<never>((_,reject)=>{rejectWait=reject;});void interruption.catch(()=>{});const timer=setTimeout(stop,Math.min(30000,remaining()));
  try{return await Promise.race([(async()=>{
   const response=await fetch(url.href,{signal:controller.signal,redirect:'error',cache:'no-store'});body=response.body;if(retired){void body?.cancel().catch(()=>{});throw Error('daily_brand_image_unconfirmed');}config();if(!response.ok||response.redirected||!response.body||!['image/png','image/jpeg','image/webp'].includes(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()??''))throw Error('daily_brand_image_unconfirmed');
   const declared=response.headers.get('content-length'),limit=15*1024*1024;if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)<1||Number(declared)>limit))throw Error('daily_brand_image_unconfirmed');
   reader=response.body.getReader();const parts:Buffer[]=[];let size=0;for(;;){const part=await reader.read();config();if(retired)throw Error('daily_brand_image_unconfirmed');if(part.done)break;size+=part.value.byteLength;if(size>limit)throw Error('daily_brand_image_unconfirmed');parts.push(Buffer.from(part.value));}if(!size||declared!==null&&Number(declared)!==size)throw Error('daily_brand_image_unconfirmed');await validate();config();return Buffer.concat(parts,size);
  })(),interruption]);}finally{clearTimeout(timer);controller.abort();void(reader?reader.cancel():body?.cancel())?.catch(()=>{});}
 };
 return Object.freeze({download,check});
}
