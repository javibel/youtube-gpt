'use strict';
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {createControlStore}=require('../../contracts/ai/v1/control-store.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const {validateRequest,validateResult}=require('../../contracts/ai/v1/core.cjs');
const {createTaskFactory}=require('../../lib/ai/task-factory.cjs');
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const request=validateRequest({requestId:'req',taskType:'summary',contractVersion:'1.0',inputVersion:'1.0',language:'es',instructions:'',instructionsVersion:'v1',messages:[{role:'user',content:[{type:'text',text:'Synthetic'}]}],requiredCapabilities:['text'],toolPolicy:{allowed:[],maxCalls:0},budget:{currency:'EUR',maxCostMicros:10,maxOutputTokens:20,deadlineMs:1000}});
const context={runId:'run',budgetId:'budget',principalId:'owner'};
const snapshot={providerId:'fixture',model:'model',adapterVersion:'v1',configRevision:'r1',executor:'ai'};
function rig(options={}){
 const queries=[],{requestId,...operation}=request;
 const payload=validateResult({status:'completed',text:'Retained original output',usage:{outputTokens:5,costMicros:7,currency:'EUR',priceVersion:'test',estimated:true}},request,snapshot,'run');
 const row={run_id:'run',request_fingerprint:createHash('sha256').update(stable({operation,budgetId:'budget',agentId:null,principalId:'owner',executor:'ai'})).digest('hex'),snapshot,status:'completed',usage:payload.usage,payload,state:'settled',budget_id:'budget',actual_micros:'7',currency:'EUR',...options.row};
 const db={role:options.role??'executor',transaction:async fn=>fn({query:async(sql,args)=>{assert.match(sql.trim(),/^SELECT /);assert.doesNotMatch(sql,/FOR UPDATE|INSERT|UPDATE|DELETE|advisory|active_revision/);queries.push({sql,args});if(options.error)throw Error('Synthetic read unavailable');return options.absent?[]:options.duplicate?[row,row]:[row];}})};
 const store=createControlStore(db,{});
 const runner=createTaskRunner({store,registry:{runPinned:async()=>{throw Error('Provider must never run');}}});
 return {store,runner,row,queries};
}
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
(async()=>{
 await test('authentic settled output is read once without admission, provider, configuration lookup or ledger writes',async()=>{const r=rig(),out=await r.runner.retrieve(request,context);assert.equal(out.result.text,'Retained original output');assert.equal(out.accounting.state,'settled');assert.equal(r.queries.length,1);assert.ok(Object.isFrozen(out.result));});
 for(const row of [{status:'running'},{status:'uncertain'},{status:'failed'},{status:'cancelled'},{state:'reserved'},{state:'uncertain'},{payload:null}])await test('pending or nonacceptable terminal result does not grant execution '+JSON.stringify(row),async()=>{const r=rig({row});assert.equal(await r.runner.retrieve(request,context),null);assert.equal(r.queries.length,1);});
 await test('absence remains null with no replacement execution',async()=>{const r=rig({absent:true});assert.equal(await r.runner.retrieve(request,context),null);assert.equal(r.queries.length,1);});
 for(const changed of [{runId:'foreign'},{budgetId:'foreign'},{principalId:'foreign'},{agentId:'foreign'}])await test('authenticated scope mismatch is rejected '+JSON.stringify(changed),async()=>{const r=rig();await assert.rejects(r.runner.retrieve(request,{...context,...changed}));assert.equal(r.queries.length,1);});
 for(const changed of [{language:'en'},{instructionsVersion:'v2'},{messages:[{role:'user',content:[{type:'text',text:'Different'}]}]}])await test('changed portable input cannot read old output '+JSON.stringify(changed),async()=>{const r=rig();await assert.rejects(r.runner.retrieve({...request,...changed},context));});
 for(const row of [{actual_micros:'8'},{actual_micros:null},{currency:'USD'},{usage:{costMicros:999}}])await test('conflicting retained accounting cannot confirm output '+JSON.stringify(row),async()=>{const r=rig({row});await assert.rejects(r.runner.retrieve(request,context));});
 for(const mutate of [p=>({...p,runId:'wrong'}),p=>({...p,providerId:'wrong'}),p=>({...p,text:''}),p=>({...p,usage:{...p.usage,outputTokens:null}})])await test('corrupt retained result is rejected without effects',async()=>{const r=rig();r.row.payload=mutate(r.row.payload);await assert.rejects(r.runner.retrieve(request,context));assert.equal(r.queries.length,1);});
 for(const role of ['reader','activator'])await test('role cannot read private execution output '+role,async()=>{const r=rig({role});await assert.rejects(r.runner.retrieve(request,context),e=>e.code==='permissions');assert.equal(r.queries.length,0);});
 await test('missing principal, coding and duplicate identities fail closed',async()=>{const r=rig();await assert.rejects(r.runner.retrieve(request,{...context,principalId:undefined}),e=>e.code==='permissions');assert.equal(r.queries.length,0);await assert.rejects(r.store.retrieve(request,{...context,executor:'coding'}),e=>e.code==='capability');await assert.rejects(rig({duplicate:true}).runner.retrieve(request,context));});
 await test('cancelled and unavailable reads never fall back to running',async()=>{const c=new AbortController();c.abort();const r=rig();await assert.rejects(r.runner.retrieve(request,{...context,signal:c.signal}),e=>e.code==='cancelled');assert.equal(r.queries.length,0);await assert.rejects(rig({error:true}).runner.retrieve(request,context));});
 await test('factory facade uses authenticated retrieval and shared request conversion with no run fallback',async()=>{
  let read=0,run=0,authorized=0;const factory=createTaskFactory({runner:{run:async()=>{run++;throw Error('Forbidden');},retrieve:async(req,ctx)=>{read++;assert.ok(ctx.principalId);return null;}},policies:{summary:{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:10,maxOutputTokens:20,deadlineMs:1000}}},authorize:async()=>{authorized++;return{budgetId:'budget'};}});
  const task=await factory({userId:'owner',taskType:'summary',language:'es',instructionsVersion:'v1',operationKey:'same'});assert.equal(await task.retrieve({max_tokens:20,messages:[{role:'user',content:'Synthetic'}]}),null);assert.equal(read,1);assert.equal(run,0);assert.equal(authorized,1);
  await assert.rejects(task.retrieve({max_tokens:20,messages:[],providerId:'injected'}));assert.equal(read,1);
 });
 await test('cancellation while awaiting read rejects the result without dispatch',async()=>{const c=new AbortController(),r=rig(),original=r.store.retrieve;const store={...r.store,retrieve:async(q,ctx)=>{const result=await original(q,ctx);c.abort();return result;}};const runner=createTaskRunner({store,registry:{runPinned:()=>{throw Error('Forbidden');}}});await assert.rejects(runner.retrieve(request,{...context,signal:c.signal}),e=>e.code==='cancelled');assert.equal(r.queries.length,1);});
 await test('runtime without read-only store cannot fall back to admit',async()=>{const runner=createTaskRunner({store:{admit:()=>{throw Error('Forbidden admission');},reconcile:()=>{throw Error('Forbidden reconciliation');}},registry:{runPinned:()=>{throw Error('Forbidden');}}});await assert.rejects(runner.retrieve(request,context),e=>e.code==='configuration');});
 console.log(JSON.stringify({scope:'Read-only settled result retrieval; synthetic store, no admission, provider or recovery authority from pending',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
