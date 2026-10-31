'use strict';
// Native Node preloading API. Import and registration are inert: no environment,
// module path, TypeScript loader, secret, pool, provider or deployment is used.
const key=Symbol.for('ytubviral.ai.platform-web-host-factory.v1');
const consumed=Symbol.for('ytubviral.ai.platform-web-host-factory-consumed.v1');
const {types}=require('node:util');
const nativeConfigurations=new WeakMap();
const failure=()=>new Error('Original native platform web host registration required');
function registerOriginalPlatformWebHostFactory(factory,options){
 if(globalThis[consumed])throw new Error('Native platform web host preparation already began');
 if(typeof factory!=='function'||!options||typeof options!=='object'||Array.isArray(options))throw failure();
 const descriptors=Object.getOwnPropertyDescriptors(options),names=Reflect.ownKeys(descriptors);
 if(names.some(name=>!['signal','prepareTimeoutMs','stopTimeoutMs'].includes(name))
  ||!Object.hasOwn(descriptors,'prepareTimeoutMs')||!Object.hasOwn(descriptors,'stopTimeoutMs')
  ||names.some(name=>!Object.hasOwn(descriptors[name],'value')))throw failure();
 const signal=descriptors.signal?.value,prepareTimeoutMs=descriptors.prepareTimeoutMs.value,stopTimeoutMs=descriptors.stopTimeoutMs.value;
 if(!Number.isSafeInteger(prepareTimeoutMs)||prepareTimeoutMs<1||prepareTimeoutMs>300000
  ||!Number.isSafeInteger(stopTimeoutMs)||stopTimeoutMs<1||stopTimeoutMs>30000
  ||signal!==undefined&&(!(signal instanceof AbortSignal)||signal.aborted))throw failure();
 const previous=globalThis[key];
 if(previous){
  if(previous.factory!==factory||previous.signal!==signal||previous.prepareTimeoutMs!==prepareTimeoutMs||previous.stopTimeoutMs!==stopTimeoutMs)throw new Error('Native platform web host already has original capabilities');
  return;
 }
 Object.defineProperty(globalThis,key,{value:Object.freeze({factory,signal,prepareTimeoutMs,stopTimeoutMs}),writable:false,configurable:false});
}
function getOriginalPlatformWebHostFactory(){return globalThis[key];}
function beginOriginalPlatformWebHostPreparation(){
 // Seal synchronously even when absent or when a separate original owner will
 // bypass construction. Later registration cannot renew a failed preparation.
 if(!globalThis[consumed])Object.defineProperty(globalThis,consumed,{value:true,writable:false,configurable:false});
 return getOriginalPlatformWebHostFactory();
}
const capture=(value,allowed,required=allowed)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||types.isProxy(value))throw failure();
 const d=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(d);
 if(keys.some(k=>typeof k!=='string'||!allowed.includes(k)||!Object.hasOwn(d[k],'value'))||required.some(k=>!Object.hasOwn(d,k))||allowed.some(k=>k in value&&!Object.hasOwn(d,k)))throw failure();
 return Object.fromEntries(keys.map(k=>[k,d[k].value]));
};
function data(value,seen=new Set(),depth=0,size={nodes:0}){
 if(value===null||['string','boolean','undefined'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||types.isProxy(value)||seen.has(value)||depth>64||++size.nodes>10000)throw failure();
 const d=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(d);if(keys.some(k=>typeof k!=='string'||!Object.hasOwn(d[k],'value')))throw failure();
 seen.add(value);let result;
 if(Array.isArray(value)){const n=d.length.value;if(keys.length!==n+1||keys.some(k=>k!=='length'&&(!/^(0|[1-9]\d*)$/.test(k)||Number(k)>=n)))throw failure();result=Array.from({length:n},(_,i)=>data(d[i].value,seen,depth+1,size));}
 else result=Object.fromEntries(keys.map(k=>[k,data(d[k].value,seen,depth+1,size)]));
 seen.delete(value);return Object.freeze(result);
}
const callable=value=>{if(typeof value!=='function'||types.isProxy(value))throw failure();return value;};
// Explicit executable configuration connects the host's OWNED native bindings
// to selected providers. Registration captures data/functions but invokes none;
// no environment key, model, price, account, consent or deadline is inferred.
function registerOriginalNativePlatformWebHostConfiguration(input,options){
 if(!input||typeof input!=='object'||types.isProxy(input))throw failure();
 const previous=nativeConfigurations.get(input);if(previous){registerOriginalPlatformWebHostFactory(previous,options);return;}
 const o=capture(input,['deployment','providers','authorizeCredentialAccess','bindingStopTimeoutMs','image'],['deployment','providers','authorizeCredentialAccess','bindingStopTimeoutMs']),authorizeCredentialAccess=callable(o.authorizeCredentialAccess);
 if(!Number.isSafeInteger(o.bindingStopTimeoutMs)||o.bindingStopTimeoutMs<1||o.bindingStopTimeoutMs>30000)throw failure();
 const deployment=capture(o.deployment,['database','runtime','authorizeRoleAccess','sealAndDrainIngress','prepareTimeoutMs','stopTimeoutMs']);
 const runtime=capture(deployment.runtime,['taskCatalog','policies','budgetBindings','operatingBudget','authorize','getRuntimes','catalogAdapters','administrativeAgentReadiness'],['taskCatalog','policies','budgetBindings','operatingBudget','authorize']);
 const declarations=data(Object.fromEntries(['taskCatalog','policies','budgetBindings','operatingBudget','catalogAdapters'].filter(k=>Object.hasOwn(runtime,k)).map(k=>[k,runtime[k]])));
 const authorize=callable(runtime.authorize),getRuntimes=Object.hasOwn(runtime,'getRuntimes')?callable(runtime.getRuntimes):undefined;
 let administrativeAgentReadiness;
 if(Object.hasOwn(runtime,'administrativeAgentReadiness')){
  const p=capture(runtime.administrativeAgentReadiness,['checkCredential','checkModelAvailability']);
  administrativeAgentReadiness=Object.freeze(Object.fromEntries(Object.entries(p).map(([k,fn])=>[k,callable(fn).bind(runtime.administrativeAgentReadiness)])));
 }
 let image;
 if(Object.hasOwn(o,'image')){
  const p=capture(o.image,['models','pricing','credentialRef','transport','preflight','priceUsage','checkCredential','checkModelAvailability','stop','stopTimeoutMs']),transport=capture(p.transport,['create']);
  if(!Number.isSafeInteger(p.stopTimeoutMs)||p.stopTimeoutMs<1||p.stopTimeoutMs>30000)throw failure();
  image=Object.freeze({...data({models:p.models,pricing:p.pricing,credentialRef:p.credentialRef,stopTimeoutMs:p.stopTimeoutMs}),transport:Object.freeze({create:callable(transport.create)}),...Object.fromEntries(['preflight','priceUsage','checkCredential','checkModelAvailability','stop'].map(k=>[k,callable(p[k])]))});
 }
 const database=data(deployment.database),authorizeRoleAccess=callable(deployment.authorizeRoleAccess),sealAndDrainIngress=callable(deployment.sealAndDrainIngress);
 const providers=capture(o.providers,['stopTimeoutMs','anthropic','openai'],['stopTimeoutMs']),providerIds=['anthropic','openai'].filter(id=>Object.hasOwn(providers,id));
 if(!providerIds.length||!Number.isSafeInteger(providers.stopTimeoutMs)||providers.stopTimeoutMs<1||providers.stopTimeoutMs>30000)throw failure();
 const selected={};for(const id of providerIds){
  const common=['models','preflight','priceUsage','authorizeMetadataRead','credentialTimeoutMs','callTimeoutMs','maxRequestBytes','maxResponseBytes'],account=id==='anthropic'?['apiVersion','workspaceId']:['organization','project'];
  const p=capture(providers[id],[...common,...account],[...common.filter(k=>k!=='authorizeMetadataRead'),...account]);
  const values=data(Object.fromEntries(['models','credentialTimeoutMs','callTimeoutMs','maxRequestBytes','maxResponseBytes',...account].map(k=>[k,p[k]])));
  selected[id]=Object.freeze({...values,preflight:callable(p.preflight),priceUsage:callable(p.priceUsage),...(Object.hasOwn(p,'authorizeMetadataRead')?{authorizeMetadataRead:callable(p.authorizeMetadataRead)}:{})});
 }
 const bindingStopTimeoutMs=o.bindingStopTimeoutMs,providerStopTimeoutMs=providers.stopTimeoutMs,prepareTimeoutMs=deployment.prepareTimeoutMs,stopTimeoutMs=deployment.stopTimeoutMs;
 const factory=context=>{
  const c=capture(context,['signal','createNativePlatformBindings']);if(!(c.signal instanceof AbortSignal)||c.signal.aborted)throw failure();callable(c.createNativePlatformBindings);
  const bindings=c.createNativePlatformBindings({providerIds:[...providerIds],authorizeCredentialAccess,stopTimeoutMs:bindingStopTimeoutMs});
  const nativeProviders={stopTimeoutMs:providerStopTimeoutMs};
  for(const id of providerIds)nativeProviders[id]={...selected[id],credentialRef:bindings.credentialRefs[id],readCredential:bindings.readCredential.bind(bindings),resolveAddress:bindings.resolveAddress.bind(bindings)};
  return{database,authorizeRoleAccess,sealAndDrainIngress,prepareTimeoutMs,stopTimeoutMs,runtime:{...declarations,authorize,...(getRuntimes?{getRuntimes}:{}),...(administrativeAgentReadiness?{administrativeAgentReadiness}:{}),nativeProviders,...(image?{image}:{})}};
 };
 registerOriginalPlatformWebHostFactory(factory,options);nativeConfigurations.set(input,factory);
}
module.exports={registerOriginalPlatformWebHostFactory,getOriginalPlatformWebHostFactory,beginOriginalPlatformWebHostPreparation,registerOriginalNativePlatformWebHostConfiguration};
