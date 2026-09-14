'use strict';
const assert=require('node:assert/strict');
const {createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const {createTaskFactory}=require('../../lib/ai/task-factory.cjs');
const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');
const {createOpenAIAdapter}=require('../../lib/ai/adapters/openai.cjs');
const registry=createRegistry(),calls=[],settled=[];
const models={synthetic:{verified:true,executors:['ai'],capabilities:['text','json']}};
const options={models,credentialRef:'test:synthetic',preflight:async()=>({upperBoundMicros:10,currency:'EUR',priceVersion:'synthetic'})};
registry.register(createAnthropicAdapter({...options,transport:{create:async()=>{calls.push('anthropic');return {stop_reason:'end_turn',content:[{type:'text',text:'{"score":7}'}]};}}}));
registry.register(createOpenAIAdapter({...options,transport:{create:async()=>{calls.push('openai');return {status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"score":7}',annotations:[]}]}]};}}}));
let invalid=false;
// The third implementation exists only in this offline test, not a live provider.
registry.register({providerId:'synthetic-third',adapterVersion:'fixture-v1',credentialRef:'test:synthetic',enabled:true,models,execute:async()=>{calls.push('synthetic-third');return {status:'completed',text:'{"score":7}',data:{score:invalid?'invalid':7}};}});
let active;
function select(providerId){active={contractVersion:'1.0',revision:'test-'+providerId,fallback:'none',activeProfile:'selected',profiles:{selected:{summary:{providerId,model:'synthetic'}}},exceptions:[]};}
const runner=createTaskRunner({registry,store:{admit:async(request,{runId})=>({runId,snapshot:registry.resolve(active,request),status:'running',replay:false}),reconcile:async(runId,result)=>{settled.push(result);return {state:'uncertain'};}}});
const factory=createTaskFactory({runner,policies:{summary:{budget:{currency:'EUR',maxCostMicros:20,maxOutputTokens:40,deadlineMs:1000},maxToolCalls:0}},authorize:async()=>({budgetId:'synthetic-budget'})});
const identity={userId:'synthetic-user',taskType:'summary',language:'es',instructionsVersion:'test-v1',outputSchema:{type:'object',properties:{score:{type:'integer',minimum:0,maximum:10}},required:['score'],additionalProperties:false}};
async function businessCall(extra={}){const client=await factory({...identity,...extra});return client.create({system:'Synthetic instructions',max_tokens:40,messages:[{role:'user',content:'Synthetic input'}]});}
(async()=>{
 for(const providerId of ['anthropic','openai','synthetic-third']){select(providerId);const result=await businessCall();assert.equal(result.content[0].text,'{"score":7}');assert.equal(calls.at(-1),providerId);assert.equal(settled.at(-1).usage.costMicros,null);}
 const before=calls.length;await assert.rejects(businessCall({requiredCapabilities:['vision']}),e=>e.code==='capability');assert.equal(calls.length,before);
 invalid=true;await assert.rejects(businessCall(),e=>e.code==='invalid_format');assert.equal(calls.length,before+1);assert.equal(calls.at(-1),'synthetic-third');
 invalid=false;select('openai');await businessCall();assert.equal(calls.at(-1),'openai');
 console.log('PASS: 6 extension checks: unchanged business call across three adapters, nullable costs, capability rejection, schema rejection without fallback, explicit return to OpenAI; entirely synthetic');
})().catch(error=>{console.error(error);process.exitCode=1;});
