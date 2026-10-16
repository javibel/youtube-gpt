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
 await test('reader metrics group pinned provider, revision, function and agent without exposing payloads',async()=>{
  const from=new Date(Date.now()-60000).toISOString(),to=new Date(Date.now()+60000).toISOString();
  const budgetId=await budget('metrics',200),agentId=prefix+'_agent';
  const first=await store('executor').admit(req('metrics_done'),{runId:prefix+'_metrics_done',budgetId,agentId});
  await store('executor').reconcile(first.runId,{status:'completed',usage:{costMicros:7,currency:'EUR',priceVersion:'fixture-1'}});
  const second=await store('executor').admit(req('metrics_uncertain'),{runId:prefix+'_metrics_uncertain',budgetId,agentId});
  await store('executor').reconcile(second.runId,{status:'uncertain'});
  const overrunBudgetId=await budget('metrics_overrun',60);
  const overrun=await store('executor').admit(req('metrics_overrun'),{runId:prefix+'_metrics_overrun',budgetId:overrunBudgetId,agentId});
  await store('executor').reconcile(overrun.runId,{status:'completed',usage:{costMicros:70,currency:'EUR',priceVersion:'fixture-1'}});
  assert.equal((await stats(overrunBudgetId)).blocked,true);
  const usdBudgetId=prefix+'_metrics_usd';
  await pool.query('INSERT INTO ytv_ai_test_v1.budgets(budget_id,currency,limit_micros) VALUES($1,$2,$3)',[usdBudgetId,'USD',100]);
  const usdRequest=req('metrics_usd');usdRequest.budget.currency='USD';
  const usdRun=await store('executor').admit(usdRequest,{runId:prefix+'_metrics_usd_run',budgetId:usdBudgetId,agentId});
  await store('executor').reconcile(usdRun.runId,{status:'completed',usage:{costMicros:11,currency:'USD',priceVersion:'fixture-1'}});
  const groups=await store('reader').metrics({from,to});
  const group=groups.find(item=>item.agentId===agentId&&item.currency==='EUR');
  assert.deepEqual(group,{providerId:'fixture-beta',revision:cfg('r1').revision,taskType:'summary',agentId,currency:'EUR',runs:3,completed:2,noncompleted:0,unsettled:2,knownCostMicros:'7',retainedMicros:'120',reportedUnsettledCostMicros:'70',heldWithoutCostCount:1,latencySamples:2,latencyP95Ms:group.latencyP95Ms});
  assert.ok(group.latencyP95Ms>=0);
  const usdGroup=groups.find(item=>item.agentId===agentId&&item.currency==='USD');
  assert.equal(usdGroup.runs,1);assert.equal(usdGroup.knownCostMicros,'11');assert.equal(usdGroup.retainedMicros,'0');assert.equal(usdGroup.reportedUnsettledCostMicros,'0');assert.equal(usdGroup.heldWithoutCostCount,0);
  const prior=groups.find(item=>item.revision===cfg('r0').revision&&item.agentId===null);
  assert.equal(prior.providerId,'fixture-alpha');
  assert.equal(prior.latencySamples,0);
  assert.equal(prior.latencyP95Ms,null);
  assert.equal(JSON.stringify(group).includes('Synthetic input'),false);
  await assert.rejects(store('executor').metrics({from,to}),error=>error.code==='permissions');
  await assert.rejects(store('reader').metrics({from:to,to:from}),error=>error.code==='invalid_format');
 });
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
 await test('actual native AB cookie/account/plan/token/source route uses installed server factory and PostgreSQL ledger;command replay denied',async()=>{
  const {load}=require('./route-harness.cjs');const {createTaskFactory}=require('../../lib/ai/task-factory.cjs');const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');
  const actualRegistry=createRegistry();let calls=0;
  actualRegistry.register(createAnthropicAdapter({models:{'test-model':{verified:true,executors:['ai'],capabilities:['text','json']}},credentialRef:'test:fixture',preflight:async()=>({upperBoundMicros:60,currency:'EUR',priceVersion:'test-v1'}),priceUsage:async()=>({costMicros:7,currency:'EUR',priceVersion:'test-v1',estimated:true}),transport:{create:async()=>{calls++;return {content:[{type:'text',text:'{"variantA":"Synthetic A","variantB":"Synthetic B"}'}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:5}};}}}));
  const actualStore=role=>createControlStore(database(role),actualRegistry);const config=cfg('web-route','anthropic');config.profiles.default={'youtube.ab-title-suggestions':{providerId:'anthropic',model:'test-model'}};
  await actualStore('activator').publish(config,{actor:'test-admin'});await actualStore('activator').activate(config.revision,{expectedRevision:cfg('coding').revision,actor:'test-admin',reason:'synthetic HTTP integration'});
  const budgetId=await budget('actual-route');const runtime=load('lib/ai/task-runtime.ts');
  const nativeSQL=require('./admin-feedback-native-pg.test.cjs'),nativeServer=require('./ab-suggestions-native.test.cjs'),nativeBase=await nativeSQL.bound();
  await nativeSQL.db.subscription.create({data:{userId:nativeBase.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+3600000)}});
  await nativeSQL.db.youtubeToken.create({data:{userId:nativeBase.id,channelId:nativeServer.channelId,accessToken:'closed-selection-token',refreshToken:'closed-refresh-never-used',expiresAt:new Date(Date.now()+3600000)}});
  runtime.installTaskRuntime(createTaskFactory({runner:createTaskRunner({registry:actualRegistry,store:actualStore('executor')}),policies:{'youtube.ab-title-suggestions':{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:60,maxOutputTokens:200,deadlineMs:3000}}},authorize:async({userId,taskType})=>userId===nativeBase.id&&taskType==='youtube.ab-title-suggestions'?{budgetId}:null}));
  const original=await nativeServer.bound({nativeBase,db:nativeSQL.db,runtime}),key=require('node:crypto').randomUUID();
  try{
  // Auth.js/SQL establishes this original. A repeated native command is a
  // denial, never a saved-ledger response adopted as a new HTTP receipt.
  const invoke=(title='Native original title',command=key)=>original.start(original.make({headers:{'idempotency-key':command},body:JSON.stringify({title,lang:'es',videoId:nativeServer.videoId,channelId:nativeServer.channelId})}));
  const result=await invoke();assert.equal(result.status,200);const data=await result.json();assert.deepEqual(data.variants,{variantA:'Synthetic A',variantB:'Synthetic B'});assert.equal(data.analysis.userId,nativeBase.id);assert.equal(data.analysis.sessionRef,original.decoded.authSessionRef);assert.equal(data.analysis.commandRef,key);
  assert.equal((await invoke()).status,503);assert.equal(calls,1);
  assert.equal((await invoke('Changed synthetic input')).status,503);assert.equal(calls,1);
  assert.equal((await invoke('Native original title','invalid key with spaces')).status,400);assert.equal(calls,1);
  const runs=(await pool.query('SELECT r.run_id,r.status,r.revision,r.snapshot FROM ytv_ai_test_v1.runs r JOIN ytv_ai_test_v1.reservations h ON h.run_id=r.run_id WHERE h.budget_id=$1',[budgetId])).rows;assert.equal(runs.length,1);assert.equal(runs[0].status,'completed');assert.equal(runs[0].revision,config.revision);
  assert.equal(Number((await stats(budgetId)).reserved_micros),0);assert.equal(Number((await stats(budgetId)).settled_micros),7);
  await test('operator service activates and rolls back through role-bound PostgreSQL',async()=>{
   const {createConfigurationService}=require('../../lib/ai/configuration-service.cjs');
   const operator=createConfigurationService({registry:actualRegistry,reader:actualStore('reader'),activator:actualStore('activator'),taskCatalog:{'youtube.ab-title-suggestions':{executor:'ai',capabilities:['text','json'],runtimeIds:['web','agent']}},getActor:async()=> 'synthetic-operator',getRuntimes:async()=>['web','agent'].map(id=>({id,contractVersions:['1.0'],adapters:{anthropic:'messages-v1'}})),checkCredential:async({credentialRef})=>credentialRef==='test:fixture'});
   const next={...config,revision:prefix+'_operator_candidate'};const preview=await operator.preview(next,{reason:'Synthetic operator activation'});assert.equal((await actualStore('reader').active()).revision,config.revision);await operator.activate(preview.previewId);assert.equal((await actualStore('reader').active()).revision,next.revision);
   assert.equal((await invoke()).status,503);assert.equal(calls,1);
   await operator.activate((await operator.previewRollback(config.revision,{reason:'Synthetic operator rollback'})).previewId);assert.equal((await actualStore('reader').active()).revision,config.revision);
   const events=(await pool.query('SELECT actor,reason FROM ytv_ai_test_v1.switch_events WHERE revision=$1',[next.revision])).rows;assert.equal(events[0].actor,'synthetic-operator');assert.equal(events[0].reason,'Synthetic operator activation');
  });
  }finally{await nativeServer.drain(original);await nativeSQL.close();}
 });
 await test('calendar lost-response retry recovers one result and one settlement; changed context never redispatches',async()=>{
  const {load}=require('./route-harness.cjs');const {createTaskFactory}=require('../../lib/ai/task-factory.cjs');const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');const {createRetryOperation}=require('../../lib/ai/retry-operation.cjs');
  const actualRegistry=createRegistry();let calls=0,changedContext=false;
  const suggestion={title:'Synthetic calendar topic',date:'2026-10-08',hour:0,reason:'Synthetic',description:'Synthetic outline'};
  actualRegistry.register(createAnthropicAdapter({models:{'test-model':{verified:true,executors:['ai'],capabilities:['text','json']}},credentialRef:'test:fixture',preflight:async()=>({upperBoundMicros:60,currency:'EUR',priceVersion:'test-v1'}),priceUsage:async()=>({costMicros:7,currency:'EUR',priceVersion:'test-v1',estimated:true}),transport:{create:async()=>{calls++;return {content:[{type:'text',text:JSON.stringify([suggestion])}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:5}};}}}));
  const actualStore=role=>createControlStore(database(role),actualRegistry),config=cfg('calendar-client','anthropic');config.profiles.default={'calendar.suggestions':{providerId:'anthropic',model:'test-model'}};
  const previous=(await actualStore('reader').active()).revision;
  await actualStore('activator').publish(config,{actor:'test-admin'});await actualStore('activator').activate(config.revision,{expectedRevision:previous,actor:'test-admin',reason:'synthetic calendar retry'});
  const budgetId=await budget('calendar-client'),runtime=load('lib/ai/task-runtime.ts');
  runtime.installTaskRuntime(createTaskFactory({runner:createTaskRunner({registry:actualRegistry,store:actualStore('executor')}),policies:{'calendar.suggestions':{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:60,maxOutputTokens:1200,deadlineMs:3000}}},authorize:async({userId,taskType})=>userId==='synthetic'&&taskType==='calendar.suggestions'?{budgetId}:null}));
  let wallEpoch=Date.parse('2026-10-07T12:00:00.000Z'),analyzedAt=null;
  const FixedDate=class extends Date {constructor(...args){super(...(args.length?args:[wallEpoch]));}static now(){return wallEpoch;}};
  const route=load('app/api/calendar/suggest/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:'synthetic',email:'synthetic@example.invalid'}})},'@/lib/plans':load('lib/plans.ts',{'@/lib/prisma':{prisma:{}}},{Date:FixedDate}),'@/lib/ai/task-runtime':runtime,
   '@/lib/prisma':{prisma:{$transaction:async(fn)=>fn({user:{findUnique:async()=>({id:'synthetic',email:'synthetic@example.invalid'})},subscription:{findUnique:async()=>({userId:'synthetic',status:'active',plan:'pro',stripeCustomerId:'synthetic',currentPeriodEnd:null})},bestTimeAnalysis:{findUnique:async()=>analyzedAt===null?null:{userId:'synthetic',topSlots:[],analyzedAt:new FixedDate(analyzedAt)}},trendAlert:{findMany:async()=>[]},trackedCompetitor:{findMany:async()=>[]},calendarEntry:{findMany:async()=>changedContext?[{id:'changed-context-row',userId:'synthetic',createdAt:new FixedDate(),date:'2026-10-08',title:'Changed synthetic context',status:'idea'}]:[]},youtubeToken:{findUnique:async()=>null}})}}}, {Date:FixedDate});
  const {harness}=require('./calendar-client-retry.test.cjs');
  const invoke=init=>route.POST(new Request('https://example.invalid/api/calendar/suggest',{method:'POST',headers:init.headers,body:init.body}));
  const missing=harness();missing.state.user='synthetic';missing.state.key=prefix+'_calendar_missing';
  missing.state.send=async()=>{throw Error('Synthetic lost request before API admission');};await missing.click();
  missing.state.send=invoke;await missing.click();assert.ok(missing.alert());assert.equal(calls,0);
  assert.equal(missing.requests[1].headers['X-Calendar-Recovery'],'retained-only-v1');
  assert.equal(Number((await stats(budgetId)).reserved_micros),0);assert.equal(Number((await stats(budgetId)).settled_micros),0);
  const reloadedMissing=harness(missing.storage);reloadedMissing.state.user='synthetic';reloadedMissing.state.send=invoke;
  reloadedMissing.render();assert.equal(reloadedMissing.requests.length,0);await reloadedMissing.click();
  assert.ok(reloadedMissing.alert());assert.equal(reloadedMissing.requests[0].headers['Idempotency-Key'],missing.requests[0].headers['Idempotency-Key']);
  assert.equal(reloadedMissing.requests[0].headers['X-Calendar-Recovery'],'retained-only-v1');assert.equal(calls,0);
  assert.equal(Number((await stats(budgetId)).reserved_micros),0);assert.equal(Number((await stats(budgetId)).settled_micros),0);
  const browser=harness();browser.state.user='synthetic';browser.state.key=prefix+'_calendar_retry';let lost=true;
  browser.state.send=async init=>{const response=await invoke(init);assert.equal(response.status,200);
   if(lost){lost=false;throw Error('Synthetic lost response after settlement');}return response;};
  await browser.click();assert.ok(browser.alert());
  const reload=harness(browser.storage);reload.state.user='synthetic';reload.state.send=invoke;reload.render();
  assert.ok(reload.alert());assert.equal(reload.requests.length,0);await reload.click();assert.equal(reload.alert(),undefined);
  assert.equal(reload.requests[0].headers['Idempotency-Key'],browser.requests[0].headers['Idempotency-Key']);
  assert.equal(reload.requests[0].body,browser.requests[0].body);assert.equal(reload.requests[0].headers['X-Calendar-Recovery'],'retained-only-v1');
  assert.equal(reload.storage.size,0);assert.equal(calls,1);await browser.click();assert.equal(browser.alert(),undefined);
  assert.match(browser.text(),/Synthetic calendar topic/);assert.equal(calls,1);
  assert.equal(browser.requests[0].headers['Idempotency-Key'],browser.requests[1].headers['Idempotency-Key']);
  assert.equal(browser.requests[0].headers['X-Calendar-Recovery'],undefined);
  assert.equal(browser.requests[1].headers['X-Calendar-Recovery'],'retained-only-v1');
  // Original route/runtime settles; only the browser fetch/body delivery remains hung.
  for(const stage of ['fetch','json']){
   const waiting=harness();waiting.state.user='synthetic';waiting.state.key=prefix+'_calendar_wait_'+stage;
   let release,ready;const held=new Promise(resolve=>{release=resolve;}),received=new Promise(resolve=>{ready=resolve;});
   waiting.state.send=async init=>{const response=await invoke(init);assert.equal(response.status,200);ready();
    return stage==='fetch'?held:{ok:true,status:200,json:()=>held};};
   const before=calls,pending=waiting.click();await received;for(let i=0;i<12;i++)await Promise.resolve();
   waiting.advance(30000);for(let i=0;i<12;i++)await Promise.resolve();
   assert.ok(waiting.alert());assert.match(waiting.text(),/30 segundos/);assert.equal(waiting.requests[0].signal.aborted,true);
   assert.equal(waiting.timers.size,0);await pending;assert.equal(calls,before+1);
   waiting.state.send=invoke;await waiting.click();assert.equal(waiting.alert(),undefined);assert.match(waiting.text(),/Synthetic calendar topic/);
   assert.equal(waiting.requests[0].body,waiting.requests[1].body);
   assert.equal(waiting.requests[0].headers['Idempotency-Key'],waiting.requests[1].headers['Idempotency-Key']);
   assert.equal(waiting.requests[1].headers['X-Calendar-Recovery'],'retained-only-v1');assert.equal(calls,before+1);
   const stale={suggestions:[{...suggestion,title:'Stale late calendar result'}]};
   release(stage==='fetch'?{ok:true,json:async()=>stale}:stale);for(let i=0;i<12;i++)await Promise.resolve();
   assert.doesNotMatch(waiting.text(),/Stale late calendar result/);assert.equal(waiting.requests.length,2);
  }
  changedContext=true;const conflict=await invoke(browser.requests[1]);
  assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{error:'operation_input_changed',retryMayConsume:false});assert.equal(calls,3);
  assert.equal(Number((await stats(budgetId)).reserved_micros),0);assert.equal(Number((await stats(budgetId)).settled_micros),21);
  await test('calendar original capture differs by one millisecond in same civil day; no retained adoption or redispatch',async()=>{
   changedContext=false;wallEpoch+=1;
   try{const r=await invoke(browser.requests[1]);assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'operation_input_changed',retryMayConsume:false});assert.equal(calls,3);assert.equal(Number((await stats(budgetId)).settled_micros),21);assert.equal(Number((await stats(budgetId)).reserved_micros),0);}
   finally{wallEpoch-=1;}
  });
  await test('calendar declared analysis selection changes with same empty textual summary; no metadata recovery',async()=>{
   changedContext=false;analyzedAt='2000-01-01T00:00:00.000Z';
   try{const r=await invoke(browser.requests[1]);assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'operation_input_changed',retryMayConsume:false});assert.equal(calls,3);assert.equal(Number((await stats(budgetId)).settled_micros),21);assert.equal(Number((await stats(budgetId)).reserved_micros),0);}
   finally{analyzedAt=null;}
  });
  await test('calendar original retained receipt conflicts after day change without renewal or redispatch',async()=>{
   changedContext=false;wallEpoch+=86400000;
   const response=await invoke(browser.requests[1]);
   assert.equal(response.status,409);
   assert.deepEqual(await response.json(),{error:'operation_input_changed',retryMayConsume:false});
   assert.equal(suggestion.date,'2026-10-08');assert.equal(calls,3);
   assert.equal(Number((await stats(budgetId)).reserved_micros),0);
   assert.equal(Number((await stats(budgetId)).settled_micros),21);
  });
  await test('calendar invalid original proposal remains unconfirmed on retained retrieval, one settlement and no substituted date',async()=>{
   wallEpoch=Date.parse('2026-10-07T12:00:00.000Z');suggestion.date='2020-01-01';
   const init={headers:{'Content-Type':'application/json','Idempotency-Key':prefix+'_calendar_invalid_original'},body:JSON.stringify({lang:'es'})};
   const response=await invoke(init);assert.equal(response.status,500);assert.deepEqual(await response.json(),{error:'ai_parse_error'});
   const retained=await invoke({...init,headers:{...init.headers,'X-Calendar-Recovery':'retained-only-v1'}});
   assert.equal(retained.status,503);assert.deepEqual(await retained.json(),{error:'suggestions_unconfirmed',retryMayConsume:false});
   assert.equal(suggestion.date,'2020-01-01');assert.equal(calls,4);
   assert.equal(Number((await stats(budgetId)).reserved_micros),0);
   assert.equal(Number((await stats(budgetId)).settled_micros),28);
  });
 });
 await test('Predictor lost-response retry recovers one result and settlement; changed input or video context never redispatches',async()=>{
  const {load}=require('./route-harness.cjs');const {createTaskFactory}=require('../../lib/ai/task-factory.cjs');const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');const {createRetryOperation}=require('../../lib/ai/retry-operation.cjs');
  const actualRegistry=createRegistry();let calls=0,changedContext=false;
  const prediction={estimatedViews:{low:50,mid:100,high:200},estimatedEngagement:4,titleScore:70,seoScore:65,viralPotential:'medium',strengths:['Synthetic strength'],weaknesses:['Synthetic weakness'],suggestion:'Synthetic advice'};
  actualRegistry.register(createAnthropicAdapter({models:{'test-model':{verified:true,executors:['ai'],capabilities:['text','json']}},credentialRef:'test:fixture',preflight:async()=>({upperBoundMicros:60,currency:'EUR',priceVersion:'test-v1'}),priceUsage:async()=>({costMicros:7,currency:'EUR',priceVersion:'test-v1',estimated:true}),transport:{create:async()=>{calls++;return {content:[{type:'text',text:JSON.stringify(prediction)}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:5}};}}}));
  const actualStore=role=>createControlStore(database(role),actualRegistry),config=cfg('predictor-client','anthropic');config.profiles.default={'youtube.performance-prediction':{providerId:'anthropic',model:'test-model'}};
  const previous=(await actualStore('reader').active()).revision;
  await actualStore('activator').publish(config,{actor:'test-admin'});await actualStore('activator').activate(config.revision,{expectedRevision:previous,actor:'test-admin',reason:'synthetic Predictor retry'});
  const budgetId=await budget('predictor-client'),runtime=load('lib/ai/task-runtime.ts');
  runtime.installTaskRuntime(createTaskFactory({runner:createTaskRunner({registry:actualRegistry,store:actualStore('executor')}),policies:{'youtube.performance-prediction':{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:60,maxOutputTokens:900,deadlineMs:3000}}},authorize:async({userId,taskType})=>userId==='synthetic'&&taskType==='youtube.performance-prediction'?{budgetId}:null}));
  const route=load('app/api/predictor/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:'synthetic'}})},'@/lib/plans':{getUserPlan:async()=>'pro',isPaid:()=>true},'@/lib/ai/task-runtime':runtime,'@/lib/youtube-auth':{getAccessToken:async()=>'synthetic-not-a-token'},'@/lib/prisma':{prisma:{youtubeToken:{findUnique:async()=>({channelId:'synthetic-channel',subscribers:1000})}}}},
   {fetch:async(url,init)=>{assert.equal(init.headers.Authorization,'Bearer synthetic-not-a-token');const address=new URL(url);assert.equal(address.hostname,'www.googleapis.com');
    if(address.pathname==='/youtube/v3/search')return Response.json({items:[0,1,2].map(i=>({id:{videoId:'synthetic-'+i}}))});
    assert.equal(address.pathname,'/youtube/v3/videos');return Response.json({items:[0,1,2].map(i=>({snippet:{title:'Synthetic video '+i,publishedAt:'2026-09-20T12:00:00.000Z',tags:['synthetic'],description:'Synthetic description',thumbnails:{high:{}}},statistics:{viewCount:String(100+i*100+(changedContext?100:0)),likeCount:'10',commentCount:'2'},contentDetails:{duration:'PT5M'}}))});}});
  const keys=[],run=createRetryOperation(()=>prefix+'_predictor_retry');let lost=true,first;
  const invoke=(body,key,recovery=false)=>route.POST(new Request('https://example.invalid/api/predictor',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':key,...(recovery?{'X-Predictor-Recovery':'retained-only-v1'}:{})},body}));
  const send=async(body,key)=>{keys.push(key);const response=await invoke(body,key,!lost);assert.equal(response.status,200);const output=await response.json();if(lost){first=output;lost=false;throw Error('Synthetic lost Predictor response after settlement');}return output;};
  const input={title:'Synthetic title',description:'Synthetic description',tags:'synthetic',lang:'es'};
  await assert.rejects(run(input,send),/lost Predictor response after settlement/);const recovered=await run(input,send);assert.deepEqual(recovered,first);assert.deepEqual(recovered.prediction,prediction);assert.equal(keys[0],keys[1]);assert.equal(calls,1);
  assert.equal((await invoke(JSON.stringify({...input,title:'Changed title'}),keys[0],true)).status,500);assert.equal(calls,1);
  changedContext=true;assert.equal((await invoke(JSON.stringify(input),keys[0],true)).status,500);assert.equal(calls,1);
  assert.equal(Number((await stats(budgetId)).reserved_micros),0);assert.equal(Number((await stats(budgetId)).settled_micros),7);
  await test('actual Predictor component/API/ledger survives same-tab reload after absent admission and committed timeout; selector never authorizes a new inference or settlement',async()=>{
   const {harness}=require('./predictor-client-retry.test.cjs');changedContext=false;
   const browser=harness();browser.setField('title','Synthetic title');browser.setField('description','Synthetic description');browser.setField('tags','synthetic');
   try{
    browser.state.send=async()=>{throw Error('Synthetic loss before server admission');};await browser.click();assert.ok(browser.alert());
    browser.state.send=init=>invoke(init.body,prefix+'_component_'+init.headers['Idempotency-Key'],init.headers['X-Predictor-Recovery']==='retained-only-v1');
    await browser.click();assert.ok(browser.alert());assert.equal(calls,1);assert.equal(Number((await stats(budgetId)).settled_micros),7);
    assert.equal(browser.requests[1].headers['X-Predictor-Recovery'],'retained-only-v1');assert.equal(browser.requests[0].body,browser.requests[1].body);
    const missingReload=harness({storage:browser.storage});
    try{
     missingReload.render();assert.equal(missingReload.requests.length,0);assert.ok(missingReload.alert());
     missingReload.state.send=init=>invoke(init.body,prefix+'_component_'+init.headers['Idempotency-Key'],init.headers['X-Predictor-Recovery']==='retained-only-v1');
     await missingReload.click();assert.ok(missingReload.alert());assert.equal(calls,1);assert.equal(Number((await stats(budgetId)).settled_micros),7);
     assert.equal(missingReload.requests[0].body,browser.requests[0].body);assert.equal(missingReload.requests[0].headers['X-Predictor-Recovery'],'retained-only-v1');
    }finally{missingReload.unmount();}
    browser.discard();let committed,ready;const received=new Promise(resolve=>{ready=resolve;});
    browser.state.send=async init=>{try{const r=await invoke(init.body,prefix+'_component_'+init.headers['Idempotency-Key'],false);assert.equal(r.status,200);committed=await r.json();return new Promise(()=>{});}finally{ready();}};
    const pending=browser.click();await received;assert.ok(committed);browser.advance(90000);await pending;
    assert.ok(browser.alert());assert.equal(calls,2);assert.equal(Number((await stats(budgetId)).settled_micros),14);
    browser.unmount();const reload=harness({storage:browser.storage});
    try{
     reload.render();assert.equal(reload.requests.length,0);assert.ok(reload.alert());
     reload.state.send=init=>invoke(init.body,prefix+'_component_'+init.headers['Idempotency-Key'],init.headers['X-Predictor-Recovery']==='retained-only-v1');
     await reload.click();assert.equal(reload.alert(),undefined);assert.match(reload.text(),/Synthetic advice/);assert.equal(calls,2);
     assert.equal(browser.requests[2].headers['Idempotency-Key'],reload.requests[0].headers['Idempotency-Key']);assert.equal(reload.requests[0].body,browser.requests[2].body);assert.equal(reload.requests[0].headers['X-Predictor-Recovery'],'retained-only-v1');assert.equal(reload.storage.size,0);
    }finally{reload.unmount();}
    assert.equal(Number((await stats(budgetId)).reserved_micros),0);assert.equal(Number((await stats(budgetId)).settled_micros),14);
   }finally{browser.unmount();}
  });
 });
 await test('Storyboard actual client lost response recovers one inference, settlement and real history row after free quota is consumed',async()=>{
  const {PrismaClient}=require('@prisma/client');const prisma=new PrismaClient({datasources:{db:{url:config.databaseUrl}}});
  const {load}=require('./route-harness.cjs');const {createTaskFactory}=require('../../lib/ai/task-factory.cjs');const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');
  const actualRegistry=createRegistry();let calls=0,identity,failSave=true,loseAdmission=false,unknownReply=false;
  const story='0s-6s: HOOK | A creator opens a notebook';
  actualRegistry.register(createAnthropicAdapter({models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},credentialRef:'test:fixture',preflight:async()=>({upperBoundMicros:60,currency:'EUR',priceVersion:'test-v1'}),priceUsage:async()=>({costMicros:7,currency:'EUR',priceVersion:'test-v1',estimated:true}),transport:{create:async()=>{calls++;if(unknownReply)throw Error('Synthetic lost Storyboard response');return {content:[{type:'text',text:story}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:5}};}}}));
  const actualStore=role=>createControlStore(database(role),actualRegistry),selection=cfg('storyboard-retry','anthropic');selection.profiles.default={'content.storyboard':{providerId:'anthropic',model:'test-model'}};
  const previous=(await actualStore('reader').active()).revision;const users=[];
  try {
   await actualStore('activator').publish(selection,{actor:'test-admin'});await actualStore('activator').activate(selection.revision,{expectedRevision:previous,actor:'test-admin',reason:'Synthetic Storyboard business replay'});
   for(const suffix of ['first','other'])users.push(await prisma.user.create({data:{email:prefix+'_'+suffix+'@example.invalid',name:'Synthetic Storyboard retry'}}));identity=users[0].id;
   const budgetId=await budget('storyboard-retry',1000),runtime=load('lib/ai/task-runtime.ts');
   runtime.installTaskRuntime(createTaskFactory({runner:createTaskRunner({registry:actualRegistry,store:actualStore('executor')}),policies:{'content.storyboard':{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:60,maxOutputTokens:1024,deadlineMs:3000}}},authorize:async({userId,taskType})=>users.some(u=>u.id===userId)&&taskType==='content.storyboard'?{budgetId}:null}));
   const db=new Proxy(prisma,{get(target,key){if(key==='$transaction')return async(fn,opts)=>{let admitted=false,completed=false;const value=await target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){
    if(k==='generation')return new Proxy(t.generation,{get(model,method){if(method==='create')return async args=>{if(failSave){failSave=false;throw Error('Synthetic failure before history commit');}const row=await model.create(args);completed=true;return row;};const v=model[method];return typeof v==='function'?v.bind(model):v;}});
    if(k==='textGenerationAttempt')return new Proxy(t.textGenerationAttempt,{get(model,method){if(method==='create')return async args=>{const row=await model.create(args);admitted=true;return row;};const v=model[method];return typeof v==='function'?v.bind(model):v;}});
    const v=t[k];return typeof v==='function'?v.bind(t):v;
   }})),opts);if(admitted&&loseAdmission){loseAdmission=false;throw Error('Synthetic committed admission ack lost');}if(completed)throw Error('Synthetic committed completion ack lost');return value;};const v=target[key];return typeof v==='function'?v.bind(target):v;}});
   const paid=new Set(),planMock={getUserPlan:async()=>paid.has(identity)?'pro':'free',isPaid:plan=>plan==='pro',getLimits:plan=>({generationsPerMonth:plan==='pro'?200:10})};
   const route=load('app/api/storyboard/route.ts',{'@/lib/text-generation-attempt':require('./text-generation-attempt-fixture.cjs')(db,planMock),'@/lib/generation-quota':require('./generation-quota-fixture.cjs')(prisma),'node:crypto':require('node:crypto'),'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:identity}})},'@/lib/plans':planMock,'@/lib/prisma':{prisma:db},'@/lib/ai/task-runtime':runtime});
   // The actual component lost transport before server admission. Its retry
   // cannot turn a local selector into a new quota admission or inference.
   const missing=require('./storyboard-client-retry.test.cjs').harness();missing.state.user=identity;
   missing.state.send=async()=>{throw Error('Synthetic request lost before admission');};await missing.click();
   const beforeMissing=await stats(budgetId);
   missing.state.send=init=>route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:init.headers,body:init.body}));
   await missing.click();assert.ok(missing.alert());assert.equal(missing.requests[1].headers['X-Storyboard-Recovery'],'retained-only-v1');assert.equal(missing.requests[1].body,missing.requests[0].body);assert.equal(calls,0);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:identity}}),0);assert.equal(await prisma.generation.count({where:{userId:identity}}),0);assert.equal(missing.recorders.length,0);assert.equal(missing.daily(),0);assert.deepEqual(missing.callbacks,[]);assert.deepEqual(await stats(budgetId),beforeMissing);missing.unmount();
   const missingReload=require('./storyboard-client-retry.test.cjs').harness({storage:missing.storage});missingReload.state.user=identity;missingReload.render();assert.equal(missingReload.requests.length,0);assert.equal(missingReload.recorders.length,0);assert.deepEqual(missingReload.callbacks,[]);
   missingReload.state.send=init=>route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:init.headers,body:init.body}));await missingReload.click();assert.ok(missingReload.alert());assert.equal(missingReload.requests[0].headers['Idempotency-Key'],missing.requests[0].headers['Idempotency-Key']);assert.equal(missingReload.requests[0].headers['X-Storyboard-Recovery'],'retained-only-v1');assert.equal(calls,0);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:identity}}),0);assert.deepEqual(await stats(budgetId),beforeMissing);assert.equal(missingReload.storage.size,1);missingReload.unmount();
   const browser=require('./storyboard-client-retry.test.cjs').harness();browser.state.user=identity;
   const input={script:browser.state.scriptContent,lang:browser.state.lang};let lost=true;
   browser.state.send=async init=>{const response=await route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:init.headers,body:init.body}));if(response.ok&&lost){lost=false;throw Error('Synthetic lost response after real history commit');}return response;};
   await browser.click();assert.ok(browser.alert());assert.equal(calls,1);assert.equal(await prisma.generation.count({where:{userId:identity}}),0);assert.equal(browser.daily(),0);assert.deepEqual(browser.callbacks,[]);
   assert.equal(await prisma.textGenerationAttempt.count({where:{userId:identity,state:'pending'}}),1);
   await prisma.$executeRaw`UPDATE rate_limits SET hits=99 WHERE key=${'storyboard:'+identity}`;
   await browser.click();assert.ok(browser.alert());assert.equal(calls,1);assert.equal(await prisma.generation.count({where:{userId:identity}}),1);assert.equal(browser.recorders.length,0);assert.deepEqual(browser.callbacks,[]);
   const key=browser.requests[0].headers['Idempotency-Key'];assert.equal(browser.requests[1].headers['Idempotency-Key'],key);
   const invoke=(body=input,operation=key)=>route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':operation},body:JSON.stringify(body)}));
   const saved=await prisma.generation.findFirst({where:{userId:identity}});assert.equal(saved.template,'video_preview');assert.equal(saved.tokensUsed,5);assert.equal(saved.inputs.script,input.script);assert.match(saved.inputs.retryInputDigest,/^[a-f0-9]{64}$/);
   // Simulate losing that successful HTTP response, then exceeding the throttle.
   await prisma.$executeRaw`UPDATE rate_limits SET hits=99 WHERE key=${'storyboard:'+identity}`;
   await browser.click();assert.equal(browser.alert(),undefined);assert.equal(browser.requests[2].headers['Idempotency-Key'],key);assert.equal(calls,1);assert.equal(browser.recorders.length,1);assert.equal(browser.daily(),1);assert.deepEqual(browser.callbacks,['generated']);
   // Retrying an empty local recording reuses the successful adaptation.
   await browser.finish(10);assert.ok(browser.alert());await browser.click();assert.equal(browser.requests.length,3);assert.equal(browser.recorders.length,2);assert.equal(browser.daily(),2);assert.equal(calls,1);assert.deepEqual(browser.callbacks,['generated']);browser.unmount();
   assert.equal(await prisma.generation.count({where:{userId:identity}}),1);assert.equal((await prisma.$queryRaw`SELECT hits FROM rate_limits WHERE key=${'storyboard:'+identity}`)[0].hits,99);
   assert.equal((await invoke({...input,script:'Changed script'})).status,409);assert.equal((await invoke({...input,lang:'en'})).status,409);assert.equal(calls,1);
   assert.equal((await invoke(input,key+'_new')).status,429);assert.equal(calls,1);
   identity=users[1].id;assert.equal((await invoke()).status,200);assert.equal(calls,2);assert.equal(await prisma.generation.count({where:{userId:identity}}),1);
   assert.equal(Number((await stats(budgetId)).reserved_micros),0);assert.equal(Number((await stats(budgetId)).settled_micros),14);
   for(const suffix of ['full-binding','unknown','admission-ack','free-race','mixed-race','paid-race'])users.push(await prisma.user.create({data:{email:prefix+'_storyboard_'+suffix+'@example.invalid',name:'Synthetic keyed Storyboard'}}));
   // Same truncated prompt is insufficient to establish identical caller input.
   identity=users[2].id;failSave=true;const full={script:'z'.repeat(4000)+'a',lang:'en'},beforeBinding=calls;
   assert.equal((await invoke(full,'full-input')).status,503);assert.equal(calls,beforeBinding+1);assert.equal(await prisma.generation.count({where:{userId:identity}}),0);
   assert.equal((await invoke({...full,script:'z'.repeat(4000)+'b'},'full-input')).status,409);assert.equal(calls,beforeBinding+1);assert.equal(await prisma.generation.count({where:{userId:identity}}),0);
   const settled=await Promise.all([invoke(full,'full-input'),invoke(full,'full-input')]);assert(settled.every(r=>r.status===200));assert.equal(calls,beforeBinding+1);assert.equal(await prisma.generation.count({where:{userId:identity}}),1);
   const fullRow=await prisma.generation.findFirst({where:{userId:identity}});assert.equal(fullRow.inputs.script,'z'.repeat(4000));assert.equal(await prisma.textGenerationAttempt.count({where:{userId:identity,state:'complete'}}),1);
   identity=users[3].id;unknownReply=true;const beforeUnknown=calls;assert.equal((await invoke(input,'unknown-story')).status,500);assert.equal(calls,beforeUnknown+1);assert.equal(await prisma.generation.count({where:{userId:identity}}),0);
   assert.equal((await invoke(input,'unknown-story')).status,503);assert.equal((await invoke(input,'new-after-unknown')).status,429);assert.equal(calls,beforeUnknown+1);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:identity,state:'pending'}}),1);unknownReply=false;
   identity=users[4].id;loseAdmission=true;const beforeAck=calls;assert.equal((await invoke(input,'lost-admission')).status,503);assert.equal((await invoke(input,'lost-admission')).status,503);assert.equal((await invoke(input,'new-after-ack')).status,429);assert.equal(calls,beforeAck);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:identity,state:'pending'}}),1);
   const keyless=()=>route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));
   for(const[index,mixed,isPaid]of [[5,false,false],[6,true,false],[7,true,true]]){
    identity=users[index].id;if(isPaid){paid.add(identity);await prisma.generation.createMany({data:Array.from({length:199},()=>({userId:identity,template:'title',inputs:{},output:'Synthetic historical quota',tokensUsed:0}))});}
    const beforeRace=calls,raced=await Promise.all([invoke(input,'racing-key'),mixed?keyless():invoke(input,'racing-other')]);assert.deepEqual(raced.map(r=>r.status).sort(),[200,429]);assert.equal(calls,beforeRace+1);assert.equal(await prisma.generation.count({where:{userId:identity,template:'video_preview'}}),1);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:identity}}),1);
   }
   // Native history/ledger commit survives a client deadline; neither local
   // abort nor a later read can infer another Storyboard or settlement.
   const timedUser=await prisma.user.create({data:{email:prefix+'_storyboard_timeout@example.invalid',name:'Synthetic timed Storyboard'}});users.push(timedUser);identity=timedUser.id;paid.add(identity);
   const timed=require('./storyboard-client-retry.test.cjs').harness();timed.state.user=identity;
   const beforeTimedCalls=calls,beforeTimed=await stats(budgetId);let signalReady;const timedReady=new Promise(resolve=>{signalReady=resolve;});
   timed.state.send=async init=>{const r=await route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:init.headers,body:init.body}));assert.equal(r.status,200);signalReady();return new Promise(()=>{});};
   const waiting=timed.click();await timedReady;timed.advance(90000);await waiting;assert.ok(timed.alert());assert.equal(timed.requests[0].signal.aborted,true);assert.equal(timed.recorders.length,0);assert.deepEqual(timed.callbacks,[]);assert.equal(calls,beforeTimedCalls+1);assert.equal(await prisma.generation.count({where:{userId:identity}}),1);
   timed.unmount();const reloadedTimed=require('./storyboard-client-retry.test.cjs').harness({storage:timed.storage});reloadedTimed.state.user=identity;reloadedTimed.render();assert.equal(reloadedTimed.requests.length,0);assert.equal(reloadedTimed.recorders.length,0);assert.deepEqual(reloadedTimed.callbacks,[]);
   reloadedTimed.state.send=init=>route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:init.headers,body:init.body}));await reloadedTimed.click();assert.equal(reloadedTimed.alert(),undefined);assert.equal(reloadedTimed.requests[0].headers['X-Storyboard-Recovery'],'retained-only-v1');assert.equal(reloadedTimed.requests[0].headers['Idempotency-Key'],timed.requests[0].headers['Idempotency-Key']);assert.equal(reloadedTimed.requests[0].body,timed.requests[0].body);assert.equal(reloadedTimed.recorders.length,1);assert.equal(reloadedTimed.daily(),1);assert.deepEqual(reloadedTimed.callbacks,['generated']);assert.equal(calls,beforeTimedCalls+1);assert.equal(await prisma.generation.count({where:{userId:identity}}),1);const afterTimed=await stats(budgetId);assert.equal(Number(afterTimed.settled_micros),Number(beforeTimed.settled_micros)+7);assert.equal(Number(afterTimed.reserved_micros),Number(beforeTimed.reserved_micros));assert.equal(reloadedTimed.storage.size,1);const selector=JSON.parse([...reloadedTimed.storage.values()][0]);assert.equal(selector.key,timed.requests[0].headers['Idempotency-Key']);assert.equal(selector.body,timed.requests[0].body);reloadedTimed.unmount();
   const confirmedReload=require('./storyboard-client-retry.test.cjs').harness({storage:reloadedTimed.storage});confirmedReload.state.user=identity;confirmedReload.render();assert.equal(confirmedReload.requests.length,0);assert.equal(confirmedReload.recorders.length,0);confirmedReload.state.send=init=>route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:init.headers,body:init.body}));await confirmedReload.click();assert.equal(confirmedReload.requests[0].headers['Idempotency-Key'],selector.key);assert.equal(confirmedReload.requests[0].body,selector.body);assert.equal(confirmedReload.requests[0].headers['X-Storyboard-Recovery'],'retained-only-v1');assert.equal(calls,beforeTimedCalls+1);assert.deepEqual(await stats(budgetId),afterTimed);assert.equal(await prisma.generation.count({where:{userId:identity}}),1);confirmedReload.unmount();
  } finally {
   for(const user of users){await prisma.$executeRaw`DELETE FROM rate_limits WHERE key=${'storyboard:'+user.id}`;await prisma.user.delete({where:{id:user.id}});}
   if((await actualStore('reader').active()).revision!==previous)await actualStore('activator').activate(previous,{expectedRevision:selection.revision,actor:'test-admin',reason:'Restore prior synthetic selection'});
   await prisma.$disconnect();
  }
 });
 await test('Generic generation real ledger and history recover failed write, concurrent inserts and lost response with one inference/settlement; web and extension owners remain separate',async()=>{
  await require('./generic-generate-control.cjs')({config,prefix,createRegistry,createControlStore,createTaskRunner,database,cfg,budget,stats});
 });
 await require('./result-retrieval-database.cjs')({prefix,createRegistry,createControlStore,createTaskRunner,database,cfg,budget,stats,test});
 await require('./bulk-replay-control.cjs')({config,prefix,createRegistry,createControlStore,createTaskRunner,database,cfg,budget,stats,test});
 await require('./openai-runtime-control.cjs')({prefix,createRegistry,createControlStore,database,cfg,budget,stats,test});
 await require('./openai-bootstrap-control.cjs')({prefix,createRegistry,createControlStore,database,cfg,budget,stats,test});
 await require('./configuration-route-deadline-control.cjs')({prefix,registry,createControlStore,database,cfg,pool,test});
 await require('./configuration-panel-control.cjs')({prefix,registry,createControlStore,database,cfg,pool,test});
 await require('./configuration-bootstrap-control.cjs')({prefix,registry,createControlStore,database,cfg,pool,test});
 await require('./shared-runtime-control.cjs')({prefix,pool,test});
 await require('./anthropic-transport-control.cjs')({prefix,pool,test});
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
