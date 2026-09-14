'use strict';
const assert=require('node:assert/strict');
const {createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');
const {createMessagesFacade}=require('../../lib/ai/compatibility.cjs');
const config={contractVersion:'1.0',revision:'fixture-config',fallback:'none',activeProfile:'default',profiles:{default:{summary:{providerId:'anthropic',model:'fixture-model'}}},exceptions:[]};
const context={requestId:'fixture-request',runId:'fixture-run',budgetId:'fixture-budget',maxToolCalls:2,budget:{currency:'EUR',maxCostMicros:100,maxOutputTokens:100,deadlineMs:1000}};
const parameters=()=>({system:'Synthetic system',max_tokens:50,messages:[{role:'user',content:'Synthetic prompt'}]});
function rig(options={}){
 const events=[];const registry=createRegistry();let admitted,settled;
 registry.register(createAnthropicAdapter({models:{'fixture-model':{verified:true,executors:['ai'],capabilities:['text','json','vision','web_search']}},credentialRef:'test:fixture',preflight:async()=>({upperBoundMicros:90,currency:'EUR',priceVersion:'synthetic'}),transport:{create:async payload=>{events.push('provider');return options.reply??{content:[{type:'text',text:'Synthetic response'}],stop_reason:'end_turn',usage:{input_tokens:7}};}}}));
 const store={admit:async(request,{runId})=>{events.push('admit');admitted=request;return {runId,snapshot:registry.resolve(config,request),status:'running',replay:options.replay??false};},reconcile:async(_id,result)=>{events.push('reconcile');settled=result;return {state:'uncertain'};}};
 const facade=createMessagesFacade({runner:createTaskRunner({registry,store}),context,taskType:'summary',instructionsVersion:'fixture-v1',language:'es',outputSchema:options.outputSchema,incompletePolicy:options.incompletePolicy});
 return {facade,events,get admitted(){return admitted;},get settled(){return settled;}};
}
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 await test('legacy response shape passes through full simulated contract chain',async()=>{const r=rig();const out=await r.facade.create(parameters());assert.equal(out.content[0].text,'Synthetic response');assert.equal(out.stop_reason,'end_turn');assert.equal(out.model,'fixture-model');assert.deepEqual(r.events,['admit','provider','reconcile']);assert.equal(r.admitted.taskType,'summary');assert.equal(r.admitted.instructionsVersion,'fixture-v1');});
 await test('missing usage remains null in compatibility shape',async()=>{const out=await rig().facade.create(parameters());assert.equal(out.usage.input_tokens,7);assert.equal(out.usage.output_tokens,null);});
 for(const key of ['model','providerId','temperature','stream','metadata'])await test('legacy override '+key+' rejected before admission',async()=>{const r=rig();await assert.rejects(r.facade.create({...parameters(),[key]:'injected'}),e=>e.code==='invalid_format');assert.deepEqual(r.events,[]);});
 await test('caller output allowance cannot exceed trusted budget',async()=>{const r=rig();await assert.rejects(r.facade.create({...parameters(),max_tokens:101}),e=>e.code==='quota');assert.deepEqual(r.events,[]);});
 await test('replay cannot dispatch or fabricate old output',async()=>{const r=rig({replay:true});await assert.rejects(r.facade.create(parameters()),e=>e.code==='uncertain');assert.deepEqual(r.events,['admit']);});
 for(const stop of ['max_tokens','refusal','pause_turn'])await test(stop+' cannot become legacy success',async()=>{const r=rig({reply:{content:[{type:'text',text:'Synthetic partial'}],stop_reason:stop}});await assert.rejects(r.facade.create(parameters()),error=>error.result.status!=='completed');assert.deepEqual(r.events,['admit','provider','reconcile']);});
 await test('validated JSON data preserves legacy text consumer',async()=>{const r=rig({outputSchema:{type:'object',properties:{score:{type:'integer'}},required:['score'],additionalProperties:false},reply:{content:[{type:'text',text:'{"score":7}'}],stop_reason:'end_turn'}});assert.deepEqual(JSON.parse((await r.facade.create(parameters())).content[0].text),{score:7});});
 await test('bounded search declared in portable request',async()=>{const r=rig();await r.facade.create({...parameters(),tools:[{type:'web_search_20250305',name:'web_search',max_uses:2}]});assert.deepEqual(r.admitted.toolPolicy,{allowed:['web_search'],maxCalls:2});});
 await test('search cannot exceed trusted allowance',async()=>{const r=rig();await assert.rejects(r.facade.create({...parameters(),tools:[{type:'web_search_20250305',name:'web_search',max_uses:3}]}),e=>e.code==='permissions');assert.deepEqual(r.events,[]);});
 await test('unknown content fields are not silently discarded',async()=>{const r=rig();await assert.rejects(r.facade.create({...parameters(),messages:[{role:'user',content:[{type:'text',text:'Synthetic',cache_control:{type:'ephemeral'}}]}]}),e=>e.code==='capability');assert.deepEqual(r.events,[]);});
 await test('caller cancellation prevents provider dispatch',async()=>{const r=rig();const controller=new AbortController();controller.abort();await assert.rejects(r.facade.create(parameters(),{signal:controller.signal}),error=>error.result.status==='cancelled');assert.deepEqual(r.events,['admit','reconcile']);});
 await test('legacy SDK retry override rejected',async()=>{const r=rig();await assert.rejects(r.facade.create(parameters(),{maxRetries:3}),e=>e.code==='invalid_format');assert.deepEqual(r.events,[]);});
 await test('explicit partial-text consumer retains incomplete canonical state',async()=>{const r=rig({incompletePolicy:'expose-text',reply:{content:[{type:'text',text:'Partial synthetic text'}],stop_reason:'max_tokens'}});const out=await r.facade.create(parameters());assert.equal(out.incomplete,true);assert.equal(out.execution.status,'incomplete');assert.equal(out.stop_reason,null);assert.equal(r.settled.status,'incomplete');});
 await test('partial structured data can never opt into text exposure',async()=>assert.throws(()=>rig({incompletePolicy:'expose-text',outputSchema:{type:'string'}}),e=>e.code==='configuration'));
 console.log(JSON.stringify({scope:'legacy facade through real contract runner and adapter with simulated storage/transport',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
