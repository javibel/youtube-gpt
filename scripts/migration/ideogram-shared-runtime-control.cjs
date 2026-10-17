'use strict';
const assert=require('node:assert/strict'),{harness}=require('./ideogram-shared-runtime-fixture.cjs'),{createIdeogramSharedRuntimeDependencies:compose}=require('../../lib/ai/ideogram-shared-runtime.cjs'),{createSharedRuntimeBootstrap}=require('../../lib/ai/shared-runtime-bootstrap.cjs'),{createRegistry}=require('../../contracts/ai/v1/core.cjs'),{createControlStore}=require('../../contracts/ai/v1/control-store.cjs'),{schema}=require('../../lib/ai/brand-image-reference.cjs');
const modes=['settled-replay','native-producer','quote-limit','quote-tariff','unknown-cost','usage-tariff','provider-uncertain','lost-settlement-ack','blocked-budget','foreign-principal','captured-originals'];
module.exports=async({pool,prefix,test})=>{
 for(const [ordinal,mode]of modes.entries())await test('image shared native SQL: '+mode,async()=>{
  const client=await pool.connect(),h=harness(),task='brand.image-generation',budgetId=prefix+'_image_'+ordinal,roles={reader:'ytv_ai_test_reader',activator:'ytv_ai_test_activator',executor:'ytv_ai_test_executor'};
  const database=role=>({role,async transaction(work){await client.query('SET LOCAL ROLE '+roles[role]);let settlement=false;try{const result=await work({query:async(sql,args)=>{if(sql.includes("SET state='settled'"))settlement=true;return(await client.query(sql,args)).rows;}});if(settlement&&mode==='lost-settlement-ack')throw Error('Synthetic original settlement ACK lost');return result;}finally{await client.query('RESET ROLE');}}});
  try{
   await client.query('BEGIN');
   const identity=(await client.query("SELECT current_database() AS name,current_setting('data_directory') AS directory")).rows[0];assert.equal(identity.name,'ytubviral_migration_test');
   const options={...h.options,readerDatabase:database('reader'),activatorDatabase:database('activator'),executorDatabase:database('executor'),storageIdentity:{databaseName:identity.name,readerRole:roles.reader,activatorRole:roles.activator,executorRole:roles.executor},budgetBindings:{summary:[budgetId],[task]:[budgetId]},authorize:async()=>({budgetId})};
   const dependencies=compose(options),registry=createRegistry();if(mode==='captured-originals'){options.image.models['ideogram-v3'].verified=false;options.image.pricing.version='foreign';options.image.preflight=()=>{throw Error('replacement');};options.image.priceUsage=()=>{throw Error('replacement');};options.image.transport={create:()=>{throw Error('replacement');}};}for(const adapter of dependencies.adapters)registry.register(adapter);
   await client.query('INSERT INTO ytv_ai_test_v1.budgets(budget_id,currency,limit_micros) VALUES($1,$2,$3)',[budgetId,'EUR',100]);
   const activator=createControlStore(database('activator'),registry),current=(await activator.active())?.revision??null,config={...structuredClone(h.state.head),revision:prefix+'_image_revision_'+ordinal};
   await activator.publish(config,{actor:'synthetic-image-owner'});await activator.activate(config.revision,{expectedRevision:current,actor:'synthetic-image-owner',reason:'Owned rollback-only image composition contract'});
   const prepared=await createSharedRuntimeBootstrap(dependencies).prepare();assert(prepared.readiness.providerIds.includes('ideogram'));assert.equal(h.state.imageRequests.length,0);
   const request={serviceId:'brand-agent',taskType:task,operationKey:prefix+'_image_original_'+ordinal,language:'en',instructionsVersion:'brand-image-generation-v1',outputSchema:schema,requiredCapabilities:['image_generation']},params={max_tokens:2048,messages:[{role:'user',content:'A cinematic creator studio'}]},invoke=async identity=>(await prepared.factory(identity??request)).create(params);
   if(mode==='quote-limit')h.state.imageQuote.upperBoundMicros=101;
   if(mode==='quote-tariff')h.state.imageQuote.priceVersion='foreign-tariff';
   if(mode==='unknown-cost')h.state.imagePrice=null;
   if(mode==='usage-tariff')h.state.imagePrice.priceVersion='foreign-tariff';
   if(mode==='provider-uncertain')h.state.imageResponse=async()=>new Response('Closed unknown response',{status:503});
   if(mode==='blocked-budget')await client.query('UPDATE ytv_ai_test_v1.budgets SET blocked=true WHERE budget_id=$1',[budgetId]);
   if(mode==='native-producer'){
    const bytes=await require('sharp')({create:{width:1024,height:1024,channels:3,background:'#aaddff'}}).png().toBuffer(),{imageFixture}=require('./cron-brand-image-fixture.cjs'),{drain}=require('./social-post-original-fixture.cjs'),b=imageFixture({binaryRuntime:{getMessagesTask:prepared.factory},nativeCodec:true,downloadBytes:bytes});
    try{await b.beginImage(image=>b.image.consumeCronBrandImage(image,async own=>{assert.equal(own.width,1024);assert.equal(own.height,1024);assert.equal(own.contentType,'image/jpeg');assert.equal(own.bytes[0],255);assert.equal(own.bytes[1],216);await own.validateBeforeDispatch();}));assert.equal(b.calls.filter(v=>v==='binary-download').length,1);assert.equal(b.calls.filter(v=>v==='binary-decode').length,1);assert.equal(b.blobCalls.length,0);}finally{await drain(b);}
   }else if(mode==='foreign-principal'){
    await assert.rejects(invoke({...request,serviceId:'other'}),e=>e.code==='permissions');const {serviceId:_service,...rest}=request;await assert.rejects(invoke({...rest,userId:'brand-agent'}),e=>e.code==='permissions');
   }else if(['quote-limit','quote-tariff','provider-uncertain','lost-settlement-ack','blocked-budget'].includes(mode)){
    await assert.rejects(invoke(),e=>mode==='lost-settlement-ack'?e.code==='uncertain':true);
    if(mode==='provider-uncertain')await assert.rejects(invoke());
   }else{
    const first=await invoke(),second=await invoke();assert.deepEqual(JSON.parse(first.content[0].text),JSON.parse(second.content[0].text));assert.equal(first.execution.providerId,'ideogram');assert.equal(first.execution.configRevision,config.revision);
    assert.equal(first.accounting.state,['unknown-cost','usage-tariff'].includes(mode)?'uncertain':'settled');
   }
   const rows=(await client.query('SELECT r.run_id,r.task_type,r.revision,r.snapshot,r.status,r.usage,q.state,q.amount_micros,q.actual_micros FROM ytv_ai_test_v1.runs r JOIN ytv_ai_test_v1.reservations q USING(run_id) WHERE q.budget_id=$1',[budgetId])).rows,budget=(await client.query('SELECT reserved_micros,settled_micros,blocked FROM ytv_ai_test_v1.budgets WHERE budget_id=$1',[budgetId])).rows[0];
   const denied=['blocked-budget','foreign-principal'].includes(mode),zero=['quote-limit','quote-tariff'].includes(mode),uncertain=['unknown-cost','usage-tariff','provider-uncertain'].includes(mode);
   assert.equal(rows.length,denied?0:1);assert.equal(h.state.imageRequests.length,denied||zero?0:1);
   assert.equal(Number(budget.reserved_micros),uncertain?100:0);assert.equal(Number(budget.settled_micros),denied||zero||uncertain?0:40);
   if(!denied){const row=rows[0];assert.equal(row.task_type,task);assert.equal(row.revision,config.revision);assert.equal(row.snapshot.providerId,'ideogram');assert.equal(row.snapshot.model,'ideogram-v3');assert.equal(Number(row.amount_micros),100);assert.equal(row.state,uncertain?'uncertain':'settled');if(uncertain){assert.equal(row.actual_micros,null);assert.equal(row.usage.costMicros,null);}else assert.equal(Number(row.actual_micros),zero?0:40);}
   if(mode==='settled-replay'){const text=await(await prepared.factory({userId:'synthetic-owner',taskType:'summary',operationKey:prefix+'_same_mixed_text',language:'en',instructionsVersion:'synthetic-mixed-v1'})).create({max_tokens:20,messages:[{role:'user',content:'Closed text sibling'}]});assert.equal(text.execution.providerId,'anthropic');assert.equal(text.accounting.state,'settled');assert.deepEqual(h.state.dispatches,['anthropic']);const mixed=(await client.query('SELECT r.task_type,r.snapshot,q.actual_micros FROM ytv_ai_test_v1.runs r JOIN ytv_ai_test_v1.reservations q USING(run_id) WHERE q.budget_id=$1',[budgetId])).rows;assert.equal(mixed.length,2);assert.deepEqual(mixed.map(v=>v.snapshot.providerId).sort(),['anthropic','ideogram']);}
   // This is an own rollback-only fixture. No saved operational pointer, result,
   // reservation or business record is reset/adopted to authorize continuation.
  }finally{await client.query('ROLLBACK');client.release();}
 });
};
