'use strict';
const assert=require('node:assert/strict');
const {harness}=require('./shared-runtime.test.cjs');
const {createSharedRuntimeBootstrap}=require('../../lib/ai/shared-runtime-bootstrap.cjs');
const {createControlStore}=require('../../contracts/ai/v1/control-store.cjs');
const {createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createConfigurationService}=require('../../lib/ai/configuration-service.cjs');
// The same native client owns one rollback-only contract transaction. No old
// active pointer, budget or run is adopted, renewed or reset to make it pass.
module.exports=async({pool,prefix,test})=>{
 await test('shared composition: native three-role ACL, mixed Anthropic/OpenAI tasks, administrative switch and pinned SQL accounting in an owned rollback-only transaction',async()=>{
  const client=await pool.connect(),h=harness(),roles={reader:'ytv_ai_test_reader',activator:'ytv_ai_test_activator',executor:'ytv_ai_test_executor'};
  const database=role=>({role,async transaction(work){await client.query('SET LOCAL ROLE '+roles[role]);try{return await work({query:async(sql,args)=>(await client.query(sql,args)).rows});}finally{await client.query('RESET ROLE');}}});
  try{
   await client.query('BEGIN');
   const identity=(await client.query('SELECT current_database() AS name')).rows[0];
   const registry=createRegistry();for(const adapter of h.options.adapters)registry.register(adapter);
   const activator=createControlStore(database('activator'),registry),budgetId=prefix+'_shared_budget';
   await client.query('INSERT INTO ytv_ai_test_v1.budgets(budget_id,currency,limit_micros) VALUES($1,$2,$3)',[budgetId,'EUR',100]);
   const current=(await activator.active())?.revision??null;
   const config={contractVersion:'1.0',revision:prefix+'_shared_v1',fallback:'none',activeProfile:'mixed',profiles:{mixed:{summary:{providerId:'anthropic',model:'fixture'},detail:{providerId:'openai',model:'fixture'}},reversed:{summary:{providerId:'openai',model:'fixture'},detail:{providerId:'anthropic',model:'fixture'}}},exceptions:[]};
   await activator.publish(config,{actor:'synthetic-owner'});await activator.activate(config.revision,{expectedRevision:current,actor:'synthetic-owner',reason:'Owned rollback-only shared composition contract'});
   const options={...h.options,readerDatabase:database('reader'),activatorDatabase:database('activator'),executorDatabase:database('executor'),storageIdentity:{databaseName:identity.name,readerRole:roles.reader,activatorRole:roles.activator,executorRole:roles.executor},taskCatalog:{summary:{executor:'ai',capabilities:['text'],runtimeIds:['web']},detail:{executor:'ai',capabilities:['text'],runtimeIds:['web']}},policies:{summary:h.options.policies.summary,detail:h.options.policies.summary},budgetBindings:{summary:[budgetId],detail:[budgetId]},authorize:async({userId})=>userId===prefix+'_shared_owner'?{budgetId}:null};
   const c=await createSharedRuntimeBootstrap(options).prepare();assert.equal(c.readiness.assignments.length,4);assert.deepEqual([...c.readiness.providerIds],['anthropic','openai']);
   const service=createConfigurationService({...c.configurationDependencies,getActor:async()=> 'synthetic-owner'});
   const invoke=async(taskType,operationKey)=>{const task=await c.factory({userId:prefix+'_shared_owner',taskType,language:'en',instructionsVersion:'shared-synthetic-v1',operationKey});return task.create({max_tokens:20,messages:[{role:'user',content:'Synthetic shared composition contract'}]});};
   const first=await invoke('summary',prefix+'_shared_a'),second=await invoke('detail',prefix+'_shared_b');
   assert.equal(first.execution.providerId,'anthropic');assert.equal(second.execution.providerId,'openai');assert.equal(first.accounting.state,'settled');assert.equal(second.accounting.state,'settled');
   const next={...config,revision:prefix+'_shared_v2',activeProfile:'reversed'},preview=await service.preview(next,{reason:'Synthetic profile switch through shared service'});await service.activate(preview.previewId);
   const third=await invoke('summary',prefix+'_shared_c');assert.equal(third.execution.providerId,'openai');assert.equal(third.execution.configRevision,next.revision);
   const runs=(await client.query('SELECT r.run_id,r.revision,r.snapshot,r.status,v.state,v.actual_micros FROM ytv_ai_test_v1.runs r JOIN ytv_ai_test_v1.reservations v USING(run_id) WHERE v.budget_id=$1 ORDER BY r.created_at,r.run_id',[budgetId])).rows;
   assert.equal(runs.length,3);assert(runs.every(r=>r.status==='completed'&&r.state==='settled'&&Number(r.actual_micros)===0));
   assert.equal(runs.filter(r=>r.revision===config.revision).length,2);assert.equal(runs.filter(r=>r.revision===next.revision).length,1);
   assert.deepEqual(h.state.dispatches,['anthropic','openai','openai']);
   await assert.rejects(c.factory({userId:'foreign',taskType:'summary',language:'en',instructionsVersion:'test-v1'}),e=>e.code==='permissions');
  }finally{await client.query('ROLLBACK');client.release();}
 });
};
