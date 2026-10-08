'use strict';
const assert=require('node:assert/strict');
const {createTaskFactory}=require('../../lib/ai/task-factory.cjs');
const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');
module.exports=async function({prefix,createRegistry,createControlStore,createTaskRunner,database,cfg,budget,stats,test}){
 const registry=createRegistry();let calls=0;const requests=[];
 registry.register(createAnthropicAdapter({models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},credentialRef:'test:fixture',preflight:async()=>({upperBoundMicros:60,currency:'EUR',priceVersion:'test-v1'}),priceUsage:async()=>({costMicros:7,currency:'EUR',priceVersion:'test-v1',estimated:true}),transport:{create:async()=>{calls++;return{content:[{type:'text',text:'Original retained partial'}],stop_reason:'max_tokens',usage:{input_tokens:10,output_tokens:5}};}}}));
 const store=createControlStore(database('executor'),registry),activator=createControlStore(database('activator'),registry),reader=createControlStore(database('reader'),registry);
 const previous=(await reader.active()).revision,selection=cfg('result-retrieval','anthropic');selection.profiles.default={summary:{providerId:'anthropic',model:'test-model'}};
 const budgetId=await budget('result-retrieval',300),runner=createTaskRunner({store,registry});
 const factory=()=>createTaskFactory({runner:{run:async(q,c)=>{requests.push({q,c});return runner.run(q,c);},retrieve:async(q,c)=>{requests.push({q,c,readOnly:true});return runner.retrieve(q,c);}},policies:{summary:{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:60,maxOutputTokens:20,deadlineMs:3000}}},authorize:async({userId,taskType})=>userId===prefix+'_owner'&&taskType==='summary'?{budgetId}:null});
 const identity=key=>({userId:prefix+'_owner',taskType:'summary',language:'es',instructionsVersion:'retained-v1',incompletePolicy:'expose-text',operationKey:key});
 const parameters={max_tokens:20,messages:[{role:'user',content:'Original synthetic input'}]};
 const ledger=async()=>{const row=await stats(budgetId);return{reserved:row.reserved_micros,settled:row.settled_micros,blocked:row.blocked};};
 try{
  await activator.publish(selection,{actor:'test-admin'});await activator.activate(selection.revision,{expectedRevision:previous,actor:'test-admin',reason:'Synthetic retained result read'});
  await test('read-only factory on an absent operation leaves budget, provider and store unchanged',async()=>{
   const before=await ledger(),task=await factory()(identity('absent'));assert.equal(await task.retrieve(parameters),null);assert.equal(calls,0);assert.deepEqual(await ledger(),before);
   const {q,c}=requests.at(-1);assert.equal(await store.retrieve(q,c),null);
  });
  await test('fresh factory reads original settled incomplete result after configuration switch without another inference or settlement',async()=>{
   const task=await factory()(identity('completed')),output=await task.create(parameters);assert.equal(output.incomplete,true);assert.equal(calls,1);const before=await ledger();
   await activator.activate(previous,{expectedRevision:selection.revision,actor:'test-admin',reason:'Restore prior synthetic selection before read'});
   const next=await factory()(identity('completed')),retained=await next.retrieve(parameters);assert.equal(retained.content[0].text,output.content[0].text);assert.equal(retained.incomplete,true);assert.equal(retained.usage.output_tokens,5);assert.equal(retained.execution.configRevision,selection.revision);assert.equal(calls,1);assert.deepEqual(await ledger(),before);
  });
  await test('pending admission and unknown accounting return no recoverable result and never dispatch or reclaim budget',async()=>{
   const task=await factory()(identity('pending'));assert.equal(await task.retrieve(parameters),null);const {q,c}=requests.at(-1);
   // Create the synthetic admission through the original store; never reset it
   // or use its presence as authority to dispatch an adapter.
   await activator.activate(selection.revision,{expectedRevision:previous,actor:'test-admin',reason:'Synthetic pending read'});
   const admitted=await store.admit(q,c),before=await ledger();assert.equal(await task.retrieve(parameters),null);assert.equal(calls,1);assert.deepEqual(await ledger(),before);
   await store.reconcile(admitted.runId,{status:'uncertain'});const uncertain=await ledger();assert.equal(await task.retrieve(parameters),null);assert.equal(calls,1);assert.deepEqual(await ledger(),uncertain);
  });
  await test('changed input and unauthenticated principal cannot retrieve retained output; partial policy still controls exposure',async()=>{
   const before=await ledger(),task=await factory()(identity('completed'));
   await assert.rejects(task.retrieve({...parameters,messages:[{role:'user',content:'Changed synthetic input'}]}),e=>e.code==='invalid_format');
   await assert.rejects(factory()({...identity('completed'),userId:prefix+'_foreign'}),e=>e.code==='permissions');
   const strict=await factory()({...identity('completed'),incompletePolicy:'reject'});await assert.rejects(strict.retrieve(parameters),e=>e.result?.status==='incomplete');assert.equal(calls,1);assert.deepEqual(await ledger(),before);
  });
 }finally{
  if((await reader.active()).revision!==previous)await activator.activate(previous,{expectedRevision:selection.revision,actor:'test-admin',reason:'Restore synthetic selection'});
 }
};
