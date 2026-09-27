'use strict';
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const repo=path.resolve(__dirname,'../..');const root=path.dirname(repo);
const {validate}=require('./isolation.cjs');
const config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
const {Pool}=require('pg');
const {createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createControlStore}=require('../../contracts/ai/v1/control-store.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const pool=new Pool({connectionString:config.databaseUrl,ssl:false,max:6,options:'',application_name:'ytv-contract-test',connectionTimeoutMillis:3000});
const prefix='fixture_'+randomUUID().replaceAll('-','');
const roleNames={reader:'ytv_ai_test_reader',activator:'ytv_ai_test_activator',executor:'ytv_ai_test_executor'};
function database(role){return {role,async transaction(fn){const client=await pool.connect();try{await client.query('BEGIN');await client.query('SET LOCAL ROLE '+roleNames[role]);const result=await fn({query:async(sql,args)=>(await client.query(sql,args)).rows});await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}};}
const registry=createRegistry();for(const id of ['fixture-alpha','fixture-beta'])registry.register({providerId:id,adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},execute:async()=>{throw Error('No adapter is executed by storage tests');}});
const store=role=>createControlStore(database(role),registry);
const cfg=(suffix,provider='fixture-alpha')=>({contractVersion:'1.0',revision:prefix+'_'+suffix,fallback:'none',activeProfile:'default',profiles:{default:{summary:{providerId:provider,model:'test-model'}}},exceptions:[]});
const req=(suffix,cost=60)=>({requestId:prefix+'_'+suffix,taskType:'summary',contractVersion:'1.0',inputVersion:'1.0',language:'es',instructions:'Synthetic',instructionsVersion:'test-1',messages:[{role:'user',content:[{type:'text',text:'Synthetic input'}]}],requiredCapabilities:['text'],toolPolicy:{allowed:[],maxCalls:0},budget:{currency:'EUR',maxCostMicros:cost,maxOutputTokens:10,deadlineMs:1000}});
const results=[];let originalHead=null,migrated=false;
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
const budget=async(name,limit=100)=>{const id=prefix+'_'+name;await pool.query('INSERT INTO ytv_ai_test_v1.budgets(budget_id,currency,limit_micros) VALUES($1,$2,$3)',[id,'EUR',limit]);return id;};
const stats=async id=>(await pool.query('SELECT * FROM ytv_ai_test_v1.budgets WHERE budget_id=$1',[id])).rows[0];
(async()=>{
 const identity=(await pool.query("SELECT current_database() AS db,current_setting('data_directory') AS directory")).rows[0];
 assert.equal(identity.db,'ytubviral_migration_test');assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(root,'migration-runtime/database').toLowerCase());
 const before=(await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n;
 await pool.query(fs.readFileSync(path.join(repo,'contracts/ai/v1/control-test.sql'),'utf8'));migrated=true;
 originalHead=(await pool.query('SELECT revision FROM ytv_ai_test_v1.active_revision WHERE singleton=true')).rows[0]?.revision??null;
 await test('additive schema leaves application table count unchanged',async()=>assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,before));
 await test('reader denied SQL writes',async()=>assert.rejects(database('reader').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.active_revision SET revision=revision WHERE false')),error=>error.code==='42501'));
 await test('executor denied configuration SQL writes',async()=>assert.rejects(database('executor').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.active_revision SET revision=revision WHERE false')),error=>error.code==='42501'));
 await test('executor cannot rewrite pinned snapshots',async()=>assert.rejects(database('executor').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.runs SET snapshot=snapshot WHERE false')),error=>error.code==='42501'));
 await test('executor cannot rewrite reservation amounts',async()=>assert.rejects(database('executor').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.reservations SET amount_micros=amount_micros WHERE false')),error=>error.code==='42501'));
 await test('executor cannot raise budget ceiling or change currency',async()=>{for(const field of ['limit_micros','currency'])await assert.rejects(database('executor').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.budgets SET '+field+'='+field+' WHERE false')),error=>error.code==='42501');});
 await test('activator denied execution SQL writes',async()=>assert.rejects(database('activator').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.runs SET status=status WHERE false')),error=>error.code==='42501'));
 await test('configuration revisions immutable to activator',async()=>assert.rejects(database('activator').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.revisions SET payload=payload WHERE false')),error=>error.code==='42501'));
 await test('reader cannot invoke activation service',async()=>assert.rejects(store('reader').activate('anything',{actor:'test',reason:'test'}),error=>error.code==='permissions'));
 await store('activator').publish(cfg('r0'),{actor:'test-admin'});await store('activator').publish(cfg('r1','fixture-beta'),{actor:'test-admin'});await store('activator').publish(cfg('r2'),{actor:'test-admin'});
 await test('activation records revision and provenance',async()=>{await store('activator').activate(cfg('r0').revision,{expectedRevision:originalHead,actor:'test-admin',reason:'synthetic setup'});assert.equal((await store('reader').active()).revision,cfg('r0').revision);});
 const b0=await budget('snapshot',500);const old=await store('executor').admit(req('old'),{runId:prefix+'_old_run',budgetId:b0});
 await store('activator').activate(cfg('r1').revision,{expectedRevision:cfg('r0').revision,actor:'test-admin',reason:'synthetic switch'});
 await test('old and new executions retain distinct revision snapshots',async()=>{const next=await store('executor').admit(req('new'),{runId:prefix+'_new_run',budgetId:b0});assert.equal(old.snapshot.providerId,'fixture-alpha');assert.equal(next.snapshot.providerId,'fixture-beta');assert.equal((await pool.query('SELECT revision FROM ytv_ai_test_v1.runs WHERE run_id=$1',[old.runId])).rows[0].revision,cfg('r0').revision);});
 await test('stale activation rejected',async()=>assert.rejects(store('activator').activate(cfg('r2').revision,{expectedRevision:cfg('r0').revision,actor:'test-admin',reason:'stale'}),error=>error.code==='configuration'));
 await test('dispatch claim is durable and single-use under concurrent stores',async()=>{
  const request=req('dispatch');request.budget.deadlineMs=10000;const budgetId=await budget('dispatch'),runId=prefix+'_dispatch';
  await store('executor').admit(request,{runId,budgetId,principalId:'synthetic-principal'});
  const context={runId,budgetId,principalId:'synthetic-principal',dispatchDigest:'a'.repeat(64)};
  await assert.rejects(store('reader').claimDispatch(request,context),e=>e.code==='permissions');
  await assert.rejects(store('executor').claimDispatch(request,{...context,principalId:'different'}),e=>e.code==='permissions');
  const outcomes=await Promise.allSettled([1,2].map(()=>store('executor').claimDispatch(request,context)));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'uncertain');
  const receipt=outcomes.find(x=>x.status==='fulfilled').value;assert.equal(receipt.snapshot.providerId,'fixture-beta');assert.ok(receipt.remainingDeadlineMs>0&&receipt.remainingDeadlineMs<=10000);
  await assert.rejects(store('executor').claimDispatch(request,{...context,dispatchDigest:'b'.repeat(64)}),e=>e.code==='uncertain');
  await assert.rejects(database('executor').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.runs SET dispatch_digest=NULL,dispatched_at=NULL WHERE run_id=$1',[runId])),e=>e.code==='42501');
  assert.equal(Number((await stats(budgetId)).reserved_micros),60);
 });
 await test('uncertain reconciliation and expired runs cannot claim dispatch',async()=>{
  for(const scenario of ['uncertain','expired','blocked']){
   const request=req('dispatch_'+scenario),budgetId=await budget('dispatch_'+scenario),runId=prefix+'_dispatch_'+scenario;
   await store('executor').admit(request,{runId,budgetId});
   if(scenario==='uncertain')await store('executor').reconcile(runId,{status:'uncertain'});
   if(scenario==='expired')await pool.query("UPDATE ytv_ai_test_v1.runs SET created_at=clock_timestamp()-interval '1 day' WHERE run_id=$1",[runId]);
   if(scenario==='blocked')await pool.query('UPDATE ytv_ai_test_v1.budgets SET blocked=true WHERE budget_id=$1',[budgetId]);
   await assert.rejects(store('executor').claimDispatch(request,{runId,budgetId,dispatchDigest:'c'.repeat(64)}));
   assert.equal((await pool.query('SELECT dispatch_digest FROM ytv_ai_test_v1.runs WHERE run_id=$1',[runId])).rows[0].dispatch_digest,null);
  }
 });
 await test('lost acknowledgement after committed dispatch never grants a retry',async()=>{
  const request=req('dispatch_lost');request.budget.deadlineMs=10000;const budgetId=await budget('dispatch_lost'),runId=prefix+'_dispatch_lost';
  await store('executor').admit(request,{runId,budgetId});const underlying=database('executor');
  const lost=createControlStore({role:'executor',async transaction(fn){await underlying.transaction(fn);throw Error('Synthetic lost acknowledgement');}},registry);
  const context={runId,budgetId,dispatchDigest:'d'.repeat(64)};
  await assert.rejects(lost.claimDispatch(request,context),/lost acknowledgement/);
  await assert.rejects(store('executor').claimDispatch(request,context),e=>e.code==='uncertain');
 });
 await test('control outage before admission cannot dispatch or reserve',async()=>{
  const input=req('control-offline'),budgetId=await budget('control-offline'),runId=prefix+'_control_offline';
  const offline=createControlStore({role:'executor',async transaction(){throw Error('Synthetic control unavailable');}},registry);
  await assert.rejects(createTaskRunner({store:offline,registry}).run(input,{runId,budgetId}),/control unavailable/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM ytv_ai_test_v1.runs WHERE run_id=$1',[runId])).rows[0].n,0);
  assert.equal(Number((await stats(budgetId)).reserved_micros),0);
 });
 await test('lost admission acknowledgement leaves one held run without provider retry',async()=>{
  const input=req('admission-lost'),budgetId=await budget('admission-lost'),runId=prefix+'_admission_lost';
  const underlying=database('executor');
  const lost=createControlStore({role:'executor',async transaction(fn){await underlying.transaction(fn);throw Error('Synthetic admission acknowledgement lost');}},registry);
  await assert.rejects(createTaskRunner({store:lost,registry}).run(input,{runId,budgetId}),/acknowledgement lost/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM ytv_ai_test_v1.runs WHERE run_id=$1',[runId])).rows[0].n,1);
  const retry=await createTaskRunner({store:store('executor'),registry}).run(input,{runId:runId+'_retry',budgetId});
  assert.equal(retry.kind,'existing-run');assert.equal(retry.runId,runId);
  assert.equal(Number((await stats(budgetId)).reserved_micros),60);
 });
 const b1=await budget('concurrent');
 await test('concurrent admissions cannot over-reserve',async()=>{const outcomes=await Promise.allSettled([1,2].map(i=>store('executor').admit(req('concurrent'+i),{runId:prefix+'_concurrent'+i,budgetId:b1})));assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(Number((await stats(b1)).reserved_micros),60);});
 const b2=await budget('idempotency');const duplicate=req('duplicate');duplicate.idempotencyKey=prefix+'_operation';let duplicateRun;
 await test('concurrent idempotent admissions create one reservation',async()=>{const outcomes=await Promise.all([1,2].map(i=>store('executor').admit(duplicate,{runId:prefix+'_duplicate'+i,budgetId:b2})));assert.equal(outcomes[0].runId,outcomes[1].runId);assert.equal(outcomes.filter(r=>r.replay).length,1);assert.equal(Number((await stats(b2)).reserved_micros),60);duplicateRun=outcomes[0].runId;});
 await test('same idempotency key with changed input rejected',async()=>{const changed=structuredClone(duplicate);changed.messages[0].content[0].text='Different synthetic input';await assert.rejects(store('executor').admit(changed,{runId:prefix+'_different',budgetId:b2}),error=>error.code==='invalid_format');});
 await test('fresh store instance retains reservation',async()=>{const replay=await store('executor').admit(duplicate,{runId:prefix+'_fresh',budgetId:b2});assert.equal(replay.replay,true);assert.equal(Number((await stats(b2)).reserved_micros),60);});
 await test('replay cannot change budget or authenticated agent context',async()=>{for(const context of [{budgetId:b0},{budgetId:b2,agentId:'different-agent'}])await assert.rejects(store('executor').admit(duplicate,{runId:prefix+'_context',...context}),error=>error.code==='invalid_format');});
 await test('empty or missing active profile rejected before publication',async()=>{for(const profiles of [{},{another:{summary:{providerId:'fixture-alpha',model:'test-model'}}}])await assert.rejects(store('activator').publish({...cfg('bad'),profiles},{actor:'test-admin'}),error=>error.code==='configuration');});
 await test('exception cannot hide an invalid base assignment',async()=>{const c=cfg('masked','unknown-provider');c.exceptions=[{scope:'task',id:'summary',selection:{providerId:'fixture-alpha',model:'test-model'},authorizedBy:'fixture-admin',reason:'Synthetic'}];await assert.rejects(store('activator').publish(c,{actor:'test-admin'}),e=>e.code==='configuration');});
 await test('unmatched exception still requires an available provider',async()=>{const c=cfg('unmatched');c.exceptions=[{scope:'agent',id:'unmatched-agent',selection:{providerId:'unknown-provider',model:'test-model'},authorizedBy:'fixture-admin',reason:'Synthetic'}];await assert.rejects(store('activator').publish(c,{actor:'test-admin'}),e=>e.code==='configuration');});
 await test('unknown cost retains reservation',async()=>{assert.equal((await store('executor').reconcile(duplicateRun,{status:'completed',usage:{costMicros:null}})).state,'uncertain');assert.equal(Number((await stats(b2)).reserved_micros),60);});
 await test('unknown accounting cost preserves completed task status',async()=>{const row=(await pool.query('SELECT status,finished_at FROM ytv_ai_test_v1.runs WHERE run_id=$1',[duplicateRun])).rows[0];assert.equal(row.status,'completed');assert.ok(row.finished_at);});
 await test('currency mismatch is rejected before settlement',async()=>assert.rejects(store('executor').reconcile(duplicateRun,{status:'completed',usage:{costMicros:10,currency:'USD',priceVersion:'test-v1'}}),error=>error.code==='invalid_format'));
 await test('known cost releases unused reserve exactly once',async()=>{const settlement={status:'completed',usage:{costMicros:10,currency:'EUR',priceVersion:'test-v1'}};await store('executor').reconcile(duplicateRun,settlement);assert.equal((await store('executor').reconcile(duplicateRun,settlement)).replay,true);const row=await stats(b2);assert.equal(Number(row.reserved_micros),0);assert.equal(Number(row.settled_micros),10);});
 await test('conflicting reconciliation is not silently applied',async()=>assert.rejects(store('executor').reconcile(duplicateRun,{status:'completed',usage:{costMicros:20,currency:'EUR',priceVersion:'test-v1'}}),error=>error.code==='uncertain'));
 await test('same cost cannot rewrite status or price provenance',async()=>{for(const outcome of [{status:'failed',usage:{costMicros:10,currency:'EUR',priceVersion:'test-v1'}},{status:'completed',usage:{costMicros:10,currency:'EUR',priceVersion:'changed-tariff'}}])await assert.rejects(store('executor').reconcile(duplicateRun,outcome),error=>error.code==='uncertain');});
 await test('same cost cannot change recorded counters or estimation flag',async()=>{for(const extra of [{inputTokens:99},{outputTokens:0},{estimated:true},{estimated:false},{cacheReadTokens:1}])await assert.rejects(store('executor').reconcile(duplicateRun,{status:'completed',usage:{costMicros:10,currency:'EUR',priceVersion:'test-v1',...extra}}),error=>error.code==='uncertain');const row=await stats(b2);assert.equal(Number(row.reserved_micros),0);assert.equal(Number(row.settled_micros),10);});
 await test('same evidence with reordered fields is an idempotent replay',async()=>{const result=await store('executor').reconcile(duplicateRun,{status:'completed',usage:{priceVersion:'test-v1',currency:'EUR',costMicros:10}});assert.equal(result.replay,true);});
 const b3=await budget('overrun',500);const over=await store('executor').admit(req('overrun'),{runId:prefix+'_overrun_run',budgetId:b3});
 await test('observed overrun freezes new admissions',async()=>{await store('executor').reconcile(over.runId,{status:'completed',usage:{costMicros:70,currency:'EUR',priceVersion:'test-v1'}});assert.equal((await stats(b3)).blocked,true);await assert.rejects(store('executor').admit(req('after-overrun'),{runId:prefix+'_after_overrun',budgetId:b3}),error=>error.code==='quota');});
 await test('executor cannot clear an overrun hold directly',async()=>{await assert.rejects(database('executor').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.budgets SET blocked=false WHERE budget_id=$1',[b3])),error=>error.code==='42501');assert.equal((await stats(b3)).blocked,true);});
 await test('stored run omits prompt and instructions',async()=>{const row=(await pool.query('SELECT * FROM ytv_ai_test_v1.runs WHERE run_id=$1',[old.runId])).rows[0];assert.equal(JSON.stringify(row).includes('Synthetic input'),false);assert.equal(JSON.stringify(row).includes('Synthetic instructions'),false);});
 await test('cancellation before dispatch releases the entire reservation',async()=>{const budgetId=await budget('cancel-before-dispatch');const controller=new AbortController();controller.abort();const out=await createTaskRunner({store:store('executor'),registry}).run(req('cancel-before-dispatch'),{runId:prefix+'_cancel_before_dispatch',budgetId,signal:controller.signal});assert.equal(out.result.status,'cancelled');assert.equal(out.accounting.state,'settled');const row=await stats(budgetId);assert.equal(Number(row.reserved_micros),0);assert.equal(Number(row.settled_micros),0);});
 await test('durable runner dispatches once and settles across a fresh instance',async()=>{
  let calls=0;const runtime=createRegistry();runtime.register({providerId:'fixture-beta',adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},execute:async()=>{calls++;return {status:'completed',text:'Synthetic',usage:{costMicros:7,currency:'EUR',priceVersion:'test-v1'}};}});
  const id=await budget('runner'),input=req('runner');input.idempotencyKey=prefix+'_runner_operation';
  const make=()=>createTaskRunner({store:createControlStore(database('executor'),runtime),registry:runtime});
  const first=await make().run(input,{runId:prefix+'_runner',budgetId:id});const second=await make().run(input,{runId:prefix+'_runner_replay',budgetId:id});
  assert.equal(first.result.status,'completed');assert.equal(first.accounting.state,'settled');assert.equal(second.kind,'result');assert.deepEqual(second.result,first.result);assert.equal(second.accounting.replay,true);assert.equal(calls,1);assert.equal(Number((await stats(id)).settled_micros),7);assert.equal(Number((await stats(id)).reserved_micros),0);
 });

 await test('round trip switches new work while in-flight snapshots and completed replay survive',async()=>{
  const runtime=createRegistry(),calls=[];let release,signalStarted;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{signalStarted=resolve;});
  const inputs=['held','beta','returned','unknown-cost'].map(name=>({...req('round-trip-'+name),budget:{...req('round-trip').budget,deadlineMs:10000}}));
  for(const providerId of ['fixture-alpha','fixture-beta'])runtime.register({providerId,adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},execute:async({request})=>{
   calls.push({requestId:request.requestId,providerId});
   if(request.requestId===inputs[0].requestId){signalStarted();await gate;}
   if(request.requestId===inputs[3].requestId)return {status:'completed',text:'Synthetic cost unavailable'};
   return {status:'completed',text:'Synthetic '+providerId,usage:{costMicros:7,currency:'EUR',priceVersion:'test-v1'}};
  }});
  const id=await budget('round-trip',500),control=store('activator'),previous=await store('reader').active();
  const a=cfg('round_trip_a'),b=cfg('round_trip_b','fixture-beta');
  await control.publish(a,{actor:'synthetic-operator'});await control.publish(b,{actor:'synthetic-operator'});
  const make=()=>createTaskRunner({store:createControlStore(database('executor'),runtime),registry:runtime});
  const contexts=inputs.map((_,i)=>({runId:prefix+'_round_trip_'+i,budgetId:id,principalId:'synthetic-owner'}));
  let pending,timer;
  try{
   await control.activate(a.revision,{expectedRevision:previous.revision,actor:'synthetic-operator',reason:'Synthetic round trip setup'});
   pending=make().run(inputs[0],contexts[0]);pending.catch(()=>{});
   await Promise.race([started,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Synthetic task did not start')),2000);})]);clearTimeout(timer);
   await control.activate(b.revision,{expectedRevision:a.revision,actor:'synthetic-operator',reason:'Synthetic switch A to B'});
   const second=await make().run(inputs[1],contexts[1]);
   const unknown=await make().run(inputs[3],contexts[3]);
   await control.activate(a.revision,{expectedRevision:b.revision,actor:'synthetic-operator',reason:'Synthetic rollback B to A'});
   const third=await make().run(inputs[2],contexts[2]);release();const first=await pending;
   const outputs=[first,second,third,unknown];
   assert.deepEqual(outputs.map(o=>o.result.providerId),['fixture-alpha','fixture-beta','fixture-alpha','fixture-beta']);
   assert.deepEqual(outputs.map(o=>o.result.configRevision),[a.revision,b.revision,a.revision,b.revision]);
   for(let i=0;i<inputs.length;i++){
    assert.equal(outputs[i].result.status,'completed');
    const recovered=await make().run(inputs[i],{...contexts[i],runId:contexts[i].runId+'_replay'});
    assert.deepEqual(recovered.result,outputs[i].result);assert.equal(recovered.accounting.replay,true);
   }
   assert.equal(unknown.accounting.state,'uncertain');assert.equal(unknown.result.usage.costMicros,null);
   assert.equal(calls.length,4);assert.equal(calls.filter(c=>c.requestId===inputs[0].requestId).length,1);
   const balances=await stats(id);assert.equal(Number(balances.reserved_micros),60);assert.equal(Number(balances.settled_micros),21);
  }finally{
   clearTimeout(timer);release();if(pending)await pending.catch(()=>{});
   const current=await store('reader').active();
   if(current.revision!==previous.revision)await control.activate(previous.revision,{expectedRevision:current.revision,actor:'synthetic-operator',reason:'Restore synthetic fixture selection'});
  }
 });

 await test('queued dispatch keeps its admitted provider after switch and cannot dispatch twice',async()=>{
  const runtime=createRegistry(),calls=[];
  for(const providerId of ['fixture-alpha','fixture-beta'])runtime.register({providerId,adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},execute:async({request})=>{
   calls.push({requestId:request.requestId,providerId});
   return {status:'completed',text:'Synthetic '+providerId,usage:{costMicros:5,currency:'EUR',priceVersion:'test-v1'}};
  }});
  const control=store('activator'),previous=await store('reader').active();
  const a=cfg('queued_a'),b=cfg('queued_b','fixture-beta');
  await control.publish(a,{actor:'synthetic-operator'});await control.publish(b,{actor:'synthetic-operator'});
  const id=await budget('queued-switch',200),input=req('queued-switch');input.budget.deadlineMs=10000;
  const context={runId:prefix+'_queued_switch',budgetId:id,principalId:'synthetic-owner',dispatchDigest:'e'.repeat(64)};
  const make=()=>createTaskRunner({store:createControlStore(database('executor'),runtime),registry:runtime});
  try{
   await control.activate(a.revision,{expectedRevision:previous.revision,actor:'synthetic-operator',reason:'Synthetic queue setup'});
   const admitted=await store('executor').admit(input,context);
   assert.equal(admitted.snapshot.providerId,'fixture-alpha');assert.deepEqual(calls,[]);
   await control.activate(b.revision,{expectedRevision:a.revision,actor:'synthetic-operator',reason:'Synthetic switch before queued dispatch'});
   const result=await make().runClaimed(input,context);
   assert.equal(result.result.providerId,'fixture-alpha');assert.equal(result.result.configRevision,a.revision);
   assert.equal(result.accounting.state,'settled');assert.deepEqual(calls,[{requestId:input.requestId,providerId:'fixture-alpha'}]);
   await assert.rejects(make().runClaimed(input,context));
   const replay=await make().run(input,{...context,runId:context.runId+'_replay'});
   assert.deepEqual(replay.result,result.result);assert.equal(replay.accounting.replay,true);assert.equal(calls.length,1);
   const fresh=req('queued-switch-fresh');fresh.budget.deadlineMs=10000;
   const newer=await make().run(fresh,{runId:prefix+'_queued_switch_fresh',budgetId:id,principalId:'synthetic-owner'});
   assert.equal(newer.result.providerId,'fixture-beta');assert.equal(newer.result.configRevision,b.revision);
   assert.equal(Number((await stats(id)).settled_micros),10);
  }finally{
   const current=await store('reader').active();
   if(current.revision!==previous.revision)await control.activate(previous.revision,{expectedRevision:current.revision,actor:'synthetic-operator',reason:'Restore synthetic fixture selection'});
  }
 });

 await test('late claim acknowledgement settles without sending to the provider',async()=>{
  let calls=0,now=0;const runtime=createRegistry();
  for(const providerId of ['fixture-alpha','fixture-beta'])runtime.register({providerId,adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},execute:async()=>{calls++;return {status:'completed',text:'Unexpected synthetic call'};}});
  const executor=createControlStore(database('executor'),runtime),id=await budget('late-claim'),input=req('late-claim');input.budget.deadlineMs=10000;
  const context={runId:prefix+'_late_claim',budgetId:id,principalId:'synthetic-owner',dispatchDigest:'f'.repeat(64)};
  await executor.admit(input,context);
  const delayed={...executor,async claimDispatch(...args){const claim=await executor.claimDispatch(...args);now+=20000;return claim;}};
  const result=await createTaskRunner({store:delayed,registry:runtime,clock:()=>now}).runClaimed(input,context);
  assert.equal(result.result.status,'failed');assert.equal(result.result.error.code,'deadline');assert.equal(result.result.usage.costMicros,0);
  assert.equal(result.accounting.state,'settled');assert.equal(calls,0);
  const row=await stats(id);assert.equal(Number(row.reserved_micros),0);assert.equal(Number(row.settled_micros),0);
  const replay=await createTaskRunner({store:executor,registry:runtime}).run(input,{...context,runId:context.runId+'_replay'});
  assert.deepEqual(replay.result,result.result);assert.equal(replay.accounting.replay,true);assert.equal(calls,0);
 });
 await test('late provider response cannot replace a persisted deadline outcome',async()=>{
  let calls=0,release,signalStarted;const started=new Promise(resolve=>{signalStarted=resolve;});
  const late=new Promise(resolve=>{release=resolve;});const runtime=createRegistry();
  runtime.register({providerId:'fixture-beta',adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},execute:async()=>{calls++;signalStarted();return late;}});
  const executor=createControlStore(database('executor'),runtime),budgetId=await budget('late-provider'),input=req('late-provider');input.budget.deadlineMs=150;
  const context={runId:prefix+'_late_provider',budgetId,principalId:'synthetic-owner'};
  let timer;
  try{
   const pending=createTaskRunner({store:executor,registry:runtime}).run(input,context);
   await Promise.race([started,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Synthetic provider did not start')),1000);})]);clearTimeout(timer);
   const timedOut=await pending;assert.equal(timedOut.result.status,'failed');assert.equal(timedOut.result.error.code,'deadline');
   assert.equal(timedOut.result.usage.costMicros,null);assert.equal(timedOut.accounting.state,'uncertain');
   release({status:'completed',text:'Synthetic late success',usage:{costMicros:5,currency:'EUR',priceVersion:'test-v1'}});
   await new Promise(resolve=>setImmediate(resolve));
   const replay=await createTaskRunner({store:executor,registry:runtime}).run(input,{...context,runId:context.runId+'_replay'});
   assert.deepEqual(replay.result,timedOut.result);assert.equal(replay.accounting.replay,true);assert.equal(calls,1);
   const row=await stats(budgetId);assert.equal(Number(row.reserved_micros),60);assert.equal(Number(row.settled_micros),0);
  }finally{clearTimeout(timer);release({status:'completed',text:'Synthetic late cleanup'});}
 });

 await test('executor cannot overwrite or delete persisted output',async()=>{for(const sql of ['UPDATE ytv_ai_test_v1.results SET payload=payload WHERE false','DELETE FROM ytv_ai_test_v1.results WHERE false'])await assert.rejects(database('executor').transaction(tx=>tx.query(sql)),e=>e.code==='42501');});
 await test('unknown-cost output survives restart and stays reserved with principal isolation',async()=>{
  let calls=0;const runtime=createRegistry();runtime.register({providerId:'fixture-beta',adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},execute:async()=>{calls++;return {status:'completed',text:'Synthetic durable private output'};}});
  const id=await budget('unknown-output'),input=req('unknown-output');input.idempotencyKey=prefix+'_unknown_output';const make=()=>createTaskRunner({store:createControlStore(database('executor'),runtime),registry:runtime});
  const context={runId:prefix+'_unknown_output',budgetId:id,principalId:'synthetic-owner-a'};
  const first=await make().run(input,context);const second=await make().run({...input,requestId:prefix+'_new_request_id'},{...context,runId:prefix+'_unused_replay_id'});
  assert.deepEqual(second.result,first.result);assert.equal(second.accounting.state,'uncertain');assert.equal(second.accounting.replay,true);assert.equal(Number((await stats(id)).reserved_micros),60);assert.equal(calls,1);
  await assert.rejects(make().run(input,{...context,principalId:'synthetic-owner-b'}),e=>e.code==='invalid_format');assert.equal(calls,1);
  await assert.rejects(createControlStore(database('executor'),runtime).reconcile(first.result.runId,{status:first.result.status,usage:first.result.usage,result:{...first.result,text:'Changed output'}}),e=>e.code==='uncertain');
  const saved=(await pool.query('SELECT payload FROM ytv_ai_test_v1.results WHERE run_id=$1',[first.result.runId])).rows[0].payload;assert.equal(saved.text,first.result.text);
 });
 await test('lost reconciliation acknowledgement recovers committed output without dispatch',async()=>{
  let calls=0;const runtime=createRegistry();runtime.register({providerId:'fixture-beta',adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},execute:async()=>{calls++;return {status:'completed',text:'Synthetic acknowledged later',usage:{costMicros:4,currency:'EUR',priceVersion:'test-v1'}};}});
  const id=await budget('lost-ack'),input=req('lost-ack'),context={runId:prefix+'_lost_ack',budgetId:id,principalId:'synthetic-owner'};let transactions=0;const db=database('executor');const interrupted={role:'executor',transaction:async fn=>{const result=await db.transaction(fn);if(++transactions===2)throw Error('Synthetic lost commit acknowledgement');return result;}};
  await assert.rejects(createTaskRunner({store:createControlStore(interrupted,runtime),registry:runtime}).run(input,context),e=>e.code==='uncertain');
  const recovered=await createTaskRunner({store:createControlStore(database('executor'),runtime),registry:runtime}).run(input,context);assert.equal(recovered.result.text,'Synthetic acknowledged later');assert.equal(recovered.accounting.replay,true);assert.equal(calls,1);assert.equal(Number((await stats(id)).settled_micros),4);
 });
 await test('incomplete output is recovered with its original status',async()=>{
  let calls=0;const runtime=createRegistry();runtime.register({providerId:'fixture-beta',adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},execute:async()=>{calls++;return {status:'incomplete',text:'Synthetic unfinished'};}});
  const context={runId:prefix+'_incomplete_output',budgetId:await budget('incomplete-output')},input=req('incomplete-output');const run=()=>createTaskRunner({store:createControlStore(database('executor'),runtime),registry:runtime}).run(input,context);const first=await run(),second=await run();assert.deepEqual(second.result,first.result);assert.equal(second.result.status,'incomplete');assert.equal(calls,1);
 });
 await test('coding-only model supports durable admission and scoped result',async()=>{
  const codingRegistry=createRegistry();let calls=0;
  codingRegistry.register({providerId:'fixture-coding',adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['coding'],capabilities:['coding']}},execute:async()=>{calls++;return {status:'completed',data:{changes:[],commands:[],validations:[],pending:[]},usage:{costMicros:0,currency:'EUR',priceVersion:'test-v1'}};}});
  const cstore=role=>createControlStore(database(role),codingRegistry);const configuration=cfg('coding','fixture-coding');
  await cstore('activator').publish(configuration,{actor:'test-admin'});await cstore('activator').activate(configuration.revision,{expectedRevision:cfg('r1').revision,actor:'test-admin',reason:'synthetic coding'});
  const {messages,toolPolicy,...base}=req('coding');const input={...base,requiredCapabilities:['coding'],objective:'Inspect synthetic fixture',repositoryId:'fixture-repository',baseRevision:'fixture-revision',allowedFiles:['src/example.ts'],permissions:{read:true,edit:false,execute:false,commit:false,deploy:false,communicate:false},allowedCommands:[]};
  const out=await createTaskRunner({store:cstore('executor'),registry:codingRegistry,executor:'coding'}).run(input,{runId:prefix+'_coding',budgetId:await budget('coding')});
  assert.equal(out.result.status,'completed');assert.equal((await pool.query('SELECT snapshot FROM ytv_ai_test_v1.runs WHERE run_id=$1',[out.result.runId])).rows[0].snapshot.executor,'coding');assert.equal(calls,1);
 });
 await test('actual AB route uses installed server factory and PostgreSQL ledger',async()=>{
  const {load}=require('./route-harness.cjs');const {createTaskFactory}=require('../../lib/ai/task-factory.cjs');const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');
  const actualRegistry=createRegistry();let calls=0;
  actualRegistry.register(createAnthropicAdapter({models:{'test-model':{verified:true,executors:['ai'],capabilities:['text','json']}},credentialRef:'test:fixture',preflight:async()=>({upperBoundMicros:60,currency:'EUR',priceVersion:'test-v1'}),priceUsage:async()=>({costMicros:7,currency:'EUR',priceVersion:'test-v1',estimated:true}),transport:{create:async()=>{calls++;return {content:[{type:'text',text:'{"variantA":"Synthetic A","variantB":"Synthetic B"}'}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:5}};}}}));
  const actualStore=role=>createControlStore(database(role),actualRegistry);const config=cfg('web-route','anthropic');config.profiles.default={'youtube.ab-title-suggestions':{providerId:'anthropic',model:'test-model'}};
  await actualStore('activator').publish(config,{actor:'test-admin'});await actualStore('activator').activate(config.revision,{expectedRevision:cfg('coding').revision,actor:'test-admin',reason:'synthetic HTTP integration'});
  const budgetId=await budget('actual-route');const runtime=load('lib/ai/task-runtime.ts');
  runtime.installTaskRuntime(createTaskFactory({runner:createTaskRunner({registry:actualRegistry,store:actualStore('executor')}),policies:{'youtube.ab-title-suggestions':{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:60,maxOutputTokens:200,deadlineMs:3000}}},authorize:async({userId,taskType})=>userId==='synthetic'&&taskType==='youtube.ab-title-suggestions'?{budgetId}:null}));
  const route=load('app/api/youtube/ab-test/suggest/route.ts',{'next/server':{NextRequest:Request,NextResponse:Response},'@/auth':{auth:async()=>({user:{id:'synthetic'}})},'@/lib/plans':{getUserPlan:async()=>'pro',isPaid:()=>true},'@/lib/ai/task-runtime':runtime});
  const invoke=(title='Synthetic original',key='synthetic-retry')=>route.POST(new Request('https://example.invalid/api/youtube/ab-test/suggest',{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify({title,lang:'es'})}));
  const result=await invoke();assert.equal(result.status,200);assert.deepEqual(await result.json(),{variantA:'Synthetic A',variantB:'Synthetic B'});
  const replay=await invoke();assert.equal(replay.status,200);assert.deepEqual(await replay.json(),{variantA:'Synthetic A',variantB:'Synthetic B'});assert.equal(calls,1);
  assert.equal((await invoke('Changed synthetic input')).status,503);assert.equal(calls,1);
  assert.equal((await invoke('Synthetic original','invalid key with spaces')).status,400);assert.equal(calls,1);
  assert.equal(Number((await stats(budgetId)).reserved_micros),0);assert.equal(Number((await stats(budgetId)).settled_micros),7);
  await test('operator service activates and rolls back through role-bound PostgreSQL',async()=>{
   const {createConfigurationService}=require('../../lib/ai/configuration-service.cjs');
   const operator=createConfigurationService({registry:actualRegistry,reader:actualStore('reader'),activator:actualStore('activator'),taskCatalog:{'youtube.ab-title-suggestions':{executor:'ai',capabilities:['text','json'],runtimeIds:['web','agent']}},getActor:async()=> 'synthetic-operator',getRuntimes:async()=>['web','agent'].map(id=>({id,contractVersions:['1.0'],adapters:{anthropic:'messages-v1'}})),checkCredential:async({credentialRef})=>credentialRef==='test:fixture'});
   const next={...config,revision:prefix+'_operator_candidate'};const preview=await operator.preview(next,{reason:'Synthetic operator activation'});assert.equal((await actualStore('reader').active()).revision,config.revision);await operator.activate(preview.previewId);assert.equal((await actualStore('reader').active()).revision,next.revision);
   assert.equal((await invoke()).status,200);assert.equal(calls,1);
   await operator.activate((await operator.previewRollback(config.revision,{reason:'Synthetic operator rollback'})).previewId);assert.equal((await actualStore('reader').active()).revision,config.revision);
   const events=(await pool.query('SELECT actor,reason FROM ytv_ai_test_v1.switch_events WHERE revision=$1',[next.revision])).rows;assert.equal(events[0].actor,'synthetic-operator');assert.equal(events[0].reason,'Synthetic operator activation');
  });

 });
})().catch(error=>{results.push({name:'setup or orchestration',status:'FAIL',error:error.message});}).finally(async()=>{
 try{if(migrated){
  const cleanup=await pool.connect();
  try{
   await cleanup.query('BEGIN');
   if(originalHead)await cleanup.query('UPDATE ytv_ai_test_v1.active_revision SET revision=$1 WHERE left(revision,length($2))=$2',[originalHead,prefix]);
   else await cleanup.query('DELETE FROM ytv_ai_test_v1.active_revision WHERE left(revision,length($1))=$1',[prefix]);
   const ownedRuns=(await cleanup.query('SELECT run_id FROM ytv_ai_test_v1.reservations WHERE left(budget_id,length($1))=$1',[prefix])).rows.map(row=>row.run_id);
   await cleanup.query('DELETE FROM ytv_ai_test_v1.reservations WHERE left(budget_id,length($1))=$1',[prefix]);
   await cleanup.query('DELETE FROM ytv_ai_test_v1.runs WHERE run_id=ANY($1::text[]) OR left(run_id,length($2))=$2',[ownedRuns,prefix]);
   await cleanup.query('DELETE FROM ytv_ai_test_v1.switch_events WHERE left(revision,length($1))=$1',[prefix]);
   await cleanup.query('DELETE FROM ytv_ai_test_v1.revisions WHERE left(revision,length($1))=$1',[prefix]);
   await cleanup.query('DELETE FROM ytv_ai_test_v1.budgets WHERE left(budget_id,length($1))=$1',[prefix]);
   await cleanup.query('COMMIT');
  }catch(error){await cleanup.query('ROLLBACK');throw error;}finally{cleanup.release();}
 }}catch(error){results.push({name:'synthetic row cleanup',status:'FAIL',error:error.message});}
 await pool.end();const report={scope:'identified local PostgreSQL only; additive test schema and NOLOGIN roles; synthetic rows cleaned',results};fs.writeFileSync(path.join(root,'../outputs/control-persistente-pruebas.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
});
