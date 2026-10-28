'use strict';
const assert=require('node:assert/strict');
const {loadBootstrap,harness}=require('./openai-bootstrap.test.cjs');
const {load}=require('./route-harness.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
const observation=c=>({runtimeId:c.runtimeId,providerId:c.providerId,credentialRef:c.credentialRef,requestedModel:c.model,resolvedModel:c.model,exactModelMatch:true,metadataAccessible:true,selectionUnchanged:true,generationVerified:false,budgetVerified:false});
const results=[];let finished=false;
process.once('beforeExit',()=>{if(!finished){console.error('Original standalone model readiness test did not complete');process.exitCode=1;}});
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.stack});}}
(async()=>{
 await test('every effective profile and agent override is checked once; aliases remain observations without model substitution',async()=>{
  const h=harness(),seen=[];h.options.models.other={verified:true,executors:['ai'],capabilities:['text']};h.options.taskCatalog.summary.agentIds=['special'];
  h.state.config.profiles.alternate=structuredClone(h.state.config.profiles.default);
  h.state.config.exceptions=[{scope:'agent',id:'special',selection:{providerId:'openai',model:'other'},authorizedBy:'fixture-admin',reason:'Fixture'}];
  h.options.checkModelAvailability=async c=>{assert(Object.isFrozen(c));assert.equal(c.runtimeId,'web');assert.equal(c.providerId,'openai');assert.equal(c.credentialRef,'test:bootstrap');assert(c.signal instanceof AbortSignal);seen.push(c.model);return c.model==='fixture'?{...observation(c),resolvedModel:'fixture-2026',exactModelMatch:false}:observation(c);};
  const b=loadBootstrap().createOpenAIRuntimeBootstrap(h.options);assert.deepEqual(seen,[]);const ready=await b.prepare();
  assert.deepEqual(seen,['fixture','other']);assert.equal(ready.readiness.assignments.length,4);assert.equal(ready.readiness.assignments[0].model,'fixture');
  assert.equal(ready.readiness.modelMetadata[0].requestedModel,'fixture');assert.equal(ready.readiness.modelMetadata[0].resolvedModel,'fixture-2026');assert.equal(ready.readiness.modelMetadata[0].generationVerified,false);assert.equal(ready.readiness.modelMetadata[0].budgetVerified,false);
  assert(Object.isFrozen(ready.readiness.modelMetadata));assert(Object.isFrozen(ready.readiness.modelMetadata[0]));assert.equal(h.state.availability,1);assert.equal(h.state.credentials,0);assert.equal(h.state.resolutions,0);
 });
 await test('format-only, mismatched or escalated metadata cannot expose a factory or reach the legacy credential check',async()=>{
  const changes=[()=>true,c=>({...observation(c),runtimeId:'agent'}),c=>({...observation(c),providerId:'other'}),c=>({...observation(c),credentialRef:'other'}),c=>({...observation(c),requestedModel:'other'}),c=>({...observation(c),metadataAccessible:false}),c=>({...observation(c),generationVerified:true}),c=>({...observation(c),budgetVerified:true}),c=>({...observation(c),extra:'secret'})];
  for(const change of changes){const h=harness();h.options.checkModelAvailability=async c=>change(c);const b=loadBootstrap().createOpenAIRuntimeBootstrap(h.options),p=b.prepare();await assert.rejects(p,e=>e.code==='credentials');assert.equal(b.prepare(),p);assert.equal(h.state.availability,0);assert.equal(h.state.credentials,0);assert.equal(h.state.resolutions,0);}
 });
 await test('original metadata capability is captured before reads; denied authority stays denied and errors are redacted',async()=>{
  const h=harness(),gate=deferred();let calls=0;h.options.checkModelAvailability=async c=>{calls++;await gate.promise;return observation(c);};const b=loadBootstrap().createOpenAIRuntimeBootstrap(h.options),p=b.prepare();await flush();assert.equal(calls,1);h.options.checkModelAvailability=()=>{throw Error('Replacement');};gate.resolve();await p;assert.equal(calls,1);
  const bad=harness();bad.options.checkModelAvailability=async()=>{const {ContractError}=require('../../contracts/ai/v1/core.cjs');throw new ContractError('permissions','private-key-example');};await assert.rejects(loadBootstrap().createOpenAIRuntimeBootstrap(bad.options).prepare(),e=>e.code==='permissions'&&e.message==='Bootstrap readiness was not confirmed');assert.equal(bad.state.availability,0);
 });
 await test('cancellation and deadline retire the original metadata waiter; late observations cannot install or renew it',async()=>{
  for(const mode of ['cancel','deadline']){const h=harness(),entered=deferred(),gate=deferred(),timers=new Map();let id=0,now=0,calls=0,originalSignal;
   h.options.checkModelAvailability=async c=>{calls++;originalSignal=c.signal;entered.resolve();await gate.promise;return observation(c);};
   const b=loadBootstrap({clock:()=>now,timers:{set:fn=>{timers.set(++id,fn);return id;},clear:n=>timers.delete(n)}}).createOpenAIRuntimeBootstrap(h.options),controller=new AbortController(),p=b.prepare({signal:controller.signal});await entered.promise;
   if(mode==='cancel')controller.abort();else{now=1001;for(const fn of [...timers.values()])fn();}await assert.rejects(p,e=>e.code===(mode==='cancel'?'cancelled':'deadline'));assert.equal(originalSignal.aborted,true);gate.resolve();await flush();assert.equal(calls,1);assert.equal(h.state.availability,0);assert.equal(b.prepare({signal:controller.signal}),p);assert.throws(()=>b.prepare({signal:new AbortController().signal}));assert.equal(timers.size,0);
  }
 });
 await test('revision change during metadata read rejects the completed observation and leaves original configuration immutable',async()=>{
  const h=harness(),gate=deferred(),entered=deferred();h.options.checkModelAvailability=async c=>{entered.resolve();await gate.promise;return observation(c);};const b=loadBootstrap().createOpenAIRuntimeBootstrap(h.options),p=b.prepare();await entered.promise;h.state.config.revision='changed';gate.resolve();await assert.rejects(p,e=>e.code==='configuration');assert.equal(b.prepare(),p);assert.equal(h.state.credentials,0);
 });
 await test('budget denial prevents metadata work; missing checker is rejected before storage reads',async()=>{
  const h=harness();let calls=0;h.options.checkModelAvailability=async c=>{calls++;return observation(c);};h.state.rows[0].blocked=true;await assert.rejects(loadBootstrap().createOpenAIRuntimeBootstrap(h.options).prepare(),e=>e.code==='quota');assert.equal(calls,0);
  const missing=harness();delete missing.options.checkModelAvailability;assert.throws(()=>loadBootstrap().createOpenAIRuntimeBootstrap(missing.options),e=>e.code==='configuration');assert.equal(missing.state.transactions,0);
 });
 await test('server entry remains unavailable during metadata read and after format-only rejection across bundles',async()=>{
  const h=harness(),shared={},gate=deferred(),entered=deferred();h.options.checkModelAvailability=async()=>{entered.resolve();return gate.promise;};
  const runtime=load('lib/ai/task-runtime.ts',{}, {globalThis:shared}),mocks={'server-only':{},'./openai-runtime-bootstrap.cjs':loadBootstrap(),'./task-runtime':runtime},a=load('lib/ai/openai-runtime.ts',mocks,{globalThis:shared}),b=load('lib/ai/openai-runtime.ts',mocks,{globalThis:shared});
  const p=a.installOpenAITaskRuntime(h.options);await entered.promise;assert.equal(b.installOpenAITaskRuntime(h.options),p);await assert.rejects(runtime.getMessagesTask({taskType:'summary'}),/unavailable/);gate.resolve(true);await assert.rejects(p,e=>e.code==='credentials');assert.equal(a.installOpenAITaskRuntime(h.options),p);await assert.rejects(runtime.getMessagesTask({taskType:'summary'}),/unavailable/);assert.equal(h.state.availability,0);
 });
 finished=true;console.log(JSON.stringify({scope:'Standalone bootstrap and actual server entry; synthetic metadata/storage only, no native transport or account acceptance',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(error=>{finished=true;console.error(error);process.exitCode=1;});
