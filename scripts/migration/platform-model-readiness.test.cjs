'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {harness:sharedHarness,loadBootstrap}=require('./shared-runtime.test.cjs');
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
const flush=()=>new Promise(r=>setImmediate(r));
const observation=c=>({runtimeId:c.runtimeId,providerId:c.providerId,credentialRef:c.credentialRef,requestedModel:c.model,resolvedModel:c.model,exactModelMatch:true,metadataAccessible:true,selectionUnchanged:true,generationVerified:false,budgetVerified:false});
function harness(){
 const h=sharedHarness(),state={calls:[],nativeCreates:0,nativePrepares:0,nativeRetires:0,nativeCloses:0,roleReads:0,clock:0,timers:new Map(),timerId:0};
 const environment={NEXT_RUNTIME:'nodejs'};for(const role of ['READER','ACTIVATOR','EXECUTOR'])Object.defineProperty(environment,'YTV_AI_'+role+'_PASSWORD',{get(){state.roleReads++;return 'synthetic-only-'+role;}});
 const runtime=Object.fromEntries(['adapters','taskCatalog','policies','budgetBindings','authorize','getRuntimes','checkCredential'].map(k=>[k,h.options[k]]));runtime.operatingBudget={};
 runtime.checkModelAvailability=async c=>{state.calls.push(c);return state.metadata?state.metadata(c):observation(c);};
 let captured,bootstrap;
 const operational={createOperationalWebDeployment(options){state.nativeCreates++;captured=options;const check=options.runtime.nativeProviders?async c=>{state.calls.push(c);return observation(c);}:options.runtime.checkModelAvailability;
  const dependencies={...h.options,checkModelAvailability:check,checkCredential:options.runtime.checkCredential??h.options.checkCredential};bootstrap=loadBootstrap().createSharedRuntimeBootstrap(dependencies);
  return{dependencies,assertOpen(){},prepare:args=>{state.nativePrepares++;return bootstrap.prepare(args);},retire:async()=>{state.nativeRetires++;return{drained:true,uncertain:false};},close:async()=>{state.nativeCloses++;return{closed:true,drained:true,poolCount:3};}};
 }};
 const file=path.resolve(__dirname,'../../lib/ai/platform-web-deployment.cjs'),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:id=>{if(id==='node:process')return{release:{name:'node'},env:environment};if(id==='node:util')return require(id);if(id==='node:perf_hooks')return{performance:{now:()=>state.clock}};if(id==='./operational-deployment.cjs')return operational;throw Error('Unexpected platform model import');},AbortSignal,AbortController,setTimeout:(fn,ms)=>{const id=++state.timerId;state.timers.set(id,{fn,ms});return id;},clearTimeout:id=>state.timers.delete(id)},{filename:file});
 const options={database:{host:'synthetic.invalid',port:5432,databaseName:'synthetic_admin',timeoutMs:1000,maxConnections:1},runtime,authorizeRoleAccess:async()=>true,sealAndDrainIngress:async()=>({drained:true}),prepareTimeoutMs:1000,stopTimeoutMs:30};
 return{h,state,options,create:()=>module.exports.createPlatformWebDeployment(options),captured:()=>captured,expire:()=>{state.clock+=31;for(const {fn,ms}of [...state.timers.values()])if(ms<=30)fn();}};
}
const results=[];let finished=false;process.once('beforeExit',()=>{if(!finished){console.error('Original platform model readiness test did not finish');process.exitCode=1;}});
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
(async()=>{
 await test('platform passes its original bound checker into actual shared/admin preparation without dispatch',async()=>{
  const h=harness(),owner=h.create();assert.equal(h.state.calls.length,0);assert.equal(h.state.nativePrepares,0);const ready=await owner.prepare();assert.equal(h.state.calls.length,2);assert.equal(ready.readiness.modelMetadata.length,2);
  for(const c of h.state.calls){assert.equal(c.runtimeId,'web');assert.equal(c.credentialRef,'test:shared');assert.equal(c.model,'fixture');assert(c.signal instanceof AbortSignal);assert.equal(c.signal.aborted,false);}assert.equal(h.h.state.dispatches.length,0);assert(h.h.state.reads.length>0);const closing=owner.close();assert.equal(owner.close(),closing);assert.equal((await closing).drained,true);assert.equal(h.state.nativeCloses,1);
 });
 await test('checker capture survives caller replacement; original identifiers and cancellation remain bound',async()=>{
  const h=harness(),entered=deferred(),gate=deferred();h.state.metadata=async c=>{entered.resolve();await gate.promise;return observation(c);};const owner=h.create(),p=owner.prepare();await entered.promise;h.options.runtime.checkModelAvailability=async()=>assert.fail('Replacement checker');gate.resolve();const ready=await p;assert.equal(ready.readiness.modelMetadata.length,2);assert.equal(h.state.calls.length,2);await owner.close();
 });
 await test('format-only or foreign metadata is denied by real downstream validation, without an installable factory',async()=>{
  for(const bad of [()=>true,c=>({...observation(c),providerId:'foreign'}),c=>({...observation(c),budgetVerified:true})]){const h=harness();h.state.metadata=bad;const owner=h.create();await assert.rejects(owner.prepare(),e=>e.code==='credentials');assert.equal(h.h.state.dispatches.length,0);await owner.close();}
 });
 await test('missing, serialized or competing checker is denied before role-secret capture or native construction',async()=>{
  for(const mode of ['missing','serialized','mixed-checker','mixed-credential','mixed-adapter']){const h=harness();if(mode==='missing')delete h.options.runtime.checkModelAvailability;if(mode==='serialized')h.options.runtime.checkModelAvailability={allowed:true};if(mode.startsWith('mixed')){h.options.runtime.nativeProviders={stopTimeoutMs:30};if(mode!=='mixed-checker')delete h.options.runtime.checkModelAvailability;if(mode!=='mixed-credential')delete h.options.runtime.checkCredential;if(mode!=='mixed-adapter')delete h.options.runtime.adapters;}
   assert.throws(h.create,e=>e.code==='platform_web_configuration');assert.equal(h.state.roleReads,0);assert.equal(h.state.nativeCreates,0);assert.equal(h.state.calls.length,0);}
 });
 await test('native-provider path keeps sole checker ownership rather than injecting a platform competitor',async()=>{
  const h=harness();delete h.options.runtime.adapters;delete h.options.runtime.checkCredential;delete h.options.runtime.checkModelAvailability;h.options.runtime.nativeProviders={stopTimeoutMs:30};const owner=h.create();assert.equal(Object.hasOwn(h.captured().runtime,'checkModelAvailability'),false);await owner.prepare();assert.equal(h.state.calls.length,2);assert.equal((await owner.close()).drained,true);
 });
 await test('cooperative metadata cancellation drains the original callback before closing pools and rejects later work',async()=>{
  const h=harness(),entered=deferred();let observedSignal;h.state.metadata=c=>new Promise(resolve=>{observedSignal=c.signal;entered.resolve();c.signal.addEventListener('abort',()=>resolve(observation(c)),{once:true});});const owner=h.create(),controller=new AbortController(),p=owner.prepare({signal:controller.signal});void p.catch(()=>{});await entered.promise;const closing=owner.close();assert.equal(observedSignal.aborted,true);await assert.rejects(p);assert.equal((await closing).drained,true);assert.equal(h.state.nativeCloses,1);assert.equal(h.state.calls.length,1);await assert.rejects(async()=>owner.dependencies.checkModelAvailability({runtimeId:'web',providerId:'openai',credentialRef:'test:shared',model:'fixture'}),e=>e.code==='platform_web_cancelled');assert.equal(h.state.calls.length,1);
 });
 await test('uncooperative original metadata keeps shutdown uncertain and late settlement cannot renew closure or close pools',async()=>{
  for(const lateReject of [false,true]){const h=harness(),entered=deferred();let settle;h.state.metadata=c=>new Promise((resolve,reject)=>{settle=()=>lateReject?reject(Error('synthetic-late')):resolve(observation(c));entered.resolve();});const owner=h.create(),p=owner.prepare();void p.catch(()=>{});await entered.promise;const closing=owner.close();await assert.rejects(p);await flush();assert.equal(h.state.nativeCloses,0);h.expire();const terminal=await closing;assert.equal(terminal.drained,false);assert.equal(terminal.uncertain,true);assert(terminal.pending>0);assert.equal(terminal.poolsClosed,false);settle();await flush();assert.equal(owner.close(),closing);assert.equal(await owner.close(),terminal);assert.equal(h.state.nativeCloses,0);assert.throws(()=>owner.prepare());}
 });
 await test('the original platform preparation deadline cancels metadata without granting a fresh waiter or drain budget',async()=>{
  const h=harness(),entered=deferred(),gate=deferred();h.state.metadata=async c=>{entered.resolve();await gate.promise;return observation(c);};const owner=h.create(),p=owner.prepare();void p.catch(()=>{});await entered.promise;h.state.clock=1001;for(const {fn,ms}of [...h.state.timers.values()])if(ms===1000)fn();await assert.rejects(p,e=>e.code==='platform_web_deadline');const closing=owner.close();await flush();h.expire();const terminal=await closing;assert.equal(terminal.drained,false);assert.equal(terminal.uncertain,true);assert.equal(h.state.nativeCloses,0);gate.resolve();await flush();assert.equal(await owner.close(),terminal);assert.throws(()=>owner.prepare());assert.equal(h.state.calls.length,1);
 });
 finished=true;console.log(JSON.stringify({scope:'Actual platform wrapper plus actual shared/admin bootstrap with synthetic metadata, storage and mocked native deployment lifecycle; no secret values, database sockets, provider API, generation, startup or spend',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(e=>{finished=true;console.error(e);process.exitCode=1;});
