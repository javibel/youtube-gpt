'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {load}=require('./route-harness.cjs'),{createObserverHttpHandlers}=require('../../lib/ai/observer-channel-http.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
function fixture(){
 const shared={},gate=deferred(),calls={install:0,task:0,current:0,claim:0,result:0},service={current:async()=>{calls.current++;return{revision:'synthetic'};}};
 const task={create:async()=>({content:[]})};
 const globals={globalThis:shared,AbortController,AbortSignal};
 const runtime=load('lib/ai/operational-runtime.ts',{'server-only':{},'./operational-composition.cjs':{createOperationalWebComposition:()=>({dependencies:{}})},'./shared-runtime':{installSharedRuntime:()=>{calls.install++;return gate.promise.then(()=>{Object.defineProperty(shared,Symbol.for('ytubviral.ai.shared-runtime.v1'),{value:Object.freeze({factory:async()=>{calls.task++;return task;},service})});return{};});}}},globals);
 const prepare=()=>runtime.provideOperationalWebCapabilities({});
 const taskRuntime=load('lib/ai/task-runtime.ts',{},globals);
 const configuration=(denied=false)=>load('app/api/admin/ai-configuration/route.ts',{'@/lib/auth-guards':{requireAdmin:async()=>denied?{ok:false,response:new Response(null,{status:403})}:{ok:true,email:'synthetic@example.invalid'}},'@/lib/ai/configuration-runtime':{getConfigurationService:()=>shared[Symbol.for('ytubviral.ai.shared-runtime.v1')]?.service}},globals);
 const observer={create:async()=>[],status:async()=>({state:'pending'}),claim:async()=>{calls.claim++;return'synthetic';},result:async()=>{calls.result++;return{state:'complete'};}};
 const route=(file,denied=false)=>load(file,{'@/lib/auth-guards':{requireAdmin:async()=>denied?{ok:false,response:new Response(null,{status:403})}:{ok:true,email:'synthetic@example.invalid'}},'@/lib/ai/observer-channel-http.cjs':{createObserverHttpHandlers},'@/lib/ai/observer-channel-runtime.cjs':{getObserverChannel:()=>observer}},globals);
 const request=(body,signal)=>new Request('https://synthetic.invalid/api/admin/ai-configuration',{method:'POST',signal,headers:{origin:'https://synthetic.invalid','content-type':'application/json'},body:JSON.stringify(body)});
 return{shared,globals,runtime,gate,calls,prepare,taskRuntime,task,configuration,route,request};
}
const identity={taskType:'synthetic',userId:'synthetic-user',language:'es',instructionsVersion:'v1'};
(async()=>{
 await test('Node instrumentation captures the original owner and serves without waiting for model/DB readiness',async()=>{
  const h=fixture(),env={NEXT_RUNTIME:'nodejs',YTV_OPERATIONAL_RUNTIME:'1',SECRET_BYTES:'  synthetic bytes  '},events=[];
  const entry=load('instrumentation.ts',{'./lib/ai/ytubviral-native-release.cjs':{registerYTubViralNativeRelease:()=>events.push('register')},'./lib/ai/configuration-runtime':{getAuthenticatedConfigurationActor:()=>null},'./lib/ai/platform-web-host':{prepareConfiguredPlatformWebHost:async()=>{assert.equal(env.SECRET_BYTES,'  synthetic bytes  ');h.prepare();events.push('capture');}},'./lib/ai/operational-runtime':{installConfiguredOperationalWebRuntime:()=>{throw Error('Unrelated route started model readiness');}}},{...h.globals,process:{env}});
  await entry.register();assert.deepEqual(events,['register','capture']);assert.equal(env.SECRET_BYTES,'synthetic bytes');assert.equal(h.calls.install,0);
  const a=h.taskRuntime.getMessagesTask(identity),b=h.taskRuntime.getMessagesTask(identity);await flush();assert.equal(h.calls.install,1);assert.equal(h.calls.task,0);h.gate.resolve();assert.equal(await a,h.task);assert.equal(await b,h.task);assert.equal(h.calls.task,2);
 });
 await test('Cancelling an AI waiter does not dispatch after late readiness, restart the owner or cancel another waiter',async()=>{
  const h=fixture();h.prepare();const abort=new AbortController(),a=h.taskRuntime.getMessagesTask(identity,{signal:abort.signal}),b=h.taskRuntime.getMessagesTask(identity);
  await flush();assert.equal(h.calls.install,1);abort.abort();await assert.rejects(a,/cancelled/);h.gate.resolve();assert.equal(await b,h.task);await flush();assert.equal(h.calls.task,1);assert.equal(h.calls.install,1);
 });
 await test('A pre-aborted AI request never starts original preparation',async()=>{const h=fixture();h.prepare();const a=new AbortController();a.abort();await assert.rejects(h.taskRuntime.getMessagesTask(identity,{signal:a.signal}),/cancelled/);assert.equal(h.calls.install,0);});
 for(const path of ['configuration','observer'])await test('Denied '+path+' administration never starts readiness',async()=>{const h=fixture();h.prepare();const r=path==='configuration'?await h.configuration(true).GET(new Request('https://synthetic.invalid')):await h.route('app/api/admin/ai-observations/route.ts',true).GET(new Request('https://synthetic.invalid'));assert.equal(r.status,403);assert.equal(h.calls.install,0);});
 await test('Configuration awaits readiness and retires an aborted waiter without a late service call',async()=>{const h=fixture();h.prepare();const a=new AbortController(),p=h.configuration().GET(new Request('https://synthetic.invalid',{signal:a.signal}));await flush();assert.equal(h.calls.install,1);a.abort();assert.equal((await p).status,503);h.gate.resolve();await flush();assert.equal(h.calls.current,0);assert.equal((await h.configuration().GET(new Request('https://synthetic.invalid'))).status,200);assert.equal(h.calls.install,1);assert.equal(h.calls.current,1);});
 for(const [file,action]of [['app/api/internal/agent-observations/claim/route.ts','claim'],['app/api/internal/agent-observations/result/route.ts','result']])await test(action+' observation route awaits the same original readiness before its service',async()=>{const h=fixture();h.prepare();const body={requestId:'synthetic',proof:'synthetic',...(action==='result'?{wire:'synthetic'}:{})},p=h.route(file).POST(h.request(body));await flush();assert.equal(h.calls.install,1);assert.equal(h.calls[action],0);h.gate.resolve();assert.equal((await p).status,200);assert.equal(h.calls[action],1);assert.equal(h.calls.install,1);});
 await test('Failed original preparation stays failed for AI, configuration and observation; no fallback or renewal',async()=>{
  const h=fixture();h.prepare();const p=h.taskRuntime.getMessagesTask(identity);await flush();h.gate.reject(Error('Synthetic unavailable original'));await assert.rejects(p,/unavailable original/);
  for(let i=0;i<2;i++)await assert.rejects(h.taskRuntime.getMessagesTask(identity),/unavailable original/);
  assert.equal((await h.configuration().GET(new Request('https://synthetic.invalid'))).status,503);
  assert.equal((await h.route('app/api/admin/ai-observations/route.ts').GET(new Request('https://synthetic.invalid'))).status,503);assert.equal(h.calls.install,1);assert.equal(h.calls.task,0);
 });
 await test('Configuration data cannot supply operational capabilities',async()=>{for(const value of [{install:true},Object.freeze({install:'true'})]){const shared={};Object.defineProperty(shared,Symbol.for('ytubviral.ai.operational-web-capabilities.v1'),{value});const helper=load('lib/ai/operational-readiness.ts',{}, {globalThis:shared});await assert.rejects(helper.waitForOperationalWebRuntime(),/Original operational/);}});
 console.log(JSON.stringify({complete:results.every(x=>x.status==='PASS'),results,externalNetwork:0,productionSql:0,realModels:0,syntheticOriginalPromiseUsed:true}));if(results.some(x=>x.status!=='PASS'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});

