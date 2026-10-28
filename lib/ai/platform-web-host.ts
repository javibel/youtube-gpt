import 'server-only';
import {performance} from 'node:perf_hooks';
import {createNativePlatformBindings,type NativePlatformBindingsOptions,type NativePlatformBindings} from './adapters/native-platform-bindings.cjs';
import {providePlatformWebDeployment} from './platform-web-bootstrap';
import type {PlatformWebDeploymentOptions} from './platform-web-deployment.cjs';
import {hasOriginalOperationalWebCapabilities} from './operational-runtime';
import {registerOriginalPlatformWebHostFactory,getOriginalPlatformWebHostFactory,beginOriginalPlatformWebHostPreparation,type OriginalPlatformWebHostFactory,type OriginalPlatformWebHostOptions,type OriginalPlatformWebHostRegistration} from './platform-web-host-registration.cjs';

export type {OriginalPlatformWebHostFactory,OriginalPlatformWebHostOptions} from './platform-web-host-registration.cjs';
export interface PlatformWebHostStop {
 readonly drained:boolean;
 readonly uncertain:boolean;
 readonly factoryPending:boolean;
 readonly preparationPending:boolean;
 readonly bindings:number;
 readonly bindingsDrained:boolean;
 readonly deploymentOwned:boolean;
 readonly deploymentDrained:boolean;
 readonly restartAllowed:false;
}
export interface OriginalPlatformWebHost {
 prepare():Promise<void>;
 retire():Promise<Readonly<PlatformWebHostStop>>;
}
type Deployment=ReturnType<typeof providePlatformWebDeployment>;
type BindingOwner=Readonly<NativePlatformBindings>;
type BindingStop=Awaited<ReturnType<BindingOwner['stop']>>;
type DeploymentStop=Awaited<ReturnType<Deployment['close']>> & {drained?:boolean;uncertain?:boolean};
type Registration=Readonly<{
 factory:OriginalPlatformWebHostFactory;
 signal?:AbortSignal;
 prepareTimeoutMs:number;
 stopTimeoutMs:number;
 handle:Readonly<OriginalPlatformWebHost>;
 prepareOriginal():Promise<void>;
}>;
const key=Symbol.for('ytubviral.ai.platform-web-host.v1');
const preparationKey=Symbol.for('ytubviral.ai.platform-web-host-preparation.v1');
const server=globalThis as typeof globalThis & {[key]?:Registration;[preparationKey]?:Readonly<{promise:Promise<void>}>};
const failure=()=>new Error('Original platform web host preparation was not confirmed');

// The native host supplies this original function before instrumentation. No
// environment value, serialized factory or module path can supply authority.
// Registration is inert: no secret read, DNS, pool or provider dispatch occurs.
export function provideOriginalPlatformWebHost(factory:OriginalPlatformWebHostFactory,options:OriginalPlatformWebHostOptions):Readonly<OriginalPlatformWebHost>{
 if(typeof factory!=='function'||!options||typeof options!=='object'||Array.isArray(options))throw failure();
 const descriptors=Object.getOwnPropertyDescriptors(options),names=Reflect.ownKeys(descriptors);
 if(names.some(name=>!['signal','prepareTimeoutMs','stopTimeoutMs'].includes(name as string))
  ||!Object.hasOwn(descriptors,'prepareTimeoutMs')||!Object.hasOwn(descriptors,'stopTimeoutMs')
  ||names.some(name=>!Object.hasOwn(descriptors[name as string],'value')))throw failure();
 const signal=descriptors.signal?.value as AbortSignal|undefined,prepareTimeoutMs=descriptors.prepareTimeoutMs.value as number,stopTimeoutMs=descriptors.stopTimeoutMs.value as number;
 const previous=server[key];
 if(previous){
  if(previous.factory!==factory||previous.signal!==signal||previous.prepareTimeoutMs!==prepareTimeoutMs||previous.stopTimeoutMs!==stopTimeoutMs)throw new Error('Platform web host already has original capabilities');
  return previous.handle;
 }
 if(server[preparationKey])throw new Error('Platform web host preparation already has an original result');
 registerOriginalPlatformWebHostFactory(factory,{signal,prepareTimeoutMs,stopTimeoutMs});
 const original=getOriginalPlatformWebHostFactory();if(!original)throw failure();
 return createRegisteredPlatformWebHost(original).handle;
}

function createRegisteredPlatformWebHost(original:Readonly<OriginalPlatformWebHostRegistration>):Registration{
 const {factory,signal,prepareTimeoutMs,stopTimeoutMs}=original;
 const previous=server[key];
 if(previous){
  if(previous.factory!==factory||previous.signal!==signal||previous.prepareTimeoutMs!==prepareTimeoutMs||previous.stopTimeoutMs!==stopTimeoutMs)throw new Error('Platform web host already has original capabilities');
  return previous;
 }
 if(signal?.aborted)throw failure();
 const shutdown=new AbortController(),ownedSignal=signal?AbortSignal.any([signal,shutdown.signal]):shutdown.signal;
 const bindings=new Map<BindingOwner,BindingOwner['stop']>(),bindingStops=new Map<BindingOwner,Promise<BindingStop>>();
 let sealed=false,factoryPending=false,preparationPending=false,creationAttempted=false;
 let deployment:Deployment|undefined,deploymentClosing:Promise<DeploymentStop>|undefined;
 let originalFactory:Promise<PlatformWebDeploymentOptions>|undefined,originalWork:Promise<void>|undefined;
 let preparation:Promise<void>|undefined,retirement:Promise<Readonly<PlatformWebHostStop>>|undefined;
 const check=()=>{if(sealed||ownedSignal.aborted)throw failure();};
 const stopBinding=(binding:BindingOwner)=>{
  let original=bindingStops.get(binding);
  if(!original){
   try{original=Promise.resolve(bindings.get(binding)!());}catch{original=Promise.reject(failure());}
   bindingStops.set(binding,original);void original.catch(()=>{});
  }
  return original;
 };
 const closeDeployment=()=>{
  if(deployment&&!deploymentClosing){
   // The platform owner seals synchronously, drains its original ingress and
   // providers, and closes pools only after its own native draining decision.
   try{deploymentClosing=Promise.resolve(deployment.close());}
   catch{deploymentClosing=Promise.reject(failure());}
   void deploymentClosing.catch(()=>{});
  }
  return deploymentClosing;
 };
 const retire=():Promise<Readonly<PlatformWebHostStop>>=>{
  if(retirement)return retirement;
  const deadline=performance.now()+stopTimeoutMs;
  let finish:(result:Readonly<PlatformWebHostStop>)=>void=()=>{};
  retirement=new Promise(resolve=>{finish=resolve;});
  sealed=true;signal?.removeEventListener('abort',externalAbort);
  for(const binding of bindings.keys())void stopBinding(binding);
  shutdown.abort();
  closeDeployment();
  void (async()=>{
   let timer:ReturnType<typeof setTimeout>|undefined;
   const observed=(async()=>{
    await Promise.allSettled([originalFactory,originalWork].filter((value):value is NonNullable<typeof value>=>value!==undefined));
    // An original factory that observes cancellation may finish while retiring.
    // Any binding it created synchronously is still owned and observed here.
    const children=await Promise.allSettled([...bindings.keys()].map(stopBinding));
    let closed:DeploymentStop|undefined;
    try{closed=await closeDeployment();}catch{/* Preserve an unconfirmed owner. */}
    const bindingsDrained=children.every(result=>result.status==='fulfilled'&&result.value.drained===true&&result.value.uncertain!==true);
    const deploymentDrained=deployment!==undefined?closed?.closed===true&&closed.drained!==false&&closed.uncertain!==true:!creationAttempted;
    return {bindingsDrained,deploymentDrained};
   })();
   try{
    const result=await Promise.race([observed,new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),Math.max(0,deadline-performance.now()));})]);
    const drained=result!==null&&result.bindingsDrained&&result.deploymentDrained&&!factoryPending&&!preparationPending&&performance.now()<=deadline;
    finish(Object.freeze({drained,uncertain:!drained,factoryPending,preparationPending,bindings:bindings.size,bindingsDrained:result?.bindingsDrained??false,deploymentOwned:deployment!==undefined,deploymentDrained:result?.deploymentDrained??false,restartAllowed:false}));
   }finally{clearTimeout(timer);}
  })().catch(()=>{finish(Object.freeze({drained:false,uncertain:true,factoryPending,preparationPending,bindings:bindings.size,bindingsDrained:false,deploymentOwned:deployment!==undefined,deploymentDrained:false,restartAllowed:false}));});
  return retirement;
 };
 const externalAbort=()=>{void retire().catch(()=>{});};
 signal?.addEventListener('abort',externalAbort,{once:true});
 const createOwnedBindings=(input:NativePlatformBindingsOptions):Readonly<NativePlatformBindings>=>{
  check();const binding=createNativePlatformBindings(input);bindings.set(binding,binding.stop.bind(binding));
  if(sealed||ownedSignal.aborted){void stopBinding(binding);throw failure();}
  const readCredential=binding.readCredential.bind(binding),resolveAddress=binding.resolveAddress.bind(binding),stop=binding.stop.bind(binding);
  // The host seals all retained handles before any abort listener can reenter,
  // including a listener raised while another owned binding is being stopped.
  return Object.freeze({credentialRefs:binding.credentialRefs,
   readCredential:(context:Parameters<NativePlatformBindings['readCredential']>[0])=>{check();return readCredential(context);},
   resolveAddress:(context:Parameters<NativePlatformBindings['resolveAddress']>[0])=>{check();return resolveAddress(context);},
   stop});
 };
 const prepareOriginal=():Promise<void>=>{
  if(preparation)return preparation;
  try{check();}catch(error){return preparation=Promise.reject(error);}
  let timer:ReturnType<typeof setTimeout>|undefined,rejectCancellation:()=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{rejectCancellation=()=>reject(failure());ownedSignal.addEventListener('abort',rejectCancellation,{once:true});});void cancelled.catch(()=>{});
  originalWork=Promise.resolve().then(async()=>{
   preparationPending=true;
   try{
    check();factoryPending=true;
    originalFactory=Promise.resolve().then(()=>{check();return factory(Object.freeze({signal:ownedSignal,createNativePlatformBindings:createOwnedBindings}));}).finally(()=>{factoryPending=false;});
    const input=await originalFactory;check();
    if(hasOriginalOperationalWebCapabilities())throw new Error('Another original operational web owner is already provided');
    creationAttempted=true;deployment=providePlatformWebDeployment(input,{signal:ownedSignal});check();
   }finally{preparationPending=false;}
  });void originalWork.catch(()=>{});
  const expired=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(failure());void retire().catch(()=>{});},prepareTimeoutMs);});void expired.catch(()=>{});
  preparation=Promise.race([originalWork,cancelled,expired]).finally(()=>{clearTimeout(timer);ownedSignal.removeEventListener('abort',rejectCancellation);});
  void preparation.catch(()=>{void retire().catch(()=>{});});return preparation;
 };
 const handle=Object.freeze({prepare:prepareConfiguredPlatformWebHost,retire});
 const registration=Object.freeze({factory,signal,prepareTimeoutMs,stopTimeoutMs,handle,prepareOriginal});
 Object.defineProperty(server,key,{value:registration,writable:false,configurable:false});
 return registration;
}

// Instrumentation calls this executable entry. The value import above keeps the
// real platform bootstrap and native bindings reachable in the Node bundle.
// An already supplied original runtime retains its existing installation path.
export function prepareConfiguredPlatformWebHost():Promise<void>{
 const previous=server[preparationKey];if(previous)return previous.promise;
 const original=beginOriginalPlatformWebHostPreparation();
 let registration=server[key];
 let constructionFailed=false,constructionError:unknown;
 const promise=Promise.resolve().then(()=>{
  if(constructionFailed)throw constructionError;
  if(hasOriginalOperationalWebCapabilities())return;
  if(!registration)throw new Error('Original platform web host factory required');
  return registration.prepareOriginal();
 });
 Object.defineProperty(server,preparationKey,{value:Object.freeze({promise}),writable:false,configurable:false});
 // Resolve the inert owner synchronously after fixing the original promise.
 // A caller can retire immediately on return, before any factory microtask.
 try{if(!registration&&original&&!hasOriginalOperationalWebCapabilities())registration=createRegisteredPlatformWebHost(original);}
 catch(error){constructionFailed=true;constructionError=error;}
 void promise.catch(()=>{void registration?.handle.retire().catch(()=>{});});return promise;
}

export function retireConfiguredPlatformWebHost():Promise<Readonly<PlatformWebHostStop>>{
 let registration=server[key];
 if(!registration){
  const original=beginOriginalPlatformWebHostPreparation();
  if(!original)throw new Error('Original platform web host factory required');
  // No factory/secret preparation occurs. Resolve only this registered host's
  // inert owner, so retirement before preparation seals the same original.
  registration=createRegisteredPlatformWebHost(original);
 }
 return registration.handle.retire();
}
