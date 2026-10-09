'use strict';
const assert=require('node:assert/strict');
const {createOpenAITaskFactory}=require('../../lib/ai/openai-task-factory.cjs');
const {createOpenAIAdapter}=require('../../lib/ai/adapters/openai.cjs');
module.exports=async function({prefix,createRegistry,createControlStore,database,cfg,budget,stats,test}){
 const models={
  'fixture-openai-a':{verified:true,executors:['ai'],capabilities:['text']},
  'fixture-openai-b':{verified:true,executors:['ai'],capabilities:['text']}
 };
 const quote=async()=>({upperBoundMicros:60,currency:'EUR',priceVersion:'synthetic-runtime-v1'});
 const price=async()=>({costMicros:7,currency:'EUR',priceVersion:'synthetic-runtime-v1',estimated:false});
 const registry=createRegistry();
 registry.register(createOpenAIAdapter({models,credentialRef:'test:runtime',preflight:quote,priceUsage:price,transport:{create:async()=>{throw Error('Configuration service must never execute a provider');}}}));
 const activator=createControlStore(database('activator'),registry),reader=createControlStore(database('reader'),registry);
 const previous=(await reader.active()).revision;
 const selection=(suffix,model)=>({...cfg('openai-runtime-'+suffix,'openai'),profiles:{default:{summary:{providerId:'openai',model}}}});
 const first=selection('a','fixture-openai-a'),second=selection('b','fixture-openai-b');
 const budgetId=await budget('openai-runtime',300),events={transactions:0,credentials:0,dispatches:0};
 const executor=database('executor');
 const measuredDatabase={role:'executor',transaction:fn=>{events.transactions++;return executor.transaction(fn);}};
 const parameters={max_tokens:20,messages:[{role:'user',content:'Synthetic runtime á🙂'}]};
 const identity=operationKey=>({userId:prefix+'_openai_owner',taskType:'summary',language:'es',instructionsVersion:'runtime-test-v1',operationKey});
 const wire=()=>({status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Respuesta conservada á🙂',annotations:[]}]}],usage:{input_tokens:15,input_tokens_details:{cached_tokens:3,cache_write_tokens:2},output_tokens:5}});
 const response=()=>new Response(JSON.stringify(wire()),{headers:{'content-type':'application/json'}});
 const base={database:measuredDatabase,models,credentialRef:'test:runtime',maxRequestBytes:8192,maxResponseBytes:8192,
  preflight:quote,priceUsage:price,
  policies:{summary:{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:60,maxOutputTokens:20,deadlineMs:5000}}},
  authorize:async({userId,taskType})=>userId===identity('x').userId&&taskType==='summary'?{budgetId}:null,
  readCredential:async({credentialRef})=>{events.credentials++;assert.equal(credentialRef,'test:runtime');return 'synthetic-runtime-credential';},
  fetch:async(url,options)=>{events.dispatches++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.redirect,'error');return response();}
 };
 const factory=extra=>createOpenAITaskFactory({...base,...extra});
 const ledger=async()=>{const row=await stats(budgetId);return {reserved:Number(row.reserved_micros),settled:Number(row.settled_micros),blocked:row.blocked};};
 try{
  await test('OpenAI composition requires executor, explicit network/credential/catalog/pricing/policy/auth; construction has no effects',async()=>{
   for(const field of Object.keys(base))assert.throws(()=>factory({[field]:undefined}));
   for(const role of ['reader','activator'])assert.throws(()=>factory({database:database(role)}));
   assert.throws(()=>factory({install:true}));factory();
   assert.deepEqual(events,{transactions:0,credentials:0,dispatches:0});
   await assert.rejects(executor.transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.active_revision SET revision=revision WHERE false')),e=>e.code==='42501');
  });
  await test('OpenAI composition denies unauthorized caller before admission, credentials and transport',async()=>{
   const before=await ledger();await assert.rejects(factory()({...identity('denied'),userId:prefix+'_other'}),e=>e.code==='permissions');
   assert.deepEqual(await ledger(),before);assert.deepEqual(events,{transactions:0,credentials:0,dispatches:0});
  });
  await test('OpenAI composition does not fall back from an active unregistered provider or reserve its budget',async()=>{
   const before=await ledger(),task=await factory()(identity('unregistered'));
   await assert.rejects(task.create(parameters),e=>e.code==='configuration');
   assert.deepEqual(await ledger(),before);assert.equal(events.credentials,0);assert.equal(events.dispatches,0);
  });
  await activator.publish(first,{actor:'test-admin'});await activator.publish(second,{actor:'test-admin'});
  await activator.activate(first.revision,{expectedRevision:previous,actor:'test-admin',reason:'Synthetic OpenAI durable composition'});
  await test('OpenAI durable admission precedes credential read; concurrent retry and configuration switch preserve one pinned dispatch and settlement',async()=>{
   let ready,release;const started=new Promise(resolve=>ready=resolve),credential=new Promise(resolve=>release=resolve),bodies=[];
   const task=await factory({readCredential:async value=>{events.credentials++;assert.equal(value.credentialRef,'test:runtime');ready();return credential;},fetch:async(url,options)=>{events.dispatches++;assert.equal(url,'https://api.openai.com/v1/responses');bodies.push(JSON.parse(options.body));return response();}})(identity('pinned'));
   const running=task.create(parameters);let failure;
   try{
    await Promise.race([started,running.then(()=>{throw Error('Completed before credential gate');})]);assert.deepEqual(await ledger(),{reserved:60,settled:0,blocked:false});
    assert.equal(events.credentials,1);assert.equal(events.dispatches,0);
    await assert.rejects((await factory()(identity('pinned'))).create(parameters),e=>e.code==='uncertain');
    assert.equal(await (await factory()(identity('pinned'))).retrieve(parameters),null);
    assert.equal(events.credentials,1);assert.equal(events.dispatches,0);
    await activator.activate(second.revision,{expectedRevision:first.revision,actor:'test-admin',reason:'Synthetic switch during credential resolution'});
   }catch(error){failure=error;}finally{release('synthetic-runtime-credential');}
   const output=await running;if(failure)throw failure;
   assert.equal(bodies[0].model,'fixture-openai-a');assert.equal(output.execution.configRevision,first.revision);
   assert.equal(output.content[0].text,'Respuesta conservada á🙂');assert.equal(output.execution.usage.costMicros,7);
   const after=await ledger();assert.deepEqual(after,{reserved:0,settled:7,blocked:false});
   for(const method of ['retrieve','create']){
    const retained=await (await factory()(identity('pinned')))[method](parameters);
    assert.equal(retained.content[0].text,output.content[0].text);assert.equal(retained.execution.configRevision,first.revision);assert.equal(retained.accounting.replay,true);
   }
   assert.equal(events.credentials,1);assert.equal(events.dispatches,1);assert.deepEqual(await ledger(),after);
   const fresh=await (await factory()(identity('new-model'))).create(parameters);
   assert.equal(fresh.execution.model,'fixture-openai-b');assert.equal(fresh.execution.configRevision,second.revision);
   assert.equal(events.credentials,2);assert.equal(events.dispatches,2);assert.deepEqual(await ledger(),{reserved:0,settled:14,blocked:false});
  });
  await test('OpenAI lost body retains PostgreSQL reservation and never redispatches or exposes a recoverable result',async()=>{
   const before=await ledger();let calls=0,credentials=0;
   const make=()=>factory({readCredential:async()=>{credentials++;return 'synthetic';},fetch:async()=>{calls++;return new Response('{',{headers:{'content-type':'application/json'}});}});
   await assert.rejects((await make()(identity('uncertain'))).create(parameters),e=>e.result?.error?.code==='uncertain');
   const after=await ledger();assert.deepEqual(after,{...before,reserved:before.reserved+60});
   await assert.rejects((await make()(identity('uncertain'))).create(parameters),e=>e.code==='uncertain');
   assert.equal(await (await make()(identity('uncertain'))).retrieve(parameters),null);
   assert.equal(calls,1);assert.equal(credentials,1);assert.deepEqual(await ledger(),after);
  });
  await test('OpenAI local preflight rejection settles zero without credentials/network and replays the original failure',async()=>{
   const before=await ledger();let calls=0,credentials=0;
   const make=()=>factory({preflight:async()=>({upperBoundMicros:61,currency:'EUR',priceVersion:'synthetic-runtime-v1'}),readCredential:async()=>{credentials++;return 'synthetic';},fetch:async()=>{calls++;return response();}});
   for(let i=0;i<2;i++)await assert.rejects((await make()(identity('preflight'))).create(parameters),e=>e.result?.error?.code==='quota');
   assert.equal(calls,0);assert.equal(credentials,0);assert.deepEqual(await ledger(),before);
  });
 }finally{
  const active=(await reader.active()).revision;
  if(active!==previous)await activator.activate(previous,{expectedRevision:active,actor:'test-admin',reason:'Restore prior synthetic configuration'});
 }
};
