'use strict';
// Trusted composition injects this original transport,hosts and credential.
// No SDK,global credential lookup,retry,redirect or pricing default.
function createIdeogramHttp({apiKey,downloadHosts,fetch:request}={}){
 if(typeof apiKey!=='string'||!apiKey||/[\x00-\x20\x7f]/.test(apiKey)||typeof request!=='function'||!Array.isArray(downloadHosts)||!downloadHosts.length||downloadHosts.length>16||downloadHosts.some(h=>typeof h!=='string'||h.length>253||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/.test(h)||/\.(?:local|internal|localhost)$/.test(h)))throw Error('Explicit image transport configuration required');
 const hosts=Object.freeze([...downloadHosts]);
 return Object.freeze({async create(payload,{signal,timeout,maxRetries}={}){
  if(!Number.isInteger(timeout)||timeout<1||timeout>30000||maxRetries!==0||signal?.aborted)throw Error('Invalid image request bound');
  const controller=new AbortController();let timer,rejectWait,reader,response,retired=false;
  const stop=()=>{retired=true;controller.abort();rejectWait(Error('Image transport unconfirmed'));};const interruption=new Promise((_,reject)=>{rejectWait=reject;});void interruption.catch(()=>{});
  signal?.addEventListener('abort',stop,{once:true});timer=setTimeout(stop,timeout);
  try{return await Promise.race([(async()=>{
   const form=new FormData();for(const[key,value]of Object.entries(payload)){if(typeof value!=='string')throw Error('Invalid image payload');form.append(key,value);}
   response=await request('https://api.ideogram.ai/v1/ideogram-v3/generate',{method:'POST',headers:{'Api-Key':apiKey},body:form,signal:controller.signal,redirect:'error',cache:'no-store'});
   if(retired){void response.body?.cancel().catch(()=>{});throw Error('Late image response');}
   if(!response.ok||response.redirected||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!response.body)throw Error('Image HTTP unconfirmed');
   const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)<1||Number(declared)>65536))throw Error('Image response too large');
   reader=response.body.getReader();const parts=[];let size=0;for(;;){const part=await reader.read();if(retired)throw Error('Image response retired');if(part.done)break;size+=part.value.byteLength;if(size>65536)throw Error('Image response too large');parts.push(part.value);}if(!size||declared!==null&&size!==Number(declared))throw Error('Image response incomplete');
   const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}const data=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(data?.data)||data.data.length!==1||typeof data.data[0]?.url!=='string'||data.data[0].url.length>4096)throw Error('Image ACK invalid');
   const url=new URL(data.data[0].url);if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!hosts.includes(url.hostname))throw Error('Image ACK host rejected');return {kind:'brand-image-reference-v1',url:url.href};
  })(),interruption]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();void(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}
 }});
}
module.exports={createIdeogramHttp};
