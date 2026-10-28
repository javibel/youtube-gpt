'use strict';
const {createRoleConnectionOwner}=require('../../contracts/ai/v1/postgres-connections.cjs');
const {createOperationalWebComposition}=require('./operational-composition.cjs');
const {createNativeWebProviderOwner}=require('./adapters/native-provider-owner.cjs');
const {performance}=require('node:perf_hooks');
function nativePool(options){const {Pool}=require('pg');const pool=new Pool(options);pool.on('error',()=>{});return pool;}

// Trusted deployment code supplies credential readers, real adapters and native
// session/budget authorization. No environment lookup or model default exists.
function createOperationalWebDeployment(options={}){
 if(!options||Object.keys(options).some(key=>!['database','runtime'].includes(key)))throw Error('Explicit original web deployment required');
 if(!options.runtime||typeof options.runtime!=='object'||Array.isArray(options.runtime))throw Error('Original web runtime required');
 const {nativeProviders,...runtime}=options.runtime;
 if(nativeProviders!==undefined&&(Object.hasOwn(runtime,'adapters')||Object.hasOwn(runtime,'checkCredential')||Object.hasOwn(runtime,'checkModelAvailability')))throw Error('Native web providers cannot share injected adapter capabilities');
 const providers=nativeProviders===undefined?null:createNativeWebProviderOwner(nativeProviders);
 const providerStopTimeoutMs=providers?nativeProviders.stopTimeoutMs:0;
 if(providers){runtime.adapters=providers.adapters;runtime.checkCredential=providers.checkCredential;runtime.checkModelAvailability=providers.checkModelAvailability;}
 const owner=createRoleConnectionOwner({...options.database,surface:'web',createPool:nativePool});
 const shutdown=new AbortController();
 let bound,original,originalSignal,stopped=false,closing,retirement,retirementDeadline;
 const connect=role=>async context=>{if(!bound||stopped)throw Error('Original web role connections unavailable');return bound.connections[role](context);};
 const composition=createOperationalWebComposition({...runtime,connections:{reader:connect('reader'),activator:connect('activator'),executor:connect('executor')},databaseName:options.database.databaseName,timeoutMs:options.database.timeoutMs});
 const assertOpen=()=>{if(stopped)throw Error('Web deployment is retired');};
 // Seal native providers immediately, independently of an ingress drain. Pool
 // destruction remains a separate action after original work has been observed.
 const retire=()=>{
  if(retirement)return retirement;
  let resolveRetirement,rejectRetirement;
  retirement=new Promise((resolve,reject)=>{resolveRetirement=resolve;rejectRetirement=reject;});
  stopped=true;retirementDeadline=performance.now()+providerStopTimeoutMs;
  try{shutdown.abort();resolveRetirement(providers?providers.stop():Object.freeze({drained:true,uncertain:false}));}catch(error){rejectRetirement(error);}
  return retirement;
 };
 const close=()=>{
  if(closing)return closing;
  let resolveClose,rejectClose;
  closing=new Promise((resolve,reject)=>{resolveClose=resolve;rejectClose=reject;});
  try{
   const retiring=retire(),deadline=retirementDeadline;
   if(!providers){resolveClose(owner.close());return closing;}
   resolveClose(Promise.resolve().then(async()=>{
   const wait=async operation=>{let timer;try{return await Promise.race([operation,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),Math.max(0,deadline-performance.now()));})]);}finally{clearTimeout(timer);}};
   const providerResult=await wait(retiring.catch(()=>null));
   if(providerResult?.drained!==true||performance.now()>=deadline)return Object.freeze({closed:false,poolCount:0,poolCountKnown:false,poolsClosed:false,drained:false,uncertain:true,providers:providerResult,retainedClaims:true,restartAllowed:false});
   // One total provider/connection deadline, never a fresh pool-close budget.
   const pools=await wait(owner.close().catch(()=>null));
   const drained=pools?.closed===true&&performance.now()<=deadline;
   return Object.freeze({closed:drained,poolCount:pools?.poolCount??0,poolCountKnown:pools!==null,poolsClosed:drained,drained,uncertain:!drained,providers:providerResult,retainedClaims:true,restartAllowed:false});
   }));
  }catch(error){rejectClose(error);}
  return closing;
 };
 return Object.freeze({dependencies:composition.dependencies,assertOpen,retire,prepare({signal}={}){
  if(signal!==undefined&&!(signal instanceof AbortSignal))throw Error('Original web deployment signal required');
  if(original){if(signal!==originalSignal)throw Error('Web deployment already has an original waiter');return original;}
  originalSignal=signal;const ownedSignal=signal?AbortSignal.any([signal,shutdown.signal]):shutdown.signal;
  original=Promise.resolve().then(async()=>{assertOpen();bound=await owner.prepare({signal:ownedSignal});assertOpen();const prepared=await composition.prepare({signal:ownedSignal});assertOpen();return prepared;});void original.catch(()=>{void close();});return original;
 },close});
}
module.exports={createOperationalWebDeployment};
