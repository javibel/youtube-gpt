// Bounds browser waiting and decoded bytes; abort never proves provider cancellation.
export async function fetchRemovalPhoto(file:File,signal:AbortSignal):Promise<Blob> {
 if(signal.aborted)throw Error('Removal unconfirmed');
 const limit=10*1024*1024;
 let stopped=false,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,body:ReadableStream<Uint8Array>|null=null;
 let rejectWait:(error:Error)=>void=()=>{};
 const interrupted=new Promise<never>((_,reject)=>{rejectWait=reject;});
 void interrupted.catch(()=>{});
 const stop=()=>{stopped=true;rejectWait(Error('Removal unconfirmed'));};
 const cancel=()=>{try{if(reader)void reader.cancel().catch(()=>{});else void body?.cancel().catch(()=>{});}catch{/* Best effort local cleanup only. */}};
 signal.addEventListener('abort',stop,{once:true});
 try{
  const work=(async()=>{
   const form=new FormData();form.append('file',file,'photo.png');
   const response=await fetch('/api/remove-bg',{method:'POST',body:form,signal,redirect:'error',cache:'no-store'});
   body=response.body;
   if(stopped||signal.aborted){cancel();throw Error('Removal unconfirmed');}
   if(!response.ok||response.redirected||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='image/png'||!body)throw Error('Removal unconfirmed');
   const declared=response.headers.get('content-length');
   if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)<1||Number(declared)>limit))throw Error('Removal unconfirmed');
   reader=body.getReader();const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
   for(;;){
    const part=await reader.read();if(stopped||signal.aborted)throw Error('Removal unconfirmed');if(part.done)break;
    if(!(part.value instanceof Uint8Array))throw Error('Removal unconfirmed');
    size+=part.value.byteLength;if(size>limit)throw Error('Removal unconfirmed');
    // Copy the bounded bytes so a producer cannot change a retained chunk.
    chunks.push(new Uint8Array(part.value));
   }
   const encoding=response.headers.get('content-encoding');
   if(!size||(declared!==null&&(!encoding||encoding.trim().toLowerCase()==='identity')&&Number(declared)!==size))throw Error('Removal unconfirmed');
   return new Blob(chunks,{type:'image/png'});
  })();
  return await Promise.race([work,interrupted]);
 }finally{stopped=true;signal.removeEventListener('abort',stop);cancel();}
}
