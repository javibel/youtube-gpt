'use strict';
const assert=require('node:assert/strict'),{loadBootstrap,entries,deferred}=require('./configuration-bootstrap.test.cjs');
module.exports=async function({prefix,registry,createControlStore,database,cfg,pool,test}){
 const reader=createControlStore(database('reader'),registry),activator=createControlStore(database('activator'),registry),previous=(await reader.active()).revision;
 const base={...cfg('admin_bootstrap'),activeProfile:'alpha',profiles:{alpha:{summary:{providerId:'fixture-alpha',model:'test-model'}},beta:{summary:{providerId:'fixture-beta',model:'test-model'}}}},changed={...base,revision:prefix+'_admin_bootstrap_changed',activeProfile:'beta'};
 const compose=()=>({registry,readerDatabase:database('reader'),activatorDatabase:database('activator'),storageIdentity:{databaseName:'ytubviral_migration_test',readerRole:'ytv_ai_test_reader',activatorRole:'ytv_ai_test_activator'},taskCatalog:{summary:{executor:'ai',capabilities:['text'],runtimeIds:['web']}},getRuntimes:async()=>[{id:'web',contractVersions:['1.0'],adapters:{'fixture-alpha':'test-1','fixture-beta':'test-1'}}],checkCredential:async()=>true,timeoutMs:5000});
 const events=async revision=>(await pool.query('SELECT count(*)::int AS n FROM ytv_ai_test_v1.switch_events WHERE revision=$1',[revision])).rows[0].n;
 async function restoreBase(){const current=(await reader.active()).revision;if(current!==base.revision)await activator.activate(base.revision,{expectedRevision:current,actor:'test-admin',reason:'Synthetic administrative setup'});}
 try{
  await activator.publish(base,{actor:'test-admin'});await activator.publish(changed,{actor:'test-admin'});await restoreBase();
  await test('administrative composition native role/grant preparation installs once; original server preview switches and rolls back with session actor and CAS',async()=>{
   const h={state:{actor:'synthetic-admin@example.invalid'}},e=entries(h),deps=compose(),count=await events(base.revision),original=e.first.installAdministrativeConfigurationRuntime(deps);
   assert.equal(e.second.installAdministrativeConfigurationRuntime(deps),original);const readiness=await original;assert.equal(readiness.configRevision,base.revision);assert.equal(readiness.assignments.length,2);assert.equal(await events(base.revision),count);assert.equal((await reader.active()).revision,base.revision);
   const service=e.runtime.getConfigurationService(),preview=await service.preview(changed,{reason:'Synthetic original preview'});assert.equal(e.second.installAdministrativeConfigurationRuntime(deps),original);assert.equal(e.runtime.getConfigurationService(),service);
   h.state.actor='different@example.invalid';await assert.rejects(service.activate(preview.previewId),error=>error.code==='permissions');assert.equal(await events(changed.revision),0);h.state.actor='synthetic-admin@example.invalid';
   assert.equal((await service.activate(preview.previewId)).revision,changed.revision);assert.equal(await events(changed.revision),1);await assert.rejects(service.activate(preview.previewId),error=>error.code==='permissions');
   const fresh=entries(h);await fresh.first.installAdministrativeConfigurationRuntime(compose());await assert.rejects(fresh.runtime.getConfigurationService().activate(preview.previewId),error=>error.code==='permissions');
   const rollback=await service.previewRollback(base.revision,{reason:'Synthetic rollback'});await service.activate(rollback.previewId);assert.equal((await reader.active()).revision,base.revision);assert.equal(await events(base.revision),count+1);assert.throws(()=>e.second.installAdministrativeConfigurationRuntime({...deps}));
   const audit=(await pool.query('SELECT actor FROM ytv_ai_test_v1.switch_events WHERE revision=$1',[changed.revision])).rows[0];assert.match(audit.actor,/^admin_[a-f0-9]{64}$/);assert.notEqual(audit.actor,'synthetic-admin@example.invalid');
  });
  await test('administrative composition rejects falsely declared reader over native executor before installation or mutation',async()=>{
   const h={state:{actor:'synthetic-admin@example.invalid'}},e=entries(h),executor=database('executor'),deps={...compose(),readerDatabase:{role:'reader',transaction:executor.transaction.bind(executor)}},before=await events(base.revision);
   await assert.rejects(e.first.installAdministrativeConfigurationRuntime(deps),error=>error.code==='permissions');assert.equal(e.runtime.getConfigurationService(),undefined);assert.equal((await reader.active()).revision,base.revision);assert.equal(await events(base.revision),before);
  });
  await test('administrative composition rereads both native heads after held availability; concurrent authorized switch leaves registration failed without reset',async()=>{
   const checked=deferred(),gate=deferred(),h={state:{actor:'synthetic-admin@example.invalid'}},e=entries(h),deps={...compose(),checkCredential:async()=>{checked.resolve();return gate.promise;}},original=e.first.installAdministrativeConfigurationRuntime(deps);void original.catch(()=>{});await Promise.race([checked.promise,original]);
   await activator.activate(changed.revision,{expectedRevision:base.revision,actor:'test-admin',reason:'Synthetic concurrent switch'});const before=await events(changed.revision);gate.resolve(true);await assert.rejects(original,error=>error.code==='configuration');assert.equal(e.runtime.getConfigurationService(),undefined);assert.equal(await events(changed.revision),before);assert.equal(e.second.installAdministrativeConfigurationRuntime(deps),original);assert.throws(()=>e.second.installAdministrativeConfigurationRuntime({...deps}));await restoreBase();
  });
 }finally{const current=(await reader.active()).revision;if(current!==previous)await activator.activate(previous,{expectedRevision:current,actor:'test-admin',reason:'Restore synthetic configuration after administrative composition'});}
};
