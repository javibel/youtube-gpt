'use strict';
const {createHash}=require('node:crypto');
// Same Web Request/Response handlers are used by Next routes and isolated E2E.
function createObserverHttpHandlers({getService,requireAdmin}){
 const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 const safeCodes=new Set(['configuration','permissions','credentials','deadline','cancelled','uncertain','concurrency','native_platform_configuration','native_platform_permissions','native_platform_credentials','native_platform_cancelled','native_platform_deadline','native_platform_observer_signing','23505','42501','57014','42P01']);
 const report=(stage,action,code)=>{try{console.warn(JSON.stringify({event:'ytv-observer-channel-unconfirmed-v1',stage,action:['admin','claim','result'].includes(action)?action:'unknown',code:code==='unavailable'||safeCodes.has(code)?code:'unclassified'}));}catch{}};

 return async function handle(request,action){
  const controller=new AbortController(),signal=AbortSignal.any([request.signal,controller.signal]);let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('deadline'));},30000);});void timeout.catch(()=>{});
  const wait=p=>Promise.race([Promise.resolve(p),timeout]);
  try{
   let actor;
   if(action==='admin'){
    const gate=await wait(requireAdmin());if(!gate.ok)return gate.response;
    actor='admin_'+createHash('sha256').update(gate.email).digest('hex');
    if(request.method==='POST'&&(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site'))return json({code:'permissions'},403);
   }
   const service=getService();if(!service){report('channel-not-installed',action,'unavailable');return json({code:'unavailable'},503);}
   let body={};
   if(request.method==='POST'){
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({code:'invalid_format'},400);
    const reader=request.body?.getReader();if(!reader)return json({code:'invalid_format'},400);
    let bytes=0,text='',done=false;const decoder=new TextDecoder('utf-8',{fatal:true});
    try{while(true){const part=await wait(reader.read());if(part.done){done=true;break;}bytes+=part.value.length;if(bytes>70000)throw Error('format');text+=decoder.decode(part.value,{stream:true});}body=JSON.parse(text+decoder.decode());}
    finally{if(!done)void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}
    if(!body||typeof body!=='object'||Array.isArray(body))return json({code:'invalid_format'},400);
   }
   if(signal.aborted)throw Error('cancelled');
   if(action==='admin'){
    if(request.method==='GET')return json(await wait(service.status(new URL(request.url).searchParams.get('requestId'),{actor,signal})));
    if(request.method!=='POST')return json({code:'method'},405);
    if(body.action==='create'&&Object.keys(body).join()==='action')return json({requests:await wait(service.create({actor,signal}))},201);
    if(body.action==='cancel'&&Object.keys(body).sort().join()==='action,requestId')return json(await wait(service.cancel(body.requestId,{actor,signal})));
    return json({code:'invalid_format'},400);
   }
   if(request.method!=='POST')return json({code:'method'},405);
   const keys=action==='claim'?'proof,requestId':'proof,requestId,wire';
   if(Object.keys(body).sort().join()!==keys||typeof body.requestId!=='string'||typeof body.proof!=='string'||action==='result'&&typeof body.wire!=='string')return json({code:'invalid_format'},400);
   return json(action==='claim'?{wire:await wait(service.claim(body.requestId,body.proof,{signal}))}:await wait(service.result(body.requestId,body.wire,body.proof,{signal})));
  }catch(error){report('handler',action,error?.code);return json({code:error?.code==='permissions'?'permissions':'uncertain',state:'uncertain'},error?.code==='permissions'?403:503);}
  finally{clearTimeout(timer);controller.abort();}
 };
}
module.exports={createObserverHttpHandlers};
