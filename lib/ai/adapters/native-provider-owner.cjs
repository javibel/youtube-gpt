'use strict';
// Node server composition only. These public web transports own the wire;
// this owner retains the original catalog, readers, pricing and cancellation.
// Import and construction never read a credential, resolve DNS or dispatch.
const {performance}=require('node:perf_hooks');
const {TextDecoder,types}=require('node:util');
const {createHash}=require('node:crypto');
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
const capture=(value,keys,required=keys)=>{
 if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value))fail('configuration');
 const descriptors=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(descriptors);
 if(names.some(key=>typeof key!=='string'||!keys.includes(key)||!Object.hasOwn(descriptors[key],'value'))
  ||required.some(key=>!Object.hasOwn(descriptors,key))
  ||keys.some(key=>key in value&&!Object.hasOwn(descriptors,key)))fail('configuration');
 return Object.fromEntries(names.map(key=>[key,descriptors[key].value]));
};
const freeze=value=>{
 if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
};
// Public pinned tariff data, not private agent implementation or credentials.
// Preserve the approved standard/global tariff and the counted 2x+4096
// estimate. The web revision also covers the existing URL-image input grammar;
// it is never represented as a token/cost upper bound or image-generation grant.
const WEB_RESERVATION_REVISION='anthropic-web-counted-double-plus4096-2026-11-05';
const TARIFF_REVISION='anthropic-public-2026-10-28';
const tariffRates=Object.freeze({
 'claude-opus-4-8':[5000000,25000000,6250000,10000000,500000],
 'claude-opus-4-6':[5000000,25000000,6250000,10000000,500000],
 'claude-sonnet-4-6':[3000000,15000000,3750000,6000000,300000],
 'claude-haiku-4-5-20251001':[1000000,5000000,1250000,2000000,100000]
});
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const digest=v=>createHash('sha256').update(stable(v)).digest('hex');
function captureWebReservation(original,models){
 const r=capture(original,['revision','pricingSelections','authorizeTokenCount','authorizeCountedReservation']);
 if(r.revision!==WEB_RESERVATION_REVISION||['authorizeTokenCount','authorizeCountedReservation'].some(k=>typeof r[k]!=='function'||types.isProxy(r[k]))||!Array.isArray(r.pricingSelections)||types.isProxy(r.pricingSelections)||Object.values(Object.getOwnPropertyDescriptors(r.pricingSelections)).some(d=>!Object.hasOwn(d,'value')))fail('configuration');
 const selected={};for(const row of r.pricingSelections){const p=capture(row,['tariffRevision','model','mode','cacheWriteTtl']);if(p.tariffRevision!==TARIFF_REVISION||p.mode!=='standard-global-direct'||!['none','5m','1h'].includes(p.cacheWriteTtl)||!Object.hasOwn(tariffRates,p.model)||!Object.hasOwn(models,p.model)||Object.hasOwn(selected,p.model))fail('configuration');selected[p.model]=Object.freeze(p);}
 if(stable(Object.keys(selected).sort())!==stable(Object.keys(models).sort()))fail('configuration');
 return Object.freeze({revision:r.revision,selected:Object.freeze(selected),authorizeTokenCount:r.authorizeTokenCount.bind(original),authorizeCountedReservation:r.authorizeCountedReservation.bind(original)});
}

function createNativeWebProviderOwner(input){
 const options=capture(input,['anthropic','openai','stopTimeoutMs'],['stopTimeoutMs']);
 if(!bounded(options.stopTimeoutMs,1,30000))fail('configuration');
 const providerIds=['anthropic','openai'].filter(providerId=>Object.hasOwn(options,providerId));
 if(providerIds.length===0)fail('configuration');
 const stopTimeoutMs=options.stopTimeoutMs;
 const common=['models','credentialRef','readCredential','resolveAddress','preflight','priceUsage','credentialTimeoutMs','callTimeoutMs','maxRequestBytes','maxResponseBytes'];
 // Only explicitly supplied blocks construct transports. No environment,
 // active profile, fallback or model selection supplies a missing provider.
 const configurations=providerIds.map(providerId=>{
  const extra=providerId==='anthropic'?['apiVersion','workspaceId']:['organization','project'];
  const original=options[providerId];if(!original||types.isProxy(original))fail('configuration');
  const counted=providerId==='anthropic'&&Object.hasOwn(original,'requestReservation'),required=counted?common.filter(k=>!['preflight','priceUsage'].includes(k)):common;
  const c=capture(original,[...required,...extra,'authorizeMetadataRead',...(counted?['requestReservation']:[])],[...required,...extra,...(counted?['requestReservation']:[])]);
  if(typeof c.credentialRef!=='string'||!c.credentialRef.trim()||c.credentialRef!==c.credentialRef.trim()||c.credentialRef.length>256
   ||['readCredential','resolveAddress',...(counted?[]:['preflight','priceUsage'])].some(key=>typeof c[key]!=='function')
   ||c.authorizeMetadataRead!==undefined&&typeof c.authorizeMetadataRead!=='function'
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
  return Object.freeze({...c,providerId,models:freeze(models),...(counted?{requestReservation:captureWebReservation(c.requestReservation,models)}:{})});
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
   ?createAnthropicHttpsFetch({resolveAddress,apiVersion:c.apiVersion,workspaceId:c.workspaceId===null?undefined:c.workspaceId,maxRequestBytes:c.maxRequestBytes,...(c.requestReservation?{countTokens:true}:{})})
   :createOpenAIHttpsFetch({resolveAddress,maxRequestBytes:c.maxRequestBytes});
  if(typeof fetch?.stop!=='function')fail('configuration');
  const stopFetch=fetch.stop.bind(fetch);
  const metadataFetch=c.providerId==='anthropic'
   ?createAnthropicHttpsFetch({resolveAddress,apiVersion:c.apiVersion,workspaceId:c.workspaceId===null?undefined:c.workspaceId,maxRequestBytes:c.maxRequestBytes,metadataModels:Object.keys(c.models)})
   :createOpenAIHttpsFetch({resolveAddress,maxRequestBytes:c.maxRequestBytes,metadataModels:Object.keys(c.models)});
  const stopMetadataFetch=metadataFetch.stop.bind(metadataFetch);
  const quotes=new WeakMap();let reservationBreached=false;
  const countedPreflight=async context=>{
   const {payload,request,snapshot}=context,r=c.requestReservation,p=r.selected[snapshot?.model];
   if(!p||reservationBreached||snapshot.providerId!=='anthropic'||snapshot.credentialRef!==c.credentialRef||request.budget.currency!=='USD'||payload.model!==snapshot.model||payload.stream!==false||payload.max_tokens!==request.budget.maxOutputTokens||request.requiredCapabilities.includes('prompt_cache')&&p.cacheWriteTtl!=='5m')fail('configuration');
   capture(payload,['model','messages','max_tokens','stream','system','tools','service_tier','inference_geo'],['model','messages','max_tokens','stream']);
   if(payload.service_tier!=='standard_only'||(snapshot.model==='claude-haiku-4-5-20251001'?Object.hasOwn(payload,'inference_geo'):payload.inference_geo!=='global'))fail('configuration');
   const toolLimit=payload.tools===undefined?0:request.toolPolicy.maxCalls;
   if(toolLimit===0){if(payload.tools!==undefined||request.toolPolicy.allowed.length||request.toolPolicy.maxCalls!==0||request.requiredCapabilities.includes('web_search'))fail('capability');}
   else{if(!bounded(toolLimit,1,3)||request.toolPolicy.allowed.length!==1||request.toolPolicy.allowed[0]!=='web_search'||!request.requiredCapabilities.includes('web_search')||!Array.isArray(payload.tools)||payload.tools.length!==1)fail('capability');const tool=capture(payload.tools[0],['type','name','max_uses']);if(tool.type!=='web_search_20250305'||tool.name!=='web_search'||tool.max_uses!==toolLimit)fail('capability');}
   const text=part=>{if(part.type==='text'){capture(part,['type','text','cache_control'],['type','text']);if(typeof part.text!=='string')fail('capability');if(part.cache_control!==undefined){const cache=capture(part.cache_control,['type','ttl'],['type']);if(cache.type!=='ephemeral'||cache.ttl!==undefined&&cache.ttl!=='5m'||p.cacheWriteTtl!=='5m')fail('capability');}}else if(part.type==='image'){capture(part,['type','source']);const source=capture(part.source,['type','url']);if(source.type!=='url'||typeof source.url!=='string'||source.url.length>8192||!/^https:\/\//.test(source.url))fail('capability');}else fail('capability');};
   if(!Array.isArray(payload.messages)||!payload.messages.length)fail('capability');for(const m of payload.messages){capture(m,['role','content']);if(!['user','assistant'].includes(m.role)||!Array.isArray(m.content))fail('capability');m.content.forEach(text);}if(payload.system!==undefined){if(!Array.isArray(payload.system))fail('capability');payload.system.forEach(text);}
   const payloadDigest=digest(payload),body=JSON.stringify({model:payload.model,messages:payload.messages,...(payload.system===undefined?{}:{system:payload.system}),...(payload.tools===undefined?{}:{tools:payload.tools})});if(Buffer.byteLength(body)>c.maxRequestBytes)fail('invalid_format');
   return begin(context.signal,c.credentialTimeoutMs,async signal=>{
    const account=Object.freeze({apiVersion:c.apiVersion,workspaceId:c.workspaceId}),base={runtimeId:'web',providerId:'anthropic',credentialRef:c.credentialRef,model:snapshot.model,payloadDigest,account,signal};
    if(await observe(r.authorizeCountedReservation,Object.freeze({...base,reservationRevision:r.revision,requestId:request.requestId,maxCostMicros:request.budget.maxCostMicros,maxOutputTokens:request.budget.maxOutputTokens,maxToolCalls:toolLimit}),'permissions')!==true)fail('permissions');
    if(await observe(r.authorizeTokenCount,Object.freeze({...base,operation:'count-input-tokens'}),'permissions')!==true)fail('permissions');
    const key=await readCredential(c,signal),url='https://api.anthropic.com/v1/messages/count_tokens';let response,reader,done=false,value;
    try{
     response=await fetch(url,{method:'POST',headers:{'x-api-key':key,'anthropic-version':c.apiVersion,...c.workspaceId===null?{}:{'anthropic-workspace-id':c.workspaceId},'content-type':'application/json',accept:'application/json'},body,signal,redirect:'error',credentials:'omit',cache:'no-store'});
     if(response.status!==200||response.redirected||response.url!==url||typeof response.nativeClosed!=='function'||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||'')||!['','identity'].includes(response.headers.get('content-encoding')||''))fail(response.status===401?'credentials':response.status===403?'permissions':response.status===429?'rate_limit':'uncertain');
     reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let length=0,buffer='';for(;;){check(signal);const part=await reader.read();if(part.done){done=true;break;}length+=part.value.byteLength;if(length>c.maxResponseBytes)fail('invalid_format');buffer+=decoder.decode(part.value,{stream:true});}buffer+=decoder.decode();value=JSON.parse(buffer);capture(value,['input_tokens']);if(!bounded(value.input_tokens,0,Number.MAX_SAFE_INTEGER))fail('invalid_format');
    }finally{if(!done)try{if(reader)await reader.cancel();else await response?.body?.cancel();}catch{}if(response?.nativeClosed)await response.nativeClosed();}
    check(signal);if(digest(payload)!==payloadDigest||reservationBreached)fail('uncertain');const allowance=BigInt(value.input_tokens)*2n+4096n;if(allowance>BigInt(snapshot.model==='claude-haiku-4-5-20251001'?200000:1000000))fail('quota');
    // Existing bounded web_search is $10/1000 searches, in addition to input
    // and output tokens (public pricing reviewed 2026-11-05). Reserve all
    // permitted uses; charge only measured uses. No other tools are enabled.
    const rates=tariffRates[snapshot.model],write=p.cacheWriteTtl==='1h'?rates[3]:p.cacheWriteTtl==='none'?0:rates[2],reserve=(allowance*BigInt(Math.max(rates[0],rates[4],write))+BigInt(request.budget.maxOutputTokens)*BigInt(rates[1])+999999n)/1000000n+BigInt(toolLimit)*10000n;
    if(reserve>BigInt(Number.MAX_SAFE_INTEGER)||reserve>BigInt(request.budget.maxCostMicros))fail('quota');const priceVersion=TARIFF_REVISION+':'+snapshot.model+':'+p.mode+':cache-'+p.cacheWriteTtl+(toolLimit?':web-search-2026-11-05':'');
    const quote=Object.freeze({kind:'authorized-counted-reservation',reservationRevision:r.revision,reservationMicros:Number(reserve),currency:'USD',priceVersion,estimate:true,upperBoundVerified:false});quotes.set(quote,{payloadDigest,allowance,maximum:BigInt(request.budget.maxCostMicros),output:request.budget.maxOutputTokens,toolLimit,model:snapshot.model,selection:p});return quote;
   });
  };
  const countedPrice=context=>{
   try{
    const pin=quotes.get(context.quote);if(!pin||digest(context.anthropic?.request)!==pin.payloadDigest||context.snapshot?.model!==pin.model)return null;
    const response=context.anthropic.response,raw=capture(response.usage,['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens','cache_creation','server_tool_use','inference_geo','service_tier','speed','output_tokens_details'],['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens']),usage=context.usage;
    // The quote pins the actual explicit standard/global request; null usage
    // metadata is not a new tier or a guessed workspace default. A contrary
    // response always wins and remains unpriced.
    const mode=(value,expected)=>value===expected||value==null;
    if(response.model!==pin.model||!mode(response.speed,'standard')||!mode(raw.service_tier,'standard')||!mode(raw.inference_geo,'global')||!mode(raw.speed,'standard'))return null;
    const fields={inputTokens:'input_tokens',outputTokens:'output_tokens',cacheReadTokens:'cache_read_input_tokens',cacheWriteTokens:'cache_creation_input_tokens'};for(const [canonical,wire]of Object.entries(fields))if(!bounded(raw[wire],0,Number.MAX_SAFE_INTEGER)||usage[canonical]!==raw[wire])return null;
    const tools=raw.server_tool_use==null&&pin.toolLimit===0&&response.toolUseObserved===false?{web_search_requests:0,web_fetch_requests:0}:capture(raw.server_tool_use,['web_search_requests','web_fetch_requests']);if(!bounded(tools.web_search_requests,0,Number.MAX_SAFE_INTEGER)||tools.web_fetch_requests!==0||usage.toolCalls!==tools.web_search_requests)return null;
    if(raw.output_tokens_details!==undefined&&raw.output_tokens_details!==null){const d=capture(raw.output_tokens_details,['thinking_tokens']);if(!bounded(d.thinking_tokens,0,raw.output_tokens))return null;}
    const ttl=pin.selection.cacheWriteTtl;if(raw.cache_creation_input_tokens&&ttl==='none')return null;if(raw.cache_creation!==undefined&&raw.cache_creation!==null||raw.cache_creation_input_tokens){const cache=capture(raw.cache_creation,['ephemeral_5m_input_tokens','ephemeral_1h_input_tokens']);if(!bounded(cache.ephemeral_5m_input_tokens,0,Number.MAX_SAFE_INTEGER)||!bounded(cache.ephemeral_1h_input_tokens,0,Number.MAX_SAFE_INTEGER)||BigInt(cache.ephemeral_5m_input_tokens)+BigInt(cache.ephemeral_1h_input_tokens)!==BigInt(raw.cache_creation_input_tokens)||ttl==='5m'&&cache.ephemeral_1h_input_tokens||ttl==='1h'&&cache.ephemeral_5m_input_tokens)return null;}
    const rates=tariffRates[pin.model],write=ttl==='1h'?rates[3]:ttl==='5m'?rates[2]:0,total=BigInt(raw.input_tokens)+BigInt(raw.cache_read_input_tokens)+BigInt(raw.cache_creation_input_tokens);if(total>BigInt(pin.model==='claude-haiku-4-5-20251001'?200000:1000000)){reservationBreached=true;return null;}
    const cost=(BigInt(raw.input_tokens)*BigInt(rates[0])+BigInt(raw.output_tokens)*BigInt(rates[1])+BigInt(raw.cache_read_input_tokens)*BigInt(rates[4])+BigInt(raw.cache_creation_input_tokens)*BigInt(write)+999999n)/1000000n+BigInt(tools.web_search_requests)*10000n;if(cost>BigInt(Number.MAX_SAFE_INTEGER))return null;
    reservationBreached=reservationBreached||total>pin.allowance||cost>pin.maximum||raw.output_tokens>pin.output||tools.web_search_requests>pin.toolLimit;quotes.delete(context.quote);return{costMicros:Number(cost),currency:'USD',priceVersion:context.quote.priceVersion,estimated:false,...(reservationBreached?{reservationPolicyBreached:true}:{})};
   }catch{return null;}
  };
  const pricing=c.requestReservation?{preflight:countedPreflight,priceUsage:countedPrice}:c;
  const buildAdapter=signal=>{
   const http={fetch,readCredential:context=>begin(context.signal,c.credentialTimeoutMs,owned=>readCredential(c,owned)),credentialRef:c.credentialRef,maxRequestBytes:c.maxRequestBytes,maxResponseBytes:c.maxResponseBytes};
   const transport=c.providerId==='anthropic'
    ?createAnthropicHttpTransport({...http,apiVersion:c.apiVersion,workspaceId:c.workspaceId===null?undefined:c.workspaceId})
    :createOpenAIHttpTransport(http);
   const args={models:c.models,credentialRef:c.credentialRef,transport,
    preflight:context=>observe(pricing.preflight,Object.freeze({...context,signal}),'configuration'),
    priceUsage:context=>observe(pricing.priceUsage,Object.freeze({...context,signal}),'configuration')};
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
  return Object.freeze({configuration:c,adapter,metadataFetch,stopFetch:async options=>{const results=await Promise.all([stopFetch(options),stopMetadataFetch(options)]);const drained=results.every(r=>r?.drained===true&&r?.uncertain!==true);return Object.freeze({drained,uncertain:!drained});}});
 });
 const checkModelAvailability=input=>{
  const context=capture(input,['runtimeId','providerId','credentialRef','model','signal'],['runtimeId','providerId','credentialRef','model']);
  const provider=providers.find(p=>p.configuration.providerId===context.providerId&&p.configuration.credentialRef===context.credentialRef),c=provider?.configuration;
  if(context.runtimeId!=='web'||!c||typeof c.authorizeMetadataRead!=='function'||typeof context.model!=='string'||!Object.hasOwn(c.models,context.model))fail('permissions');
  return begin(context.signal,c.credentialTimeoutMs,async signal=>{
   const account=Object.freeze(c.providerId==='anthropic'?{apiVersion:c.apiVersion,workspaceId:c.workspaceId}:{organization:c.organization,project:c.project});
   if(await observe(c.authorizeMetadataRead,Object.freeze({runtimeId:'web',providerId:c.providerId,credentialRef:c.credentialRef,model:context.model,account,signal}),'permissions')!==true)fail('permissions');
   const key=await readCredential(c,signal),url='https://'+(c.providerId==='anthropic'?'api.anthropic.com':'api.openai.com')+'/v1/models/'+encodeURIComponent(context.model);
   const headers=c.providerId==='anthropic'?{'x-api-key':key,'anthropic-version':c.apiVersion,...c.workspaceId===null?{}:{'anthropic-workspace-id':c.workspaceId},accept:'application/json'}:{authorization:'Bearer '+key,accept:'application/json'};
   const response=await provider.metadataFetch(url,{method:'GET',headers,signal,redirect:'error',credentials:'omit',cache:'no-store'});
   let reader,value,complete=false;
   try{
    if(response.url!==url||response.redirected!==false||response.status!==200||typeof response.nativeClosed!=='function'
     ||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||![null,'identity'].includes(response.headers.get('content-encoding')))fail('transport');
    const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>c.maxResponseBytes))fail('transport');
    reader=response.body.getReader();const chunks=[];let size=0;
    while(true){check(signal);const part=await reader.read();if(part.done){complete=true;break;}if(!types.isUint8Array(part.value))fail('transport');size+=part.value.byteLength;if(size>c.maxResponseBytes)fail('transport');chunks.push(Buffer.from(part.value));}
    check(signal);value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    if(!value||Array.isArray(value)||(c.providerId==='anthropic'?value.type:value.object)!=='model'||typeof value.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.id)||c.providerId==='openai'&&value.id!==context.model)fail('credentials');
   }catch(error){throw failure(error instanceof ContractError?error.code:'credentials');}
   finally{if(!complete){try{if(reader)await reader.cancel();else await response.body.cancel();}catch{}}if(typeof response.nativeClosed==='function')await response.nativeClosed();}
   check(signal);return Object.freeze({runtimeId:'web',providerId:c.providerId,credentialRef:c.credentialRef,requestedModel:context.model,resolvedModel:value.id,exactModelMatch:value.id===context.model,metadataAccessible:true,selectionUnchanged:true,generationVerified:false,budgetVerified:false});
  });
 };
 const checkCredential=context=>{
  if(!context||typeof context!=='object'||Array.isArray(context)||context.runtimeId!=='web')fail('permissions');
  const provider=providers.find(p=>p.configuration.providerId===context.providerId&&p.configuration.credentialRef===context.credentialRef);
  if(!provider)fail('permissions');
  const c=provider.configuration;
  return begin(context.signal,c.credentialTimeoutMs,async signal=>{await readCredential(c,signal);return true;}).catch(()=>false);
 };
 const stop=()=>{
  if(originalStop)return originalStop;
  retired=true;
  const deadline=performance.now()+stopTimeoutMs;
  originalStop=Promise.resolve().then(async()=>{
   shutdown.abort();for(const job of operations)job.controller.abort();
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
 return Object.freeze({adapters:Object.freeze(providers.map(p=>p.adapter)),checkCredential,checkModelAvailability,stop});
}
module.exports={createNativeWebProviderOwner,WEB_RESERVATION_REVISION};
