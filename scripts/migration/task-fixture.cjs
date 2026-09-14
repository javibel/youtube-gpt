'use strict';
const assert=require('node:assert/strict');
const {createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');
const {createMessagesFacade}=require('../../lib/ai/compatibility.cjs');
// Test-only composition: real contract path, synthetic store, transport and tariff.
function taskFixture({taskType,respond,controlUnavailable=false}){
 const calls=[],events=[];let sequence=0;
 const registry=createRegistry();registry.register(createAnthropicAdapter({models:{'fixture-model':{verified:true,executors:['ai'],capabilities:['text','json','vision','web_search']}},credentialRef:'test:fixture',preflight:async()=>({upperBoundMicros:50,currency:'EUR',priceVersion:'synthetic-only'}),transport:{create:async(payload,options)=>{events.push('provider');return respond(payload,options);}}}));
 const config={contractVersion:'1.0',revision:'fixture-revision',fallback:'none',activeProfile:'default',profiles:{default:{[taskType]:{providerId:'anthropic',model:'fixture-model'}}},exceptions:[]};
 const runner=createTaskRunner({registry,store:{admit:async(request,{runId})=>{events.push('admit');return {runId,snapshot:registry.resolve(config,request),status:'running',replay:false};},reconcile:async()=>{events.push('reconcile');return {state:'uncertain'};}}});
 return {calls,events,async getMessagesTask(identity){
  if(controlUnavailable)throw Error('Synthetic control unavailable');
  assert.equal(identity.userId,'synthetic');assert.equal(identity.taskType,taskType);
  const ordinal=++sequence;
  const facade=createMessagesFacade({runner,...identity,context:{requestId:'fixture-request-'+ordinal,runId:'fixture-run-'+ordinal,budgetId:'fixture-budget',maxToolCalls:3,budget:{currency:'EUR',maxCostMicros:100,maxOutputTokens:4096,deadlineMs:1000}}});
  return {create:async parameters=>{calls.push(parameters);return facade.create(parameters);}};
 }};
}
module.exports={taskFixture};
