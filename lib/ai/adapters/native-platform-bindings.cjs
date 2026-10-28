'use strict';
// Explicit trusted Node construction captures only selected environment values.
// Importing does not read them, resolve DNS, grant access or select models/rates.
const nativeProcess=require('node:process');
const nativeDns=require('node:dns');
const {isIP}=require('node:net');
const {performance}=require('node:perf_hooks');
const {setTimeout,clearTimeout}=require('node:timers');
const refs=Object.freeze({anthropic:'env:ANTHROPIC_API_KEY',openai:'env:OPENAI_API_KEY'});
const hosts=Object.freeze({'api.anthropic.com':'anthropic','api.openai.com':'openai'});
const failure=code=>{const error=new Error('Original native platform binding unavailable');error.code='native_platform_'+code;return error;};
const fail=code=>{throw failure(code);};
const capture=(value,keys,required=keys)=>{
 if(!value||typeof value!=='object'||Array.isArray(value))fail('configuration');
 const descriptors=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(descriptors);
 if(names.some(key=>typeof key!=='string'||!keys.includes(key)||!Object.hasOwn(descriptors[key],'value'))
  ||required.some(key=>!Object.hasOwn(descriptors,key))
  ||keys.some(key=>key in value&&!Object.hasOwn(descriptors,key)))fail('configuration');
 return Object.fromEntries(names.map(key=>[key,descriptors[key].value]));
};
const selectedProviders=value=>{
 if(!Array.isArray(value))fail('configuration');
 const descriptors=Object.getOwnPropertyDescriptors(value),length=descriptors.length?.value;
 if(!Number.isSafeInteger(length)||length<1||length>2
  ||Reflect.ownKeys(descriptors).some(key=>!['0','1','length'].includes(key))
  ||Reflect.ownKeys(descriptors).length!==length+1)fail('configuration');
 const selected=[];
 for(let index=0;index<length;index++){
  const descriptor=descriptors[index];
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='string'
   ||!Object.hasOwn(refs,descriptor.value)||selected.includes(descriptor.value))fail('configuration');
  selected.push(descriptor.value);
 }
 return Object.freeze(selected);
};

function createNativePlatformBindings(input){
 const options=capture(input,['authorizeCredentialAccess','stopTimeoutMs','providerIds'],['authorizeCredentialAccess','stopTimeoutMs']);
 if(typeof options.authorizeCredentialAccess!=='function'||!Number.isSafeInteger(options.stopTimeoutMs)||options.stopTimeoutMs<1||options.stopTimeoutMs>30000)fail('configuration');
 // Omission preserves the original two-provider contract. An explicit list is
 // captured before any environment access; absent keys never select providers.
 const providerIds=Object.hasOwn(options,'providerIds')?selectedProviders(options.providerIds):Object.freeze(['anthropic','openai']);
 const credentialRefs=Object.freeze(Object.fromEntries(providerIds.map(providerId=>[providerId,refs[providerId]])));
 if(nativeProcess.release?.name!=='node'||typeof window!=='undefined'||typeof EdgeRuntime!=='undefined'
  ||nativeProcess.env.NEXT_RUNTIME!==undefined&&nativeProcess.env.NEXT_RUNTIME.trim()!=='nodejs')fail('runtime');
 const authorize=options.authorizeCredentialAccess,stopTimeoutMs=options.stopTimeoutMs,lookup=nativeDns.lookup;
 if(typeof lookup!=='function')fail('configuration');
 // Keep exact bytes, including whitespace. A later platform trim cannot replace
 // this original value; the provider owner separately validates API-key syntax.
 let passwords=Object.fromEntries(providerIds.map(providerId=>[providerId,nativeProcess.env[refs[providerId].slice(4)]]));
 if(Object.values(passwords).some(value=>typeof value!=='string'||value.length===0||value.length>16384||value.includes('\0'))){passwords=null;fail('credentials');}
 Object.freeze(passwords);
 const shutdown=new AbortController(),pending=new Set();
 let retired=false,originalStop;
 const check=signal=>{if(retired||shutdown.signal.aborted||signal?.aborted)fail('cancelled');};
 const signalFor=signal=>{
  if(!(signal instanceof AbortSignal))fail('configuration');check(signal);
  return AbortSignal.any([signal,shutdown.signal]);
 };
 const observe=(kind,promise)=>{
  const original={kind,promise};pending.add(original);
  void promise.finally(()=>pending.delete(original)).catch(()=>{});return promise;
 };
 const readCredential=input=>{
  const request=capture(input,['runtimeId','providerId','credentialRef','signal']);
  if(request.runtimeId!=='web'||typeof request.providerId!=='string'||!Object.hasOwn(credentialRefs,request.providerId)||request.credentialRef!==credentialRefs[request.providerId])fail('permissions');
  const providerId=request.providerId,credentialRef=request.credentialRef,signal=signalFor(request.signal);
  const grant=Object.freeze({kind:'read-native-platform-provider-credential',runtimeId:'web',providerId,credentialRef,signal});
  // Observe the actual authorizer return through its original promise. Abort
  // revokes use, but cannot manufacture settlement of an ignoring authorizer.
  const original=observe('credential',Promise.resolve().then(()=>{check(signal);return authorize(grant);}));
  return original.then(accepted=>{
   check(signal);if(accepted!==true||!passwords)fail('permissions');return passwords[providerId];
  },()=>{check(signal);fail('credentials');});
 };
 const resolveAddress=input=>{
  const request=capture(input,['hostname','signal']);
  if(typeof request.hostname!=='string'||!Object.hasOwn(hosts,request.hostname)||!Object.hasOwn(credentialRefs,hosts[request.hostname]))fail('permissions');
  const hostname=request.hostname,signal=signalFor(request.signal);
  let resolve,reject,completed=false;
  const callbackOriginal=new Promise((accept,deny)=>{resolve=accept;reject=deny;});
  observe('dns',callbackOriginal);
  try{
   // Fixed native lookup. It has no cancellation acknowledgement: even an
   // aborted consumer waits for this actual callback, never a timeout race.
   lookup.call(nativeDns,hostname,{family:4,all:true,verbatim:true},(error,addresses)=>{
    if(completed)return;completed=true;
    if(error)reject(failure('dns'));else resolve(addresses);
   });
  }catch{
   // A synchronous native invocation failure has no pending callback to await.
   if(!completed){completed=true;reject(failure('dns'));}
  }
  return callbackOriginal.then(addresses=>{
   check(signal);
   if(!Array.isArray(addresses)||addresses.length===0||addresses.length>256||addresses[0]?.family!==4||isIP(addresses[0]?.address)!==4)fail('dns');
   // Select the first native IPv4 answer once. Existing HTTPS capabilities
   // enforce public-address policy and actual TLS peer identity before bytes.
   return addresses[0].address;
  },()=>{check(signal);fail('dns');});
 };
 const stop=()=>{
  if(originalStop)return originalStop;
  const deadline=performance.now()+stopTimeoutMs,originals=[...pending];let finish,timer;
  originalStop=new Promise(resolve=>{finish=resolve;});retired=true;
  // Clear private captured references only. Native process.env and a key already
  // returned to its original caller are not represented as erased or revoked.
  passwords=null;
  const expired=new Promise(resolve=>{timer=setTimeout(()=>resolve(false),Math.max(0,deadline-performance.now()));});
  shutdown.abort();
  void Promise.race([Promise.allSettled(originals.map(original=>original.promise)).then(()=>true),expired]).then(complete=>{
   clearTimeout(timer);const drained=complete===true&&pending.size===0&&performance.now()<=deadline;
   finish(Object.freeze({drained,uncertain:!drained,closed:drained,pending:pending.size,credentialPending:[...pending].filter(original=>original.kind==='credential').length,dnsPending:[...pending].filter(original=>original.kind==='dns').length,capturedSecretsCleared:true,accepting:false,restartAllowed:false}));
  });
  return originalStop;
 };
 return Object.freeze({credentialRefs,readCredential,resolveAddress,stop});
}
module.exports={createNativePlatformBindings};
