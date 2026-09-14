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
 await test('activator denied execution SQL writes',async()=>assert.rejects(database('activator').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.runs SET status=status WHERE false')),error=>error.code==='42501'));
 await test('configuration revisions immutable to activator',async()=>assert.rejects(database('activator').transaction(tx=>tx.query('UPDATE ytv_ai_test_v1.revisions SET payload=payload WHERE false')),error=>error.code==='42501'));
 await test('reader cannot invoke activation service',async()=>assert.rejects(store('reader').activate('anything',{actor:'test',reason:'test'}),error=>error.code==='permissions'));
 await store('activator').publish(cfg('r0'),{actor:'test-admin'});await store('activator').publish(cfg('r1','fixture-beta'),{actor:'test-admin'});await store('activator').publish(cfg('r2'),{actor:'test-admin'});
 await test('activation records revision and provenance',async()=>{await store('activator').activate(cfg('r0').revision,{expectedRevision:originalHead,actor:'test-admin',reason:'synthetic setup'});assert.equal((await store('reader').active()).revision,cfg('r0').revision);});
 const b0=await budget('snapshot',500);const old=await store('executor').admit(req('old'),{runId:prefix+'_old_run',budgetId:b0});
 await store('activator').activate(cfg('r1').revision,{expectedRevision:cfg('r0').revision,actor:'test-admin',reason:'synthetic switch'});
 await test('old and new executions retain distinct revision snapshots',async()=>{const next=await store('executor').admit(req('new'),{runId:prefix+'_new_run',budgetId:b0});assert.equal(old.snapshot.providerId,'fixture-alpha');assert.equal(next.snapshot.providerId,'fixture-beta');assert.equal((await pool.query('SELECT revision FROM ytv_ai_test_v1.runs WHERE run_id=$1',[old.runId])).rows[0].revision,cfg('r0').revision);});
 await test('stale activation rejected',async()=>assert.rejects(store('activator').activate(cfg('r2').revision,{expectedRevision:cfg('r0').revision,actor:'test-admin',reason:'stale'}),error=>error.code==='configuration'));
 const b1=await budget('concurrent');
 await test('concurrent admissions cannot over-reserve',async()=>{const outcomes=await Promise.allSettled([1,2].map(i=>store('executor').admit(req('concurrent'+i),{runId:prefix+'_concurrent'+i,budgetId:b1})));assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(Number((await stats(b1)).reserved_micros),60);});
 const b2=await budget('idempotency');const duplicate=req('duplicate');duplicate.idempotencyKey=prefix+'_operation';let duplicateRun;
 await test('concurrent idempotent admissions create one reservation',async()=>{const outcomes=await Promise.all([1,2].map(i=>store('executor').admit(duplicate,{runId:prefix+'_duplicate'+i,budgetId:b2})));assert.equal(outcomes[0].runId,outcomes[1].runId);assert.equal(outcomes.filter(r=>r.replay).length,1);assert.equal(Number((await stats(b2)).reserved_micros),60);duplicateRun=outcomes[0].runId;});
 await test('same idempotency key with changed input rejected',async()=>{const changed=structuredClone(duplicate);changed.messages[0].content[0].text='Different synthetic input';await assert.rejects(store('executor').admit(changed,{runId:prefix+'_different',budgetId:b2}),error=>error.code==='invalid_format');});
 await test('fresh store instance retains reservation',async()=>{const replay=await store('executor').admit(duplicate,{runId:prefix+'_fresh',budgetId:b2});assert.equal(replay.replay,true);assert.equal(Number((await stats(b2)).reserved_micros),60);});
 await test('replay cannot change budget or authenticated agent context',async()=>{for(const context of [{budgetId:b0},{budgetId:b2,agentId:'different-agent'}])await assert.rejects(store('executor').admit(duplicate,{runId:prefix+'_context',...context}),error=>error.code==='invalid_format');});
 await test('empty or missing active profile rejected before publication',async()=>{for(const profiles of [{},{another:{summary:{providerId:'fixture-alpha',model:'test-model'}}}])await assert.rejects(store('activator').publish({...cfg('bad'),profiles},{actor:'test-admin'}),error=>error.code==='configuration');});
 await test('unknown cost retains reservation',async()=>{assert.equal((await store('executor').reconcile(duplicateRun,{status:'completed',usage:{costMicros:null}})).state,'uncertain');assert.equal(Number((await stats(b2)).reserved_micros),60);});
 await test('currency mismatch is rejected before settlement',async()=>assert.rejects(store('executor').reconcile(duplicateRun,{status:'completed',usage:{costMicros:10,currency:'USD',priceVersion:'test-v1'}}),error=>error.code==='invalid_format'));
 await test('known cost releases unused reserve exactly once',async()=>{const settlement={status:'completed',usage:{costMicros:10,currency:'EUR',priceVersion:'test-v1'}};await store('executor').reconcile(duplicateRun,settlement);assert.equal((await store('executor').reconcile(duplicateRun,settlement)).replay,true);const row=await stats(b2);assert.equal(Number(row.reserved_micros),0);assert.equal(Number(row.settled_micros),10);});
 await test('conflicting reconciliation is not silently applied',async()=>assert.rejects(store('executor').reconcile(duplicateRun,{status:'completed',usage:{costMicros:20,currency:'EUR',priceVersion:'test-v1'}}),error=>error.code==='uncertain'));
 const b3=await budget('overrun',500);const over=await store('executor').admit(req('overrun'),{runId:prefix+'_overrun_run',budgetId:b3});
 await test('observed overrun freezes new admissions',async()=>{await store('executor').reconcile(over.runId,{status:'completed',usage:{costMicros:70,currency:'EUR',priceVersion:'test-v1'}});assert.equal((await stats(b3)).blocked,true);await assert.rejects(store('executor').admit(req('after-overrun'),{runId:prefix+'_after_overrun',budgetId:b3}),error=>error.code==='quota');});
 await test('stored run omits prompt and instructions',async()=>{const row=(await pool.query('SELECT * FROM ytv_ai_test_v1.runs WHERE run_id=$1',[old.runId])).rows[0];assert.equal(JSON.stringify(row).includes('Synthetic input'),false);assert.equal(JSON.stringify(row).includes('Synthetic instructions'),false);});
 await test('durable runner dispatches once and settles across a fresh instance',async()=>{
  let calls=0;const runtime=createRegistry();runtime.register({providerId:'fixture-beta',adapterVersion:'test-1',enabled:true,credentialRef:'test:fixture',models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},execute:async()=>{calls++;return {status:'completed',text:'Synthetic',usage:{costMicros:7,currency:'EUR',priceVersion:'test-v1'}};}});
  const id=await budget('runner'),input=req('runner');input.idempotencyKey=prefix+'_runner_operation';
  const make=()=>createTaskRunner({store:createControlStore(database('executor'),runtime),registry:runtime});
  const first=await make().run(input,{runId:prefix+'_runner',budgetId:id});const second=await make().run(input,{runId:prefix+'_runner_replay',budgetId:id});
  assert.equal(first.result.status,'completed');assert.equal(first.accounting.state,'settled');assert.equal(second.kind,'existing-run');assert.equal(second.runId,first.result.runId);assert.equal(calls,1);assert.equal(Number((await stats(id)).settled_micros),7);assert.equal(Number((await stats(id)).reserved_micros),0);
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
})().catch(error=>{results.push({name:'setup or orchestration',status:'FAIL',error:error.message});}).finally(async()=>{
 try{if(migrated){
  const cleanup=await pool.connect();
  try{
   await cleanup.query('BEGIN');
   if(originalHead)await cleanup.query('UPDATE ytv_ai_test_v1.active_revision SET revision=$1 WHERE left(revision,length($2))=$2',[originalHead,prefix]);
   else await cleanup.query('DELETE FROM ytv_ai_test_v1.active_revision WHERE left(revision,length($1))=$1',[prefix]);
   await cleanup.query('DELETE FROM ytv_ai_test_v1.reservations WHERE left(budget_id,length($1))=$1',[prefix]);
   await cleanup.query('DELETE FROM ytv_ai_test_v1.runs WHERE left(run_id,length($1))=$1',[prefix]);
   await cleanup.query('DELETE FROM ytv_ai_test_v1.switch_events WHERE left(revision,length($1))=$1',[prefix]);
   await cleanup.query('DELETE FROM ytv_ai_test_v1.revisions WHERE left(revision,length($1))=$1',[prefix]);
   await cleanup.query('DELETE FROM ytv_ai_test_v1.budgets WHERE left(budget_id,length($1))=$1',[prefix]);
   await cleanup.query('COMMIT');
  }catch(error){await cleanup.query('ROLLBACK');throw error;}finally{cleanup.release();}
 }}catch(error){results.push({name:'synthetic row cleanup',status:'FAIL',error:error.message});}
 await pool.end();const report={scope:'identified local PostgreSQL only; additive test schema and NOLOGIN roles; synthetic rows cleaned',results};fs.writeFileSync(path.join(root,'../outputs/control-persistente-pruebas.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
});
