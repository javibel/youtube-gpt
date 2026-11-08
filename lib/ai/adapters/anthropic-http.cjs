'use strict';
const {performance}=require('node:perf_hooks');
const endpoint='https://api.anthropic.com/v1/messages';
const fields=new Set(['model','max_tokens','messages','stream','system','tools','service_tier','inference_geo']);
const version=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const workspace=v=>v===undefined||typeof v==='string'&&/^wrkspc_[A-Za-z0-9]{1,120}$/.test(v);
function failure(status){const error=new Error('Bounded provider transport failed');if(status!==undefined)error.status=status;return error;}
function bounded(value){return Number.isSafeInteger(value)&&value>0&&value<=16*1024*1024;}
function cancelBody(body){try{Promise.resolve(body?.cancel()).catch(()=>{});}catch{/* Cleanup cannot establish remote cancellation. */}}

// Server composition supplies both capabilities explicitly. No ambient fetch,
// environment credential, model, tariff, automatic retry or startup is installed.
function createAnthropicHttpTransport(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['fetch','readCredential','credentialRef','apiVersion','workspaceId','maxRequestBytes','maxResponseBytes'].includes(k)))throw failure();
 const {fetch,readCredential,credentialRef,apiVersion,workspaceId,maxRequestBytes,maxResponseBytes}=options;
 if(!version(apiVersion)||!workspace(workspaceId)||typeof fetch!=='function'||typeof readCredential!=='function'||typeof credentialRef!=='string'||!credentialRef.trim()||!bounded(maxRequestBytes)||!bounded(maxResponseBytes))throw failure();
 return Object.freeze({async create(payload,options={}){
  if(!options||Object.keys(options).some(key=>!['signal','timeout','maxRetries'].includes(key))||options.maxRetries!==0||!Number.isSafeInteger(options.timeout)||options.timeout<1||options.timeout>2147483647)throw failure();
  const upstream=options.signal;
  if(upstream!==undefined&&(!(upstream instanceof AbortSignal)))throw failure();
  const deadline=performance.now()+options.timeout;
  let body;
  try{
   const copy=structuredClone(payload);
   if(!copy||typeof copy!=='object'||Array.isArray(copy)||Object.keys(copy).some(key=>!fields.has(key))||typeof copy.model!=='string'||!copy.model.trim()||!Array.isArray(copy.messages)||!copy.messages.length||!Number.isSafeInteger(copy.max_tokens)||copy.max_tokens<1||copy.stream!==false)throw failure();
   if(copy.service_tier!==undefined&&copy.service_tier!=='standard_only'||copy.inference_geo!==undefined&&copy.inference_geo!=='global')throw failure();
   body=JSON.stringify(copy);
   if(Buffer.byteLength(body,'utf8')>maxRequestBytes)throw failure();
  }catch{throw failure();}
  if(upstream?.aborted)throw failure();
  const controller=new AbortController();
  let reader,finished=false,rejectAbort;
  const cancelled=new Promise((_,reject)=>{rejectAbort=reject;});
  const onAbort=()=>{
   controller.abort();
   try{Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}
   rejectAbort(failure());
  };
  upstream?.addEventListener('abort',onAbort,{once:true});
  const timer=setTimeout(onAbort,Math.max(0,deadline-performance.now()));
  const check=()=>{if(controller.signal.aborted||upstream?.aborted||performance.now()>=deadline)throw failure();};
  const wait=promise=>Promise.race([promise,cancelled]);
  try{
   check();
   // The immutable wire body is captured before this asynchronous credential read.
   const credential=await wait(Promise.resolve().then(()=>readCredential({credentialRef,signal:controller.signal})));
   check();
   if(typeof credential!=='string'||credential.length>16384||!/^[\x21-\x7e]+$/.test(credential))throw failure(401);
   const pending=Promise.resolve().then(()=>{
    check();
    return fetch(endpoint,{method:'POST',headers:{'x-api-key':credential,'anthropic-version':apiVersion,...workspaceId===undefined?{}:{'anthropic-workspace-id':workspaceId},'content-type':'application/json',accept:'application/json'},body,signal:controller.signal,redirect:'error',credentials:'omit',cache:'no-store'});
   }).then(response=>{if(controller.signal.aborted)cancelBody(response?.body);return response;});
   const response=await wait(pending);
   check();
   if(!response||!Number.isInteger(response.status)||response.status<200||response.status>599)throw failure();
   if(response.redirected||(response.url&&response.url!==endpoint)){cancelBody(response.body);throw failure();}
   if(response.status<200||response.status>=300){cancelBody(response.body);throw failure(response.status);}
   const type=response.headers?.get('content-type');
   if(typeof type!=='string'||!/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(type)){cancelBody(response.body);throw failure();}
   const length=response.headers.get('content-length');
   if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>maxResponseBytes)){cancelBody(response.body);throw failure();}
   if(typeof response.body?.getReader!=='function'){cancelBody(response.body);throw failure();}
   reader=response.body.getReader();
   const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];
   let size=0;
   for(;;){
    const chunk=await wait(reader.read());check();
    if(chunk.done){finished=true;break;}
    if(!(chunk.value instanceof Uint8Array))throw failure();
    size+=chunk.value.byteLength;
    if(size>maxResponseBytes)throw failure();
    parts.push(decoder.decode(chunk.value,{stream:true}));
   }
   parts.push(decoder.decode());check();
   const result=JSON.parse(parts.join(''));check();
   if(!result||typeof result!=='object'||Array.isArray(result))throw failure();
   return result;
  }catch(error){
   // Preserve only HTTP classification, never provider bodies, prompts or secrets.
   throw failure(Number.isInteger(error?.status)?error.status:undefined);
  }finally{
   clearTimeout(timer);upstream?.removeEventListener('abort',onAbort);
   if(!finished){controller.abort();try{Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}}
   try{reader?.releaseLock();}catch{}
  }
 }});
}
module.exports={createAnthropicHttpTransport};
