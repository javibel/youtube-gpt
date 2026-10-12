'use strict';
// Test-only common policy/runtime composition. No real provider or tariff.
const assert=require('node:assert/strict');
const {createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const {createTaskFactory}=require('../../lib/ai/task-factory.cjs');
const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');
module.exports=function(user,options,hold){
 const registry=createRegistry(),identities=[],requests=[];
 registry.register(createAnthropicAdapter({models:{'synthetic-model':{verified:true,executors:['ai'],capabilities:['text','json']}},credentialRef:'test:synthetic',
  preflight:async()=>({upperBoundMicros:50,currency:'EUR',priceVersion:'synthetic-only'}),priceUsage:async()=>options.unknownPrice?null:({costMicros:7,currency:'EUR',priceVersion:'synthetic-only',estimated:false}),
  transport:{create:(payload,opts)=>hold('tip-provider',async()=>{assert.equal(payload.model,'synthetic-model');assert.equal(payload.max_tokens,200);assert.equal(opts.maxRetries,0);assert.equal(payload.tools,undefined);
   if(options.providerError)throw Error('private synthetic credential');return {content:[{type:'text',text:options.tipText??'{"es":"Publica en el horario observado.","en":"Publish in the observed slot."}'}],stop_reason:options.tipStop??'end_turn',usage:{input_tokens:10,output_tokens:20}};})}}));
 const config={contractVersion:'1.0',revision:'synthetic-best-time',fallback:'none',activeProfile:'default',profiles:{default:{'youtube.best-time-tip':{providerId:'anthropic',model:'synthetic-model'}}},exceptions:[]};
 const runner=createTaskRunner({registry,store:{admit:(request,{runId})=>hold('tip-admit',async()=>{requests.push(request);return {runId,snapshot:registry.resolve(config,request),status:'running',replay:false};}),
  reconcile:(_runId,result)=>hold('tip-settle',async()=>({state:options.uncertainAccounting||result.usage.costMicros===null?'uncertain':'settled'}))}});
 const factory=createTaskFactory({runner,policies:{'youtube.best-time-tip':{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:100,maxOutputTokens:200,deadlineMs:10000}}},authorize:async identity=>{assert.equal(identity.userId,user.id);assert.equal(identity.taskType,'youtube.best-time-tip');return {budgetId:'synthetic-budget'};}});
 return {identities,requests,getMessagesTask:identity=>hold('tip-control',async()=>{identities.push(identity);assert.equal(identity.operationKey.length,36);assert.equal(identity.instructionsVersion,'best-time-tip-v1');assert.equal(identity.incompletePolicy,'reject');assert.equal(identity.language,'es,en');return factory(identity);})};
};
