'use strict';
// Node server composition only. These public web transports own the wire;
// this owner retains the original catalog, readers, pricing and cancellation.
// Import and construction never read a credential, resolve DNS or dispatch.
const {performance}=require('node:perf_hooks');
const {ContractError,createRegistry}=require('../../../contracts/ai/v1/core.cjs');
const {createAnthropicAdapter}=require('./anthropic.cjs');
const {createOpenAIAdapter}=require('./openai.cjs');
const {createAnthropicHttpTransport}=require('./anthropic-http.cjs');
const {createOpenAIHttpTransport}=require('./openai-http.cjs');
const {createAnthropicHttpsFetch}=require('./anthropic-https.cjs');
const {createOpenAIHttpsFetch}=require('./openai-https.cjs');

const failure=code=>new ContractError(code,'Original native web provider capability unavailable');
const fail=code=>{throw failure(code);};
const bounded=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const capture=(value,keys)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getOwnPropertySymbols(value).length
  ||Object.keys(value).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key))
  ||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')))fail('configuration');
 return {...value};
};
const freeze=value=>{
 if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
};

function createNativeWebProviderOwner(input){
 const options=capture(input,['anthropic','openai','stopTimeoutMs']);
 if(!bounded(options.stopTimeoutMs,1,30000))fail('configuration');
 const stopTimeoutMs=options.stopTimeoutMs;
 const common=['models','credentialRef','readCredential','resolveAddress','preflight','priceUsage','credentialTimeoutMs','callTimeoutMs','maxRequestBytes','maxResponseBytes'];
 const configurations=Object.entries({anthropic:options.anthropic,openai:options.openai}).map(([providerId,value])=>{
  const extra=providerId==='anthropic'?['apiVersion','workspaceId']:['organization','project'];
  const c=capture(value,[...common,...extra]);
  if(typeof c.credentialRef!=='string'||!c.credentialRef.trim()||c.credentialRef!==c.credentialRef.trim()||c.credentialRef.length>256
   ||['readCredential','resolveAddress','preflight','priceUsage'].some(key=>typeof c[key]!=='function')
   ||!bounded(c.credentialTimeoutMs,1,120000)||!bounded(c.callTimeoutMs,1,300000)
   ||!bounded(c.maxRequestBytes,1,16777216)||!bounded(c.maxResponseBytes,1,16777216))fail('configuration');
  if(providerId==='anthropic'){
   if(typeof c.apiVersion!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(c.apiVersion)
    ||c.workspaceId!==null&&(typeof c.workspaceId!=='string'||!/^wrkspc_[A-Za-z0-9]{1,120}$/.test(c.workspaceId)))fail('configuration');
  // The existing public wire has no organization/project headers. Explicit
  // null selects key-scoped routing; a supplied account is never ignored.
  }else if(c.organization!==null||c.project!==null)fail('configuration');
  let models;try{models=structuredClone(c.models);}catch{fail('configuration');}
  if(!models||typeof models!=='object'||Array.isArray(models)||!Object.keys(models).length)fail('configuration');
  return Object.freeze({...c,providerId,models:freeze(models)});
 });
 const shutdown=new AbortController(),pending=new Set(),operations=new Set();
 let retired=false,originalStop;
 const check=signal=>{if(retired||shutdown.signal.aborted||signal?.aborted)fail('cancelled');};

 // Track the actual promise returned by an original function, rather than a
 // consumer's timeout race. Late settlement never replaces an original stop.
 const observe=(fn,context,code='uncertain')=>{
  check(context?.signal);
  const original=Promise.resolve().then(()=>{check(context?.signal);return fn(context);});
  pending.add(original);void original.finally(()=>pending.delete(original)).catch(()=>{});
  return original.then(value=>{check(context?.signal);return value;},error=>{
   throw failure(error instanceof ContractError?error.code:code);
  });
 };
 const begin=(signal,timeout,work)=>{
  if(signal!==undefined&&!(signal instanceof AbortSignal))fail('configuration');
  check(signal);
  const controller=new AbortController(),job={controller,original:null};
  let timer,rejectCancellation;
  const interrupted=new Promise((_,reject)=>{rejectCancellation=reject;});void interrupted.catch(()=>{});
  const abort=code=>{controller.abort();rejectCancellation(failure(code));};
  const externalAbort=()=>abort('cancelled'),ownerAbort=()=>abort('cancelled');
  signal?.addEventListener('abort',externalAbort,{once:true});shutdown.signal.addEventListener('abort',ownerAbort,{once:true});
  if(signal?.aborted||shutdown.signal.aborted)abort('cancelled');
  timer=setTimeout(()=>abort('deadline'),timeout);
  operations.add(job);
  job.original=observe(()=>work(controller.signal),{signal:controller.signal});
  void job.original.finally(()=>operations.delete(job)).catch(()=>{});
  return Promise.race([job.original,interrupted]).finally(()=>{
   clearTimeout(timer);signal?.removeEventListener('abort',externalAbort);shutdown.signal.removeEventListener('abort',ownerAbort);
  });
 };
 const readCredential=(c,signal)=>observe(c.readCredential,Object.freeze({runtimeId:'web',providerId:c.providerId,credentialRef:c.credentialRef,signal}),'credentials').then(value=>{
  if(typeof value!=='string'||value.length>16384||!/^[\x21-\x7e]+$/.test(value))fail('credentials');return value;
 });
 const providers=configurations.map(c=>{
  const resolveAddress=context=>observe(c.resolveAddress,Object.freeze({hostname:context.hostname,signal:context.signal}),'transport');
  const fetch=c.providerId==='anthropic'
   ?createAnthropicHttpsFetch({resolveAddress,apiVersion:c.apiVersion,workspaceId:c.workspaceId===null?undefined:c.workspaceId,maxRequestBytes:c.maxRequestBytes})
   :createOpenAIHttpsFetch({resolveAddress,maxRequestBytes:c.maxRequestBytes});
  if(typeof fetch?.stop!=='function')fail('configuration');
  const stopFetch=fetch.stop.bind(fetch);
  const buildAdapter=signal=>{
   const http={fetch,readCredential:context=>begin(context.signal,c.credentialTimeoutMs,owned=>readCredential(c,owned)),credentialRef:c.credentialRef,maxRequestBytes:c.maxRequestBytes,maxResponseBytes:c.maxResponseBytes};
   const transport=c.providerId==='anthropic'
    ?createAnthropicHttpTransport({...http,apiVersion:c.apiVersion,workspaceId:c.workspaceId===null?undefined:c.workspaceId})
    :createOpenAIHttpTransport(http);
   const args={models:c.models,credentialRef:c.credentialRef,transport,
    preflight:context=>observe(c.preflight,Object.freeze({...context,signal}),'configuration'),
    priceUsage:context=>observe(c.priceUsage,Object.freeze({...context,signal}),'configuration')};
   return (c.providerId==='anthropic'?createAnthropicAdapter:createOpenAIAdapter)(args);
  };
  const exemplar=buildAdapter(shutdown.signal);
  const adapter=Object.freeze({...exemplar,models:c.models,execute(context){
   if(!context||typeof context!=='object'||!bounded(context.request?.budget?.deadlineMs,1,2147483647))fail('configuration');
   let request,snapshot;try{request=freeze(structuredClone(context.request));snapshot=freeze(structuredClone(context.snapshot));}catch{fail('configuration');}
   const runId=context.runId,signal=context.signal;
   // The public registry normally pins these; direct callers cannot substitute
   // another provider, credential reference, adapter version or unknown model.
   if(snapshot?.providerId!==exemplar.providerId||snapshot.adapterVersion!==exemplar.adapterVersion
    ||snapshot.credentialRef!==c.credentialRef||!Object.hasOwn(c.models,snapshot.model))fail('permissions');
   return begin(signal,Math.min(request.budget.deadlineMs,c.callTimeoutMs),owned=>buildAdapter(owned).execute({request,snapshot,runId,signal:owned}));
  }});
  createRegistry().register(adapter);
  return Object.freeze({configuration:c,adapter,stopFetch});
 });
 const checkCredential=context=>{
  if(!context||typeof context!=='object'||Array.isArray(context)||context.runtimeId!=='web')fail('permissions');
  const provider=providers.find(p=>p.configuration.providerId===context.providerId&&p.configuration.credentialRef===context.credentialRef);
  if(!provider)fail('permissions');
  const c=provider.configuration;
  return begin(context.signal,c.credentialTimeoutMs,async signal=>{await readCredential(c,signal);return true;}).catch(()=>false);
 };
 const stop=()=>{
  retired=true;shutdown.abort();for(const job of operations)job.controller.abort();
  if(originalStop)return originalStop;
  const deadline=performance.now()+stopTimeoutMs;
  originalStop=Promise.resolve().then(async()=>{
   let timer;
   const fetches=providers.map(p=>Promise.resolve().then(()=>p.stopFetch({timeoutMs:Math.max(1,Math.min(30000,Math.ceil(deadline-performance.now())))})));
   const originals=[...pending,...[...operations].map(job=>job.original).filter(Boolean)];
   const settled=Promise.all([Promise.allSettled(originals),Promise.allSettled(fetches)]).then(([,results])=>results);
   try{
    const results=await Promise.race([settled,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),Math.max(0,deadline-performance.now()));})]);
    const fetchesDrained=results!==null&&results.every(result=>result.status==='fulfilled'&&result.value?.drained===true&&result.value?.uncertain!==true);
    const drained=fetchesDrained&&pending.size===0&&operations.size===0&&performance.now()<=deadline;
    return Object.freeze({drained,uncertain:!drained,pending:pending.size,active:operations.size,fetchesDrained,accepting:false,restartAllowed:false});
   }finally{clearTimeout(timer);}
  });
  return originalStop;
 };
 return Object.freeze({adapters:Object.freeze(providers.map(p=>p.adapter)),checkCredential,stop});
}
module.exports={createNativeWebProviderOwner};
