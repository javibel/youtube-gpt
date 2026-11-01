'use strict';
// Trusted Node server bootstrap. Importing is inert. The
// explicit factory captures exactly three native environment values; no URL,
// administrator credential, caller-supplied reader or serialized grant exists.
const nativeProcess=require('node:process');
const {performance}=require('node:perf_hooks');
const {types}=require('node:util');
const {createOperationalWebDeployment}=require('./operational-deployment.cjs');
const names=Object.freeze({reader:'ytv_ai_reader',activator:'ytv_ai_activator',executor:'ytv_ai_executor'});
const fail=code=>{const e=new Error('Original platform web deployment not confirmed');e.code='platform_web_'+code;throw e;};
const record=(value,allowed,required=allowed)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getOwnPropertySymbols(value).length||Object.keys(value).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(value,k))||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')))fail('configuration');
 return {...value};
};
const bounded=(n,min=1,max=30000)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
function createPlatformWebDeployment(input){
 if(nativeProcess.release?.name!=='node'||typeof window!=='undefined'||typeof EdgeRuntime!=='undefined'||(nativeProcess.env.NEXT_RUNTIME!==undefined&&nativeProcess.env.NEXT_RUNTIME.trim()!=='nodejs'))fail('runtime');
 const options=record(input,['database','runtime','authorizeRoleAccess','sealAndDrainIngress','prepareTimeoutMs','stopTimeoutMs','observerSigning'],['database','runtime','authorizeRoleAccess','sealAndDrainIngress','prepareTimeoutMs','stopTimeoutMs']);
 const db=Object.freeze(record(options.database,['host','port','databaseName','timeoutMs','maxConnections']));
 if(typeof db.host!=='string'||!/^[A-Za-z0-9.-]{1,253}$/.test(db.host)||!bounded(db.port,1,65535)||typeof db.databaseName!=='string'||!db.databaseName.trim()||db.databaseName.length>128||!bounded(db.timeoutMs)||!bounded(db.maxConnections,1,10)||!bounded(options.prepareTimeoutMs,100)||!bounded(options.stopTimeoutMs)||typeof options.authorizeRoleAccess!=='function'||typeof options.sealAndDrainIngress!=='function')fail('configuration');
 const r=record(options.runtime,['adapters','taskCatalog','policies','budgetBindings','operatingBudget','authorize','getRuntimes','checkCredential','checkModelAvailability','catalogAdapters','nativeProviders','image','administrativeAgentReadiness'],['taskCatalog','policies','budgetBindings','operatingBudget','authorize']);
 const authorize=options.authorizeRoleAccess,sealAndDrainIngress=options.sealAndDrainIngress;
 if(typeof r.authorize!=='function'||(r.getRuntimes!==undefined&&typeof r.getRuntimes!=='function')||(r.checkCredential!==undefined&&typeof r.checkCredential!=='function')||(r.checkModelAvailability!==undefined&&typeof r.checkModelAvailability!=='function'))fail('configuration');
 if(r.nativeProviders!==undefined){if(['adapters','checkCredential','checkModelAvailability'].some(key=>Object.hasOwn(r,key)))fail('configuration');}
 else if(typeof r.checkModelAvailability!=='function')fail('configuration');
 let agentReadiness;
 if(r.administrativeAgentReadiness!==undefined){
  if(types.isProxy(r.administrativeAgentReadiness))fail('configuration');
  agentReadiness=record(r.administrativeAgentReadiness,['checkCredential','checkModelAvailability']);
  if(Object.values(agentReadiness).some(fn=>typeof fn!=='function'||types.isProxy(fn)))fail('configuration');
  agentReadiness=Object.fromEntries(Object.entries(agentReadiness).map(([k,fn])=>[k,fn.bind(r.administrativeAgentReadiness)]));
 }
 // A separate host-owned signing capability;never a provider key,role password,
 // enrollment operation or callback supplied by an HTTP body. Capture only.
 let signing,observerContract,observerIdentity,lastSigningTime=-Infinity;
 if(options.observerSigning!==undefined){
  if(types.isProxy(options.observerSigning))fail('configuration');
  const p=record(options.observerSigning,['policy','identity','clock','authorizeSigning','sign','stop']);
  if(['clock','authorizeSigning','sign','stop'].some(k=>typeof p[k]!=='function'||types.isProxy(p[k])))fail('configuration');
  const {createObserverEnvelopeContract}=require('../../contracts/ai/v1/observer-channel.cjs');
  observerContract=createObserverEnvelopeContract(p.policy);
  if(types.isProxy(p.identity))fail('configuration');
  const identity=record(p.identity,['peerId','keyId','spkiSha256']);
  if(identity.peerId!==p.policy.requester.peerId||identity.keyId!==p.policy.requester.keyId||typeof identity.spkiSha256!=='string'||!/^[a-f0-9]{64}$/.test(identity.spkiSha256))fail('configuration');
  observerIdentity=Object.freeze(identity);
  signing=Object.freeze(Object.fromEntries(['clock','authorizeSigning','sign','stop'].map(k=>[k,p[k].bind(options.observerSigning)])));
 }
 // Capture BEFORE the caller yields or instrumentation normalizes process.env.
 // Whitespace and newlines belong to the password and are never trimmed.
 const environment=nativeProcess.env;
 let passwords={reader:environment.YTV_AI_READER_PASSWORD,activator:environment.YTV_AI_ACTIVATOR_PASSWORD,executor:environment.YTV_AI_EXECUTOR_PASSWORD};
 if(Object.values(passwords).some(p=>typeof p!=='string'||!p.length||p.length>16384||p.includes('\0'))){passwords=null;fail('credentials');}
 Object.freeze(passwords);
 const shutdown=new AbortController(),pending=new Set();
 let sealed=false,preparing=false,preparation,preparationWork,originalSignal,signalCaptured=false,closing,retirement,retirementDeadline;
 const check=()=>{if(sealed||shutdown.signal.aborted)fail('cancelled');};
 const call=(fn,args=[],receiver)=>{
  check();const work=Promise.resolve().then(()=>{check();return fn.apply(receiver,args);}).then(value=>{check();return value;});
  pending.add(work);void work.finally(()=>pending.delete(work)).catch(()=>{});return work;
 };
 const combine=signal=>signal?AbortSignal.any([signal,shutdown.signal]):shutdown.signal;
 const callback=(fn,withSignal=false)=>(...args)=>call(fn,withSignal&&args[0]&&typeof args[0]==='object'?[{...args[0],signal:combine(args[0].signal)},...args.slice(1)]:args);
 const signingRequests=new Set(),signingNonces=new Set();
 const signObserverRequest=(request,invocation={})=>{
  check();if(!signing)fail('permissions');if(types.isProxy(invocation)||Array.isArray(invocation))fail('configuration');
  const {signal}=record(invocation,['signal'],[]);if(signal!==undefined&&(!(signal instanceof AbortSignal)||types.isProxy(signal)||signal.aborted))fail('cancelled');
  // Snapshot exactly the validated canonical unsigned bytes before any await.
  // This snapshot is data;only the live original authorizeSigning may consent.
  const signingText=observerContract.requestSigningText(request),prefix='YTV-OBSERVER-ENVELOPE\nytv-observer-envelope-v1\nrequest\n';
  if(!signingText.startsWith(prefix))fail('configuration');
  const unsigned=JSON.parse(signingText.slice(prefix.length));Object.freeze(unsigned.requester);Object.freeze(unsigned.responder);Object.freeze(unsigned);
  const local=new AbortController(),ownedSignal=AbortSignal.any([shutdown.signal,local.signal,...(signal?[signal]:[])]),time=()=>{const n=Date.prototype.getTime.call(signing.clock());if(!Number.isSafeInteger(n)||n<lastSigningTime)fail('deadline');lastSigningTime=n;return n;};
  const checkSigning=()=>{check();if(ownedSignal.aborted)fail('cancelled');const n=time();if(n<unsigned.issuedAt||n>=unsigned.deadline)fail('deadline');};
  checkSigning();if(signingRequests.has(unsigned.requestId)||signingNonces.has(unsigned.nonce)||signingRequests.size>=5)fail('permissions');
  // Negative owner-local guards only;not durable claims or enrollment authority.
  signingRequests.add(unsigned.requestId);signingNonces.add(unsigned.nonce);
  const context=Object.freeze({kind:'sign-original-observer-request-v1',purpose:unsigned.purpose,identity:observerIdentity,request:unsigned,signingText,signal:ownedSignal});
  const original=call(async()=>{checkSigning();if(await signing.authorizeSigning(context)!==true)fail('permissions');checkSigning();const signature=await signing.sign(context);checkSigning();return Object.freeze({scope:'signature-only-no-authority',trust:'untrusted-observer-data',identity:observerIdentity,wire:observerContract.encodeRequest(unsigned,signature)});});
  // Cancelling the borrower never removes the original signer/consent promise
  // retained by call() from this deployment's existing pending tracker.
  let cancelled;const retired=new Promise((_,reject)=>{cancelled=()=>reject(failureForSigningCancellation());ownedSignal.addEventListener('abort',cancelled,{once:true});if(ownedSignal.aborted)cancelled();});
  const timer=setTimeout(()=>local.abort(),Math.min(30000,unsigned.deadline-lastSigningTime));
  return Promise.race([original,retired]).finally(()=>{clearTimeout(timer);ownedSignal.removeEventListener('abort',cancelled);});
 };
 const failureForSigningCancellation=()=>Object.assign(new Error('Original observer signing borrower cancelled;original waiter retained'),{code:'platform_web_cancelled'});
 r.authorize=callback(r.authorize);
 if(r.getRuntimes)r.getRuntimes=callback(r.getRuntimes);
 if(r.checkCredential)r.checkCredential=callback(r.checkCredential,true);
 if(r.checkModelAvailability)r.checkModelAvailability=callback(r.checkModelAvailability,true);
 if(agentReadiness)r.administrativeAgentReadiness=Object.freeze({checkCredential:callback(agentReadiness.checkCredential,true),checkModelAvailability:callback(agentReadiness.checkModelAvailability,true)});
 if(r.image!==undefined){
  if(types.isProxy(r.image)||types.isProxy(r.image?.transport))fail('configuration');
  const image=record(r.image,['models','pricing','credentialRef','transport','preflight','priceUsage','checkCredential','checkModelAvailability','stop','stopTimeoutMs']),transport=record(image.transport,['create']);
  if(['preflight','priceUsage','checkCredential','checkModelAvailability','stop'].some(k=>typeof image[k]!=='function'||types.isProxy(image[k]))||typeof transport.create!=='function'||types.isProxy(transport.create))fail('configuration');
  const create=transport.create.bind(image.transport);
  r.image={...image,transport:Object.freeze({create:(payload,options={})=>call(create,[payload,{...options,signal:combine(options.signal)}])}),preflight:callback(image.preflight.bind(image),true),priceUsage:callback(image.priceUsage.bind(image)),checkCredential:callback(image.checkCredential.bind(image),true),checkModelAvailability:callback(image.checkModelAvailability.bind(image),true),stop:image.stop.bind(image)};
 }
 if(r.adapters!==undefined){if(!Array.isArray(r.adapters))fail('configuration');r.adapters=r.adapters.map(adapter=>{if(typeof adapter?.execute!=='function')fail('configuration');const execute=adapter.execute.bind(adapter);return {...adapter,execute:context=>call(execute,[{...context,signal:combine(context?.signal)}])};});}
 const getPassword=async request=>{
  check();if(request?.surface!=='web'||!Object.hasOwn(names,request.role)||request.user!==names[request.role]||request.signal?.aborted)fail('permissions');
  const role=request.role,user=request.user,signal=combine(request.signal);
  if(await call(authorize,[Object.freeze({kind:'read-platform-role-password',surface:'web',host:db.host,port:db.port,databaseName:db.databaseName,role,user,signal})])!==true)fail('permissions');
  check();if(signal.aborted||!passwords)fail('cancelled');return passwords[role];
 };
 const native=createOperationalWebDeployment({database:Object.freeze({...db,getPassword}),runtime:r});
 const nativePrepare=native.prepare.bind(native),nativeClose=native.close.bind(native),nativeRetire=native.retire.bind(native),nativeAssert=native.assertOpen.bind(native);
 const assertOpen=()=>{check();nativeAssert();};
 const guardDatabase=database=>Object.freeze({...database,transaction:(work,options={})=>call(database.transaction,[work,{...options,signal:combine(options.signal)}],database)});
 const dependencies=Object.freeze({...native.dependencies,readerDatabase:guardDatabase(native.dependencies.readerDatabase),activatorDatabase:guardDatabase(native.dependencies.activatorDatabase),executorDatabase:guardDatabase(native.dependencies.executorDatabase)});
 const guardStore=store=>Object.freeze(Object.fromEntries(Object.entries(store).map(([key,value])=>[key,typeof value==='function'?(...args)=>call(value,args,store):value])));
 const wait=async(operation,deadline)=>{let timer;try{return await Promise.race([operation,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),Math.max(0,deadline-performance.now()));})]);}finally{clearTimeout(timer);}};
 const retire=()=>{
  if(retirement)return retirement;
  let resolveRetirement,rejectRetirement;
  retirement=new Promise((resolve,reject)=>{resolveRetirement=resolve;rejectRetirement=reject;});
  retirementDeadline=performance.now()+options.stopTimeoutMs;sealed=true;passwords=null;
  try{
   shutdown.abort();const providers=nativeRetire();
   if(!signing)resolveRetirement(providers);
   else{const originalSigningStop=Promise.resolve().then(()=>signing.stop());resolveRetirement(Promise.all([providers,originalSigningStop]).then(([providerResult,signingResult])=>Object.freeze({...providerResult,drained:providerResult.drained===true&&signingResult?.drained===true&&signingResult?.uncertain!==true,observerSigningDrained:signingResult?.drained===true&&signingResult?.uncertain!==true})));}
  }catch(error){rejectRetirement(error);}
  return retirement;
 };
 const close=()=>{
  if(closing)return closing;
  let resolveClose,rejectClose;
  closing=new Promise((resolve,reject)=>{resolveClose=resolve;rejectClose=reject;});
  try{
   const providerRetirement=retire(),deadline=retirementDeadline;void providerRetirement.catch(()=>{});
   resolveClose(Promise.resolve().then(async()=>{
   const drainController=new AbortController();
   const ingress=Promise.resolve().then(()=>sealAndDrainIngress({signal:drainController.signal}));void ingress.catch(()=>{});
   const originals=[...pending,...(preparationWork?[preparationWork]:[])];
   const observed=await wait(Promise.all([Promise.allSettled(originals),ingress,providerRetirement]).then(([,result,providers])=>({ingress:result,providers})).catch(()=>null),deadline);drainController.abort();
   if(!observed||observed.ingress.drained!==true||observed.providers.drained!==true||pending.size||preparing||performance.now()>=deadline)return Object.freeze({drained:false,uncertain:true,closed:false,poolsClosed:false,poolCount:0,poolCountKnown:false,pending:pending.size,preparationPending:preparing,retainedClaims:true,restartAllowed:false});
   const pools=await wait(nativeClose().catch(()=>null),deadline),drained=pools?.closed===true&&performance.now()<=deadline;
   return Object.freeze({drained,uncertain:!drained,closed:drained,poolsClosed:drained,poolCount:pools?.poolCount??0,poolCountKnown:pools!==null&&pools.poolCountKnown!==false,pending:pending.size,retainedClaims:true,restartAllowed:false});
   }));
  }catch(error){rejectClose(error);}
  return closing;
 };
 const captureSignal=signal=>{
  if(signal!==undefined&&!(signal instanceof AbortSignal))fail('configuration');check();
  if(signalCaptured){if(signal!==originalSignal)fail('permissions');return;}
  signalCaptured=true;originalSignal=signal;
  if(signal?.aborted){void close().catch(()=>{});fail('cancelled');}
  signal?.addEventListener('abort',()=>{void close().catch(()=>{});},{once:true});
 };
 const prepare=({signal}={})=>{
  captureSignal(signal);if(preparation)return preparation;
  let timer,rejectCancelled;
  const cancelled=new Promise((_,reject)=>{rejectCancelled=()=>{try{fail('cancelled');}catch(e){reject(e);}};shutdown.signal.addEventListener('abort',rejectCancelled,{once:true});});void cancelled.catch(()=>{});
  preparationWork=Promise.resolve().then(async()=>{preparing=true;try{
   check();if(await call(authorize,[Object.freeze({kind:'prepare-platform-web-deployment',surface:'web',host:db.host,port:db.port,databaseName:db.databaseName,roles:Object.freeze(['reader','activator','executor']),signal:shutdown.signal})])!==true)fail('permissions');
   check();const prepared=await nativePrepare({signal:shutdown.signal});assertOpen();
   const factory=identity=>call(async()=>{const task=await prepared.factory(identity);assertOpen();const methods=Object.fromEntries(['create','retrieve'].filter(key=>typeof task[key]==='function').map(key=>{const original=task[key].bind(task);return [key,(parameters,options={})=>call(original,[parameters,{...options,signal:combine(options.signal)}])];}));return Object.freeze({...task,...methods});});
   return Object.freeze({...prepared,factory,configurationDependencies:Object.freeze({...prepared.configurationDependencies,reader:guardStore(prepared.configurationDependencies.reader),activator:guardStore(prepared.configurationDependencies.activator)})});
  }finally{preparing=false;}});void preparationWork.catch(()=>{});
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{try{fail('deadline');}catch(e){reject(e);}void close().catch(()=>{});},options.prepareTimeoutMs);});void deadline.catch(()=>{});
  preparation=Promise.race([preparationWork,cancelled,deadline]).finally(()=>{clearTimeout(timer);shutdown.signal.removeEventListener('abort',rejectCancelled);});void preparation.catch(()=>{void close().catch(()=>{});});return preparation;
 };
 return Object.freeze({dependencies,assertOpen,retire,prepare,close,signObserverRequest});
}
module.exports={createPlatformWebDeployment};
