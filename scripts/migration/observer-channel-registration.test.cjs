'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const repo=path.resolve(__dirname,'../..'),results=[];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),defer=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};},tick=()=>new Promise(r=>setImmediate(r));
function fixture({channel=true,queryGate,signingAllowed=true,malformedChannel}={}){
 const web=crypto.generateKeyPairSync('ed25519'),agent=crypto.generateKeyPairSync('ed25519'),state={bindings:0,prepares:0,signatures:0,auth:0,queries:0,closeCalls:0,nativeSignals:[],enrollment:0};
 const policy={runtimeId:'agent',providerId:'anthropic',credentialRef:'synthetic:credential',models:['synthetic-model'],configurationRevision:'synthetic-v1',configurationDigest:'a'.repeat(64),requester:{peerId:'web:synthetic',keyId:'web:key'},responder:{peerId:'agent:synthetic',keyId:'agent:key'}};
 const pins={requester:{...policy.requester,publicKey:web.publicKey,spkiSha256:hash(web.publicKey.export({type:'spki',format:'der'}))},responder:{...policy.responder,publicKey:agent.publicKey,spkiSha256:hash(agent.publicKey.export({type:'spki',format:'der'}))}};
 const source={policy,pins,clock(){assert.equal(this,source);return new Date();},verifyAgentOriginal(){assert.equal(this,source);state.enrollment++;return true;}};
 const database={role:'executor',controlSchema:'ytv_ai_v1',transaction:async()=>{throw Error('Legacy not allowed');},transactionOriginal(work,{signal}){
  state.nativeSignals.push(signal);let rejectCancel;
  const cancelled=new Promise((_,reject)=>rejectCancel=reject),abort=()=>rejectCancel(Error('synthetic-native-borrower-aborted'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  const original=Promise.resolve().then(()=>work({query:async()=>{state.queries++;if(queryGate)await queryGate.promise;if(signal.aborted)throw Error('synthetic-native-original-aborted');return[];}}));
  const result=Promise.race([original,cancelled]).finally(()=>signal.removeEventListener('abort',abort));void result.catch(()=>{});
  return Object.freeze({result,settled:original.then(()=>{},()=>{})});
 }};
 const input={deployment:{database:{host:'synthetic.invalid',port:5432,databaseName:'synthetic',timeoutMs:1000,maxConnections:1},runtime:{taskCatalog:{},policies:{},budgetBindings:{},operatingBudget:{},authorize:()=>false},authorizeRoleAccess:()=>false,sealAndDrainIngress:async()=>({drained:true}),prepareTimeoutMs:100,stopTimeoutMs:25,
 observerSigning:{policy,identity:{...policy.requester,spkiSha256:pins.requester.spkiSha256},clock:()=>new Date(),authorizeSigning:async()=>{state.auth++;return signingAllowed;},sign:async c=>{state.signatures++;return crypto.sign(null,Buffer.from(c.signingText),web.privateKey).toString('base64url');},stop:async()=>({drained:true,uncertain:false})},...(channel?{observerChannel:malformedChannel??source}:{})},
 providers:{stopTimeoutMs:25,anthropic:{models:{'synthetic-model':{verified:true,executors:['ai'],capabilities:['text']}},preflight:async()=>{},priceUsage:()=>{},credentialTimeoutMs:100,callTimeoutMs:100,maxRequestBytes:1024,maxResponseBytes:1024,apiVersion:'2023-06-01',workspaceId:null}},authorizeCredentialAccess:async()=>false,bindingStopTimeoutMs:25};
 const registrationFile=path.join(repo,'lib/ai/platform-web-host-registration.cjs'),registration={exports:{}},r=requireFrom(registrationFile);
 vm.runInNewContext(fs.readFileSync(registrationFile,'utf8'),{module:registration,exports:registration.exports,require:r,AbortController,AbortSignal,Object,Array,JSON,Reflect},{filename:registrationFile});
 registration.exports.registerOriginalNativePlatformWebHostConfiguration(input,{prepareTimeoutMs:100,stopTimeoutMs:25});
 const registered=registration.exports.getOriginalPlatformWebHostFactory();
 const options=registered.factory({signal:new AbortController().signal,createNativePlatformBindings:()=>{state.bindings++;return{credentialRefs:{anthropic:'synthetic:credential'},readCredential:async()=>{throw Error('No credentials');},resolveAddress:async()=>{throw Error('No DNS');}};}});
 let installed;
 const file=path.join(repo,'lib/ai/platform-web-deployment.cjs'),entry={exports:{}},actual=requireFrom(file);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:entry,exports:entry.exports,require:id=>id==='node:process'?{release:{name:'node'},env:{YTV_AI_READER_PASSWORD:'synthetic-reader',YTV_AI_ACTIVATOR_PASSWORD:'synthetic-activator',YTV_AI_EXECUTOR_PASSWORD:'synthetic-executor'}}:id==='./operational-deployment.cjs'?{createOperationalWebDeployment:()=>({dependencies:{readerDatabase:database,activatorDatabase:database,executorDatabase:database},assertOpen:()=>{},prepare:async()=>{state.prepares++;throw Error('No operational prepare');},retire:async()=>({drained:true,uncertain:false}),close:async()=>{state.closeCalls++;return{closed:true,poolsClosed:true,drained:true,poolCount:0};}})}:id==='./observer-channel-runtime.cjs'?{installObserverChannel:original=>{if(installed)throw Error('Duplicate install');installed=original;}}:actual(id),AbortController,AbortSignal,Object,Array,JSON,Reflect,setTimeout,clearTimeout},{filename:file});
 const owner=entry.exports.createPlatformWebDeployment(options);
 return{state,owner,service:installed,options,source,policy,pins};
}
function requireFrom(file){return createRequire(file);}
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',code:typeof error?.code==='string'?error.code:String(error?.name||'FIXED_REGISTRATION_FAILURE'),frames:typeof error?.stack==='string'?error.stack.split('\n').slice(1,4):[]});}}
(async()=>{
 await test('optional original registration reaches actual platform constructor and installs same-owner channel without preparing runtime',async()=>{
  const f=fixture();assert(f.options.observerChannel);assert(f.service);assert.equal(f.state.bindings,1);assert.equal(f.state.prepares,0);assert.equal(f.state.auth,0);assert.equal(f.state.queries,0);
  const done=await f.service.create({actor:'admin_'+'a'.repeat(64),signal:new AbortController().signal});assert.equal(done.length,2);assert.equal(f.state.signatures,2);assert.equal(f.state.queries,2);assert.equal((await f.owner.close()).drained,true);
 });
 await test('legacy omitted channel stays uninstalled and JSON/getter/proxy cannot replace original constructor capabilities',async()=>{
  const f=fixture({channel:false});assert.equal(f.service,undefined);assert.equal(f.state.auth,0);await f.owner.close();
  let calls=0;const invalid={get policy(){calls++;throw Error('getter');},pins:{},clock:()=>new Date(),verifyAgentOriginal:()=>true};assert.throws(()=>fixture({malformedChannel:invalid}));assert.equal(calls,0);
  assert.throws(()=>fixture({malformedChannel:{policy:{},pins:{},clock:true,verifyAgentOriginal:true}}));assert.throws(()=>fixture({malformedChannel:new Proxy({},{get(){calls++;throw Error('proxy');}})}));assert.equal(calls,0);
 });
 await test('original signing refusal remains effective after channel installation; no database write or synthetic grant substitution',async()=>{
  const f=fixture({signingAllowed:false});await assert.rejects(()=>f.service.create({actor:'admin_'+'b'.repeat(64),signal:new AbortController().signal}));assert.equal(f.state.signatures,0);assert.equal(f.state.queries,0);assert.equal(f.state.prepares,0);await f.owner.close();
 });
 await test('platform retirement aborts SAME linked native database signal and retains original settlement before pool close',async()=>{
  const hold=defer(),f=fixture({queryGate:hold}),controller=new AbortController(),work=f.service.create({actor:'admin_'+'c'.repeat(64),signal:controller.signal});void work.catch(()=>{});
  for(let i=0;i<100&&!f.state.queries;i++)await tick();assert.equal(f.state.queries,1);assert.equal(controller.signal.aborted,false);const stop=f.owner.close();const stopped=await stop;
  assert.equal(f.state.nativeSignals[0].aborted,true);assert.equal(controller.signal.aborted,false);assert.equal(stopped.drained,false);assert.equal(stopped.poolsClosed,false);assert.equal(f.state.closeCalls,0);hold.resolve();await assert.rejects(work);await tick();assert.strictEqual(await f.owner.close(),stopped);assert.equal(f.state.closeCalls,0);
 });
 console.log(JSON.stringify({scope:'Only new original web registration -> constructor -> same-owner signal/retention boundary',results,oldSuitesRepeated:false,actualEnvironmentReads:0,realOriginalReads:0,realNetwork:0,realDatabase:0,realProviders:0,operationalAccepted:false}));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
