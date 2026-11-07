'use strict';
// Explicit trusted Node construction captures only selected environment values.
// Importing does not read them, resolve DNS, grant access or select models/rates.
const nativeProcess=require('node:process');
const nativeDns=require('node:dns');
const {isIP}=require('node:net');
const {performance}=require('node:perf_hooks');
const {setTimeout,clearTimeout}=require('node:timers');
const {types}=require('node:util');
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
 const options=capture(input,['authorizeCredentialAccess','stopTimeoutMs','providerIds','observerIdentity'],['authorizeCredentialAccess','stopTimeoutMs']);
 if(typeof options.authorizeCredentialAccess!=='function'||!Number.isSafeInteger(options.stopTimeoutMs)||options.stopTimeoutMs<1||options.stopTimeoutMs>30000)fail('configuration');
 // Omission preserves the original two-provider contract. An explicit list is
 // captured before any environment access; absent keys never select providers.
 const providerIds=Object.hasOwn(options,'providerIds')?selectedProviders(options.providerIds):Object.freeze(['anthropic','openai']);
 const credentialRefs=Object.freeze(Object.fromEntries(providerIds.map(providerId=>[providerId,refs[providerId]])));
 // This captures only original data/functions.No observation key orclock isread.
 let observer,observerContract,observerPolicy,observerIdentity;
 if(Object.hasOwn(options,'observerIdentity')){
  if(types.isProxy(options.observerIdentity))fail('configuration');
  const p=capture(options.observerIdentity,['policy','identity','clock','authorizeSigning','authorizeIdentityAccess']);
  if(['clock','authorizeSigning','authorizeIdentityAccess'].some(k=>typeof p[k]!=='function'||types.isProxy(p[k])))fail('configuration');
  observerContract=require('../../../contracts/ai/v1/observer-channel.cjs').createObserverEnvelopeContract(p.policy);
  observerPolicy=structuredClone(p.policy);Object.freeze(observerPolicy.models);Object.freeze(observerPolicy.requester);Object.freeze(observerPolicy.responder);Object.freeze(observerPolicy);
  if(types.isProxy(p.identity))fail('configuration');const identity=capture(p.identity,['peerId','keyId','spkiSha256']);
  if(identity.peerId!==observerPolicy.requester.peerId||identity.keyId!==observerPolicy.requester.keyId||typeof identity.spkiSha256!=='string'||!/^[a-f0-9]{64}$/.test(identity.spkiSha256))fail('configuration');observerIdentity=Object.freeze(identity);
  observer=Object.freeze(Object.fromEntries(['clock','authorizeSigning','authorizeIdentityAccess'].map(k=>[k,p[k].bind(options.observerIdentity)])));
 }
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
 const signingRequests=new Set(),signingNonces=new Set();let lastSigningTime=-Infinity,signingWindow;
 const signObserver=context=>{
  if(!observer)fail('permissions');if(!context||types.isProxy(context)||!Object.isFrozen(context))fail('configuration');
  const c=capture(context,['kind','purpose','identity','request','signingText','signal']);if(types.isProxy(c.identity))fail('configuration');const identity=capture(c.identity,['peerId','keyId','spkiSha256']);
  if(c.kind!=='sign-original-observer-request-v1'||c.purpose!=='agent-readiness-observation'||Object.keys(observerIdentity).some(k=>identity[k]!==observerIdentity[k]))fail('permissions');
  const text=observerContract.requestSigningText(c.request);if(text!==c.signingText||Buffer.byteLength(text)>65536)fail('permissions');
  const prefix='YTV-OBSERVER-ENVELOPE\nytv-observer-envelope-v1\nrequest\n',request=JSON.parse(text.slice(prefix.length));Object.freeze(request.requester);Object.freeze(request.responder);Object.freeze(request);
  const signal=signalFor(c.signal),clock=()=>{const n=Date.prototype.getTime.call(observer.clock());if(!Number.isSafeInteger(n)||n<lastSigningTime)fail('deadline');lastSigningTime=n;return n;},checkSigning=()=>{check(signal);const n=clock();if(n<request.issuedAt||n>=request.deadline)fail('deadline');};
  checkSigning();if(signingRequests.has(request.requestId)||signingNonces.has(request.nonce)||signingRequests.size>=10085)fail('permissions');
  if(!signingWindow||signingWindow.issuedAt!==request.issuedAt||signingWindow.deadline!==request.deadline){
   if(signingWindow&&(request.issuedAt<signingWindow.deadline||[...pending].some(p=>p.kind==='observer-signing')))fail('permissions');
   signingWindow={issuedAt:request.issuedAt,deadline:request.deadline,count:0};
  }
  if(signingWindow.count>=5)fail('permissions');signingWindow.count++;
  // Retained replay guards never reset;the finite lifetime bound above covers
  // one initial batch plus seven days at the maximum five-minute cadence.
  signingRequests.add(request.requestId);signingNonces.add(request.nonce);
  const crypto=require('node:crypto'),textDigest=crypto.createHash('sha256').update(text,'utf8').digest('hex');
  const grant=phase=>Object.freeze({kind:'use-native-platform-observer-identity',phase,binding:'env:YTV_AI_OBSERVER_SIGNING_PRIVATE_KEY',purpose:c.purpose,identity:observerIdentity,requestId:request.requestId,nonce:request.nonce,configurationRevision:request.configurationRevision,configurationDigest:request.configurationDigest,signingTextDigest:textDigest,signingTextBytes:Buffer.byteLength(text),signal});
  let der,key,encoded;
  const work=Promise.resolve().then(async()=>{
   checkSigning();if(await observer.authorizeIdentityAccess(grant('read-private-key'))!==true)fail('permissions');checkSigning();
   // Fixed original environment binding,never a key/ref selected bya body.
   encoded=nativeProcess.env.YTV_AI_OBSERVER_SIGNING_PRIVATE_KEY;
   if(typeof encoded!=='string'||!/^[A-Za-z0-9+/]{64}$/.test(encoded))fail('credentials');
   der=Buffer.from(encoded,'base64');if(der.length!==48||der.toString('base64')!==encoded||der.subarray(0,16).toString('hex')!=='302e020100300506032b657004220420')fail('credentials');
   key=crypto.createPrivateKey({key:der,format:'der',type:'pkcs8'});if(key.asymmetricKeyType!=='ed25519')fail('credentials');
   const publicDer=crypto.createPublicKey(key).export({type:'spki',format:'der'});if(publicDer.length!==44||crypto.createHash('sha256').update(publicDer).digest('hex')!==observerIdentity.spkiSha256)fail('credentials');
   checkSigning();if(await observer.authorizeIdentityAccess(grant('sign-request'))!==true)fail('permissions');checkSigning();
   const signature=await new Promise((resolve,reject)=>crypto.sign(null,Buffer.from(text,'utf8'),key,(error,bytes)=>error?reject(failure('observer_signing')):resolve(bytes)));
   checkSigning();if(!Buffer.isBuffer(signature)||signature.length!==64)fail('observer_signing');return signature.toString('base64url');
  }).finally(()=>{der?.fill(0);key=null;encoded=null;});
  return observe('observer-signing',work);
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
 const observerSigning=observer?Object.freeze({policy:observerPolicy,identity:observerIdentity,clock:observer.clock,authorizeSigning:observer.authorizeSigning,sign:signObserver,stop}):undefined;
 return Object.freeze({credentialRefs,readCredential,resolveAddress,stop,...(observerSigning?{observerSigning}:{})});
}
module.exports={createNativePlatformBindings};
