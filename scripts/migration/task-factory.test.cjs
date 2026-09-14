'use strict';
const assert=require('node:assert/strict');const {createTaskFactory}=require('../../lib/ai/task-factory.cjs');
const policy=()=>({summary:{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:10,maxOutputTokens:100,deadlineMs:1000}}});
const identity={userId:'synthetic-user',taskType:'summary',language:'es',instructionsVersion:'fixture-v1'};
const parameters={max_tokens:20,messages:[{role:'user',content:'Synthetic input'}]};
function rig(options={}){const calls=[],authorizations=[];const policies=options.policies??policy();const factory=createTaskFactory({policies,newIdentity:()=> 'synthetic-unique',authorize:async value=>{authorizations.push(value);return options.denied?null:{budgetId:'authorized-budget'};},runner:{run:async(request,context)=>{calls.push({request,context});return {kind:'existing-run'};}}});return {factory,calls,authorizations,policies};}
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 await test('trusted policy and authorized budget reach durable runner',async()=>{const r=rig();const task=await r.factory(identity);await assert.rejects(task.create(parameters),e=>e.code==='uncertain');assert.equal(r.calls[0].context.budgetId,'authorized-budget');assert.equal(r.calls[0].request.budget.maxCostMicros,10);assert.deepEqual(r.authorizations,[{userId:'synthetic-user',taskType:'summary'}]);});
 await test('unauthorized caller creates no task or execution',async()=>{const r=rig({denied:true});await assert.rejects(r.factory(identity),e=>e.code==='permissions');assert.equal(r.calls.length,0);});
 await test('body cannot inject budget or provider through identity',async()=>{const r=rig();for(const extra of [{budgetId:'other'},{providerId:'other'},{budget:{maxCostMicros:999}}])await assert.rejects(r.factory({...identity,...extra}),e=>e.code==='permissions');assert.equal(r.authorizations.length,0);});
 await test('unknown task fails before authorization',async()=>{const r=rig();await assert.rejects(r.factory({...identity,taskType:'__proto__'}),e=>e.code==='configuration');assert.equal(r.authorizations.length,0);});
 await test('policy changes after installation cannot mutate installed budgets',async()=>{const r=rig();r.policies.summary.budget.maxCostMicros=999;const task=await r.factory(identity);await assert.rejects(task.create(parameters));assert.equal(r.calls[0].request.budget.maxCostMicros,10);});
 await test('account-scoped identities do not expose user identifier',async()=>{const r=rig();for(const userId of ['synthetic-user','synthetic-other']){const task=await r.factory({...identity,userId});await assert.rejects(task.create(parameters));}assert.notEqual(r.calls[0].context.runId,r.calls[1].context.runId);assert.doesNotMatch(r.calls[0].context.runId,/synthetic-user/);});
 await test('invalid unbounded policy rejected at installation',async()=>{const p=policy();p.summary.budget.deadlineMs=Infinity;assert.throws(()=>rig({policies:p}),e=>e.code==='configuration');});
 console.log(JSON.stringify({scope:'trusted server budget composition; no database connection or provider request',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
