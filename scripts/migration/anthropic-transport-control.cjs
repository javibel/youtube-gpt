'use strict';
const assert=require('node:assert/strict');
const {fixture}=require('./anthropic-https-fixture.cjs');
const {createSharedRuntimeBootstrap}=require('../../lib/ai/shared-runtime-bootstrap.cjs');
const {createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createControlStore}=require('../../contracts/ai/v1/control-store.cjs');
const {createConfigurationService}=require('../../lib/ai/configuration-service.cjs');
module.exports=async({pool,prefix,test})=>{
 const client=await pool.connect(),roles={reader:'ytv_ai_test_reader',activator:'ytv_ai_test_activator',executor:'ytv_ai_test_executor'},budgetId=prefix+'_anthropic_wire_budget';
 // Defense in depth: a missing VM replacement cannot escape through a native
 // HTTP/TLS call. PostgreSQL uses its already owned, non-TLS local client.
 const https=require('node:https'),http=require('node:http'),tls=require('node:tls'),held=[[https,'request'],[https,'get'],[http,'request'],[http,'get'],[tls,'connect']].map(([owner,key])=>({owner,key,original:owner[key]}));let nativeAttempts=0;
 for(const {owner,key}of held)owner[key]=()=>{nativeAttempts++;throw Error('Native provider network is forbidden in this SQL contract');};
 const database=role=>({role,async transaction(work){await client.query('SET LOCAL ROLE '+roles[role]);try{return await work({query:async(sql,args)=>(await client.query(sql,args)).rows});}finally{await client.query('RESET ROLE');}}});
 const ledger=async()=>{const b=(await client.query('SELECT reserved_micros,settled_micros,blocked FROM ytv_ai_test_v1.budgets WHERE budget_id=$1',[budgetId])).rows[0];return {reserved:Number(b.reserved_micros),settled:Number(b.settled_micros),blocked:b.blocked};};
 try{
  await client.query('BEGIN');
  const native=(await client.query('SELECT current_database() AS name')).rows[0],catalog={summary:{executor:'ai',capabilities:['text'],runtimeIds:['web']}};
  await client.query('INSERT INTO ytv_ai_test_v1.budgets(budget_id,currency,limit_micros) VALUES($1,$2,$3)',[budgetId,'EUR',100]);
  const schema={models:{'synthetic-a':{verified:true,executors:['ai'],capabilities:['text']},'synthetic-b':{verified:true,executors:['ai'],capabilities:['text']}},credentialRef:'test:anthropic-wire',apiVersion:'2023-06-01',maxRequestBytes:8192,maxResponseBytes:8192,preflight:async()=>({upperBoundMicros:8,currency:'EUR',priceVersion:'synthetic-wire-v1'}),priceUsage:async()=>({costMicros:7,currency:'EUR',priceVersion:'synthetic-wire-v1',estimated:false})};
  let credentials=0,onCredential=async()=> 'synthetic-wire-key';
  const make=async(r,extra={})=>{
   const adapter=r.factory.createAnthropicHttpsAdapter({...schema,resolveAddress:r.resolveAddress,readCredential:async()=>{credentials++;return onCredential();},...extra});
   return createSharedRuntimeBootstrap({adapters:[adapter],readerDatabase:database('reader'),activatorDatabase:database('activator'),executorDatabase:database('executor'),storageIdentity:{databaseName:native.name,readerRole:roles.reader,activatorRole:roles.activator,executorRole:roles.executor},taskCatalog:catalog,policies:{summary:{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:10,maxOutputTokens:20,deadlineMs:1000}}},budgetBindings:{summary:[budgetId]},authorize:async({userId})=>userId===prefix+'_anthropic_wire_owner'?{budgetId}:null,getRuntimes:async()=>[{id:'web',contractVersions:['1.0'],adapters:{anthropic:'messages-v1'}}],checkCredential:async()=>true,timeoutMs:1000}).prepare();
  };
  const reg=createRegistry();reg.register(fixture().factory.createAnthropicHttpsAdapter({...schema,resolveAddress:async()=>{throw Error('No DNS setup');},readCredential:async()=>{throw Error('No credential setup');}}));
  const activator=createControlStore(database('activator'),reg),prior=(await activator.active())?.revision??null;
  const config={contractVersion:'1.0',revision:prefix+'_anthropic_wire_v1',fallback:'none',activeProfile:'a',profiles:{a:{summary:{providerId:'anthropic',model:'synthetic-a'}},b:{summary:{providerId:'anthropic',model:'synthetic-b'}}},exceptions:[]};
  await activator.publish(config,{actor:'synthetic-owner'});await activator.activate(config.revision,{expectedRevision:prior,actor:'synthetic-owner',reason:'Owned rollback-only Anthropic transport contract'});
  const identity=key=>({userId:prefix+'_anthropic_wire_owner',taskType:'summary',language:'en',instructionsVersion:'synthetic-wire-v1',operationKey:prefix+'_'+key}),parameters={max_tokens:20,messages:[{role:'user',content:'Synthetic owned transport contract'}]};
  await test('Anthropic HTTPS original joins shared bootstrap; native admission precedes credential/DNS and administrative switch retains the pinned model and one settled result',async()=>{
   const r=fixture(),c=await make(r),service=createConfigurationService({...c.configurationDependencies,getActor:async()=> 'synthetic-owner'});assert.equal(credentials,0);assert.equal(r.resolutions.length,0);
   let started,release;const ready=new Promise(resolve=>started=resolve),held=new Promise(resolve=>release=resolve);onCredential=async()=>{assert.deepEqual(await ledger(),{reserved:10,settled:0,blocked:false});started();return held;};
   const task=await c.factory(identity('pinned')),running=task.create(parameters);let failure;
   try{await Promise.race([ready,running.then(()=>{throw Error('Result before credential gate');})]);assert.equal(r.calls.length,0);await assert.rejects((await c.factory(identity('pinned'))).create(parameters),e=>e.code==='uncertain');assert.equal(await (await c.factory(identity('pinned'))).retrieve(parameters),null);const next={...config,revision:prefix+'_anthropic_wire_v2',activeProfile:'b'},preview=await service.preview(next,{reason:'Synthetic switch during original credential wait'});await service.activate(preview.previewId);}catch(error){failure=error;}finally{release('synthetic-wire-key');}
   const result=await running;if(failure)throw failure;
   assert.equal(result.content[0].text,'Synthetic pinned response');assert.equal(result.execution.model,'synthetic-a');assert.equal(result.execution.configRevision,config.revision);assert.equal(result.execution.providerId,'anthropic');assert.equal(result.accounting.state,'settled');assert.deepEqual(await ledger(),{reserved:0,settled:7,blocked:false});assert.equal(JSON.parse(r.sends[0]).model,'synthetic-a');
   for(const method of ['retrieve','create']){const retained=await (await c.factory(identity('pinned')))[method](parameters);assert.equal(retained.execution.configRevision,config.revision);assert.equal(retained.accounting.replay,true);}
   assert.equal(credentials,1);assert.equal(r.resolutions.length,1);assert.equal(r.calls.length,1);assert.equal(r.agents[0].destroyed,true);
  });
  onCredential=async()=> 'synthetic-wire-key';
  await test('Anthropic truncated HTTP keeps its native reservation uncertain; the original retry/read cannot redispatch or invent a result',async()=>{
   const before=await ledger(),r=fixture({body:'{'}),c=await make(r),n=credentials;
   await assert.rejects((await c.factory(identity('uncertain'))).create(parameters),e=>e.result?.error?.code==='uncertain');const after=await ledger();assert.deepEqual(after,{...before,reserved:before.reserved+10});
   await assert.rejects((await c.factory(identity('uncertain'))).create(parameters),e=>e.code==='uncertain');assert.equal(await (await c.factory(identity('uncertain'))).retrieve(parameters),null);assert.equal(credentials,n+1);assert.equal(r.calls.length,1);assert.deepEqual(await ledger(),after);
  });
  await test('Anthropic local quote rejection settles zero before credential and DNS without clearing a previous uncertain reservation',async()=>{
   const before=await ledger(),r=fixture(),c=await make(r,{preflight:async()=>({upperBoundMicros:11,currency:'EUR',priceVersion:'synthetic-wire-v1'})}),n=credentials;
   for(let i=0;i<2;i++)await assert.rejects((await c.factory(identity('preflight'))).create(parameters),e=>e.result?.error?.code==='quota');assert.equal(credentials,n);assert.equal(r.resolutions.length,0);assert.equal(r.calls.length,0);assert.deepEqual(await ledger(),before);
  });
 }finally{try{await client.query('ROLLBACK');}finally{client.release();for(const {owner,key,original}of held)owner[key]=original;}}
 assert.equal(nativeAttempts,0,'A synthetic provider contract attempted a native connection');
};
