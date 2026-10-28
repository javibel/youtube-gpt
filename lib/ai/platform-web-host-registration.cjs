'use strict';
// Native Node preloading API. Import and registration are inert: no environment,
// module path, TypeScript loader, secret, pool, provider or deployment is used.
const key=Symbol.for('ytubviral.ai.platform-web-host-factory.v1');
const consumed=Symbol.for('ytubviral.ai.platform-web-host-factory-consumed.v1');
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
module.exports={registerOriginalPlatformWebHostFactory,getOriginalPlatformWebHostFactory,beginOriginalPlatformWebHostPreparation};
