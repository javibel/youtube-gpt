'use strict';
const {performance}=require('node:perf_hooks');
// Trusted composition injects this original transport,hosts and credential.
// No SDK,global credential lookup,retry,redirect or pricing default.
function createIdeogramHttp({apiKey,downloadHosts,fetch:request}={}){
 if(typeof apiKey!=='string'||!apiKey||/[\x00-\x20\x7f]/.test(apiKey)||typeof request!=='function'||!Array.isArray(downloadHosts)||!downloadHosts.length||downloadHosts.length>16||downloadHosts.some(h=>typeof h!=='string'||h.length>253||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/.test(h)||/\.(?:local|internal|localhost)$/.test(h)))throw Error('Explicit image transport configuration required');
 const hosts=Object.freeze([...downloadHosts]);
 const retirement=new AbortController(),pending=new Set();let retired=false,originalStop;
 const stopDescriptor=Object.getOwnPropertyDescriptor(request,'stop');
 const nativeStop=stopDescriptor&&Object.hasOwn(stopDescriptor,'value')&&typeof stopDescriptor.value==='function'?stopDescriptor.value.bind(request):null;
 const observe=promise=>{pending.add(promise);void promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise;};
 function stop(options){
  if(originalStop)return originalStop;
  const bound=options&&Object.getOwnPropertyDescriptor(options,'timeoutMs');
  if(!bound||!Object.hasOwn(bound,'value')||Reflect.ownKeys(options).length!==1||!Number.isSafeInteger(bound.value)||bound.value<1||bound.value>30000)throw Error('Invalid image stop bound');
  retired=true;const deadline=performance.now()+bound.value;let timer,finish;
  originalStop=new Promise(resolve=>{finish=resolve;});
  // Seal the original native owner before aborting consumer waiters. Neither a
  // settled fetch promise nor reader.cancel is a native close acknowledgement.
  const native=Promise.resolve().then(()=>nativeStop?nativeStop({timeoutMs:Math.max(1,Math.floor(deadline-performance.now()))}):null);
  retirement.abort();
  const drain=async()=>{const result=await native;while(pending.size)await Promise.allSettled([...pending]);return result;};
  void Promise.race([drain(),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),bound.value);})]).then(result=>{
   clearTimeout(timer);const drained=!!nativeStop&&result?.drained===true&&result.uncertain===false&&pending.size===0&&performance.now()<=deadline;
   finish(Object.freeze({drained,closed:drained,uncertain:!drained,pending:pending.size,native:result,accepting:false,restartAllowed:false}));
  },()=>{clearTimeout(timer);finish(Object.freeze({drained:false,closed:false,uncertain:true,pending:pending.size,accepting:false,restartAllowed:false}));});
  return originalStop;
 }
 return Object.freeze({stop,async create(payload,{signal,timeout,maxRetries}={}){
  if(retired||!Number.isInteger(timeout)||timeout<1||timeout>30000||maxRetries!==0||signal?.aborted)throw Error('Invalid image request bound');
  signal=signal?AbortSignal.any([signal,retirement.signal]):retirement.signal;
  const controller=new AbortController();let timer,rejectWait,reader,response,interruptedFlag=false;
  const stop=()=>{interruptedFlag=true;controller.abort();rejectWait(Error('Image transport unconfirmed'));};const interruption=new Promise((_,reject)=>{rejectWait=reject;});void interruption.catch(()=>{});
  signal?.addEventListener('abort',stop,{once:true});timer=setTimeout(stop,timeout);
  try{return await Promise.race([observe((async()=>{
   const form=new FormData();for(const[key,value]of Object.entries(payload)){if(typeof value!=='string')throw Error('Invalid image payload');form.append(key,value);}
   response=await request('https://api.ideogram.ai/v1/ideogram-v3/generate',{method:'POST',headers:{'Api-Key':apiKey},body:form,signal:controller.signal,redirect:'error',cache:'no-store'});
   if(interruptedFlag){if(response.body)observe(Promise.resolve().then(()=>response.body.cancel()));throw Error('Late image response');}
   if(!response.ok||response.redirected||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!response.body)throw Error('Image HTTP unconfirmed');
   const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)<1||Number(declared)>65536))throw Error('Image response too large');
   reader=response.body.getReader();const parts=[];let size=0;for(;;){const part=await reader.read();if(interruptedFlag)throw Error('Image response interruptedFlag');if(part.done)break;size+=part.value.byteLength;if(size>65536)throw Error('Image response too large');parts.push(part.value);}if(!size||declared!==null&&size!==Number(declared))throw Error('Image response incomplete');
   const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}const data=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(data?.data)||data.data.length!==1||typeof data.data[0]?.url!=='string'||data.data[0].url.length>4096)throw Error('Image ACK invalid');
   const url=new URL(data.data[0].url);if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!hosts.includes(url.hostname))throw Error('Image ACK host rejected');return {kind:'brand-image-reference-v1',url:url.href};
  })()),interruption]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();if(reader||response?.body)observe(Promise.resolve().then(()=>reader?reader.cancel():response.body.cancel()));}
 }});
}
module.exports={createIdeogramHttp};
