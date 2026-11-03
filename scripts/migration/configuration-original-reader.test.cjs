'use strict';
// Reuse inert synthetic fixture declarations only; the old test body is guarded
// by require.main and is not run. All storage/account/model metadata are mocks.
const assert=require('node:assert/strict');
const {harness,loadBootstrap}=require('./configuration-bootstrap.test.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
const pending=async promise=>{let done=false;void promise.then(()=>{done=true;},()=>{done=true;});await tick();assert.equal(done,false);};
function nativeFixture({manual=false,handleFactory,throwNative=false}={}){
 const h=harness(),original=h.options.readerDatabase,state={calls:0,queries:[],lastHandle:null,lastInvocation:null},result=deferred(),settled=deferred();
 original.transactionOriginal=function(work,invocation){
  assert.strictEqual(this,original);state.calls++;state.lastInvocation=invocation;if(throwNative)throw Error('synthetic-native-failure');
  if(handleFactory)return handleFactory();
  const tx={query:async function(sql,args){assert.strictEqual(this,tx);state.queries.push({sql,args});assert.equal(sql.includes('__ytv_control__'),false);assert.equal(sql.includes('ytv_ai_test_v1.active_revision'),true);assert.deepEqual(args,['synthetic_admin_v1']);return[{active:structuredClone(h.state.head),revision:structuredClone(h.state.head)}];}};
  const workResult=manual?result.promise:Promise.resolve().then(()=>work(tx));
  const nativeSettled=manual?settled.promise:workResult.then(()=>undefined,()=>undefined);
  state.lastHandle=Object.freeze({result:workResult,settled:nativeSettled});return state.lastHandle;
 };
 return{h,original,state,result,settled};
}
const results=[];async function group(name,run){try{await run();results.push({name,status:'PASS'});}catch{results.push({name,status:'FAIL'});}}
(async()=>{
 await group('optional original reader captured before waits preserves receiver schema and exact native handle',async()=>{
  const f=nativeFixture(),bootstrap=loadBootstrap().createConfigurationRuntimeBootstrap(f.h.options);assert.equal(f.state.calls,0);assert.equal(f.h.state.reads.length,0);
  f.original.transactionOriginal=()=>{throw Error('replaced-native-source');};
  const ready=await bootstrap.prepare(),availability=f.h.state.availability,runtimes=f.h.state.runtimes,reads=f.h.state.reads.length,controller=new AbortController(),invocation={signal:controller.signal};
  const handle=ready.dependencies.reader.bindingOriginal('synthetic_admin_v1',invocation);assert.strictEqual(handle,f.state.lastHandle);assert.strictEqual(f.state.lastInvocation,invocation);assert.equal(Object.isFrozen(handle),true);
  const snapshot=await handle.result;await handle.settled;assert.equal(snapshot.active.revision,'synthetic_admin_v1');assert.equal(snapshot.revision.revision,'synthetic_admin_v1');assert.equal(f.state.calls,1);assert.equal(f.state.queries.length,1);assert.equal(f.h.state.availability,availability);assert.equal(f.h.state.runtimes,runtimes);assert.equal(f.h.state.reads.length,reads);
 });
 await group('legacy reader remains two methods and activator native property is never inspected',async()=>{
  const h=harness();let getters=0;Object.defineProperty(h.options.activatorDatabase,'transactionOriginal',{get(){getters++;throw Error('activator-native-not-authorized');}});
  const bootstrap=loadBootstrap().createConfigurationRuntimeBootstrap(h.options);assert.equal(h.state.reads.length,0);const ready=await bootstrap.prepare();assert.deepEqual(Object.keys(ready.dependencies.reader).sort(),['active','revision']);assert.deepEqual(Object.keys(ready.dependencies.activator).sort(),['activate','publish']);assert.equal(getters,0);
 });
 await group('native input accessors proxy functions and JSON flags fail before IO without getter evaluation',async()=>{
  let getters=0;
  for(const mode of ['accessor','proxy','boolean']){const h=harness();if(mode==='accessor')Object.defineProperty(h.options.readerDatabase,'transactionOriginal',{get(){getters++;return()=>{};}});else h.options.readerDatabase.transactionOriginal=mode==='proxy'?new Proxy(()=>{},{}):true;assert.throws(()=>loadBootstrap().createConfigurationRuntimeBootstrap(h.options));assert.equal(h.state.reads.length,0);assert.equal(h.state.availability,0);}
  assert.equal(getters,0);
 });
 await group('cancelled native borrower keeps the exact independently pending original settlement promise',async()=>{
  const f=nativeFixture({manual:true}),ready=await loadBootstrap().createConfigurationRuntimeBootstrap(f.h.options).prepare(),reads=f.h.state.reads.length,controller=new AbortController(),handle=ready.dependencies.reader.bindingOriginal('synthetic_admin_v1',{signal:controller.signal});
  assert.strictEqual(handle,f.state.lastHandle);controller.abort();f.result.reject(Error('synthetic-borrower-abort'));await assert.rejects(handle.result);await pending(handle.settled);assert.strictEqual(handle.settled,f.settled.promise);assert.equal(f.state.calls,1);assert.equal(f.h.state.reads.length,reads);f.settled.resolve();assert.equal(await handle.settled,undefined);assert.equal(f.state.calls,1);
 });
 await group('serialized or accessor settlement handles are rejected without fallback or getters',async()=>{
  let getters=0;const factories=[()=>Object.freeze({result:true,settled:true}),()=>Object.freeze(Object.defineProperty({settled:Promise.resolve()},'result',{get(){getters++;return Promise.resolve();},enumerable:true})),()=>Object.freeze({result:new Proxy(Promise.resolve(),{}),settled:Promise.resolve()})];
  for(const handleFactory of factories){const f=nativeFixture({handleFactory}),ready=await loadBootstrap().createConfigurationRuntimeBootstrap(f.h.options).prepare(),reads=f.h.state.reads.length;assert.throws(()=>ready.dependencies.reader.bindingOriginal('synthetic_admin_v1'));assert.equal(f.state.calls,1);assert.equal(f.h.state.reads.length,reads);}
  assert.equal(getters,0);
 });
 await group('original native failure never falls back to legacy reader or expands activator provider work',async()=>{
  const f=nativeFixture({throwNative:true}),ready=await loadBootstrap().createConfigurationRuntimeBootstrap(f.h.options).prepare(),reads=f.h.state.reads.length,availability=f.h.state.availability;
  assert.throws(()=>ready.dependencies.reader.bindingOriginal('synthetic_admin_v1'));assert.equal(f.state.calls,1);assert.equal(f.h.state.reads.length,reads);assert.equal(f.h.state.availability,availability);assert.equal(ready.dependencies.activator.bindingOriginal,undefined);assert.equal(ready.dependencies.activator.transactionOriginal,undefined);
 });
 console.log(JSON.stringify({scope:'Six NEW optional original reader handoff groups only',results,oldGroupsRepeated:false,realOriginalReads:0,externalCalls:0,realDatabaseConnections:0,newOwner:false,streamPoolClosureClaimed:false}));if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
})().catch(()=>{console.log(JSON.stringify({fixedCode:'NEW_READER_HANDOFF_INCOMPLETE'}));process.exitCode=1;});
