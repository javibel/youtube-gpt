// Bounds decoded JSON, independent of declared/wire length. Caller abort only
// releases local waiting; it never proves cancellation of a remote image task.
export async function fetchThumbnailBackground(body:FormData,signal:AbortSignal,key?:string,readOnly=false):Promise<{response:Response;data:Record<string,unknown>}> {
 if(signal.aborted)throw Error('Background unconfirmed');
 const limit=64*1024;
 let stopped=false,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,stream:ReadableStream<Uint8Array>|null=null;
 let rejectWait:(error:Error)=>void=()=>{};
 const interrupted=new Promise<never>((_,reject)=>{rejectWait=reject;});void interrupted.catch(()=>{});
 const stop=()=>{stopped=true;rejectWait(Error('Background unconfirmed'));};
 const cancel=()=>{try{if(reader)void reader.cancel().catch(()=>{});else void stream?.cancel().catch(()=>{});}catch{/* Local best effort; never wait for stalled cleanup. */}};
 signal.addEventListener('abort',stop,{once:true});
 try{
  const work=(async()=>{
   const response=await fetch('/api/thumbnail-background',{method:'POST',body,signal,redirect:'error',cache:'no-store',...(key?{headers:{'Idempotency-Key':key,...(readOnly?{'X-Background-Recovery':'retained-only-v1'}:{})}}:{})});
   stream=response.body;
   if(stopped||signal.aborted){cancel();throw Error('Background unconfirmed');}
   if(response.redirected||response.status===206||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!stream)throw Error('Background unconfirmed');
   const declared=response.headers.get('content-length');
   if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)<1||Number(declared)>limit))throw Error('Background unconfirmed');
   reader=stream.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
   for(;;){const part=await reader.read();if(stopped||signal.aborted)throw Error('Background unconfirmed');if(part.done)break;
    if(!(part.value instanceof Uint8Array)||!part.value.byteLength)throw Error('Background unconfirmed');
    size+=part.value.byteLength;if(size>limit)throw Error('Background unconfirmed');
    text+=decoder.decode(part.value,{stream:true});
   }
   text+=decoder.decode();const encoding=response.headers.get('content-encoding');
   if(!size||(declared!==null&&(!encoding||encoding.trim().toLowerCase()==='identity')&&Number(declared)!==size))throw Error('Background unconfirmed');
   const data:unknown=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Background unconfirmed');
   return{response,data:data as Record<string,unknown>};
  })();
  return await Promise.race([work,interrupted]);
 }finally{stopped=true;signal.removeEventListener('abort',stop);cancel();}
}
