'use strict';
const assert=require('node:assert/strict');
const {createPostgresControlDatabase}=require('../../contracts/ai/v1/postgres-storage.cjs');
const {createControlStore,controlSchemaFor}=require('../../contracts/ai/v1/control-store.cjs');
const results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
function connection(role='reader',overrides={}){
 const events=[],row={database_name:'candidate',role_name:'ytv_ai_'+role,session_role:'ytv_ai_'+role,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolreplication:false,rolbypassrls:false,memberships:0,...overrides};
 const client={connection:{stream:{encrypted:true,authorized:true}},release(destroy){events.push(['release',!!destroy]);},async query(sql,args){events.push([sql,args]);if(sql.includes('session_user AS session_role'))return{rows:[row]};return{rows:[]};}};
 return {client,events,options:{role,controlSchema:'ytv_ai_v1',databaseName:'candidate',timeoutMs:1000,connect:async()=>client}};
}
(async()=>{
 await test('operational storage is inert and rejects credential/configuration metadata as a capability',async()=>{
  let connects=0;const c=connection();createPostgresControlDatabase({...c.options,connect:async()=>{connects++;return c.client;}});assert.equal(connects,0);
  for(const extra of [{connectionString:'postgresql://invalid'},{password:'invalid'},{pool:{}},{controlSchema:'ytv_ai_test_v1'}])assert.throws(()=>createPostgresControlDatabase({...c.options,...extra}),e=>e.code==='configuration');
 });
 await test('native role, session identity, membership and privilege mismatches deny the callback',async()=>{
  for(const change of [{role_name:'neondb_owner'},{session_role:'candidate_owner'},{rolsuper:true},{rolcreatedb:true},{rolcreaterole:true},{rolinherit:true},{rolreplication:true},{rolbypassrls:true},{memberships:1},{database_name:'other'}]){
   const c=connection('reader',change);let calls=0;
   await assert.rejects(createPostgresControlDatabase(c.options).transaction(async()=>{calls++;}),e=>e.code==='permissions');
   assert.equal(calls,0);assert(c.events.some(e=>e[0]==='ROLLBACK'));assert.equal(c.events.at(-1)[0],'release');
  }
 });
 await test('verified native TLS is mandatory before BEGIN or application queries',async()=>{
  for(const change of [{encrypted:false},{authorized:false}]){const c=connection();Object.assign(c.client.connection.stream,change);await assert.rejects(createPostgresControlDatabase(c.options).transaction(async()=>{}),e=>e.code==='permissions');assert.deepEqual(c.events,[['release',false]]);}
 });
 await test('reader begins READ ONLY and original activator/executor use distinct sessions',async()=>{
  for(const role of ['reader','activator','executor']){const c=connection(role);assert.equal(await createPostgresControlDatabase(c.options).transaction(async tx=>{await tx.query('SELECT 1');return role;}),role);assert.equal(c.events[0][0],role==='reader'?'BEGIN READ ONLY':'BEGIN READ WRITE');assert(c.events.some(e=>e[0]==='COMMIT'));assert.deepEqual(c.events.at(-1),['release',false]);}
 });
 await test('local transaction failure rolls back without issuing COMMIT',async()=>{
  const c=connection();await assert.rejects(createPostgresControlDatabase(c.options).transaction(async()=>{throw Error('owned callback failure');}),/owned callback failure/);assert(c.events.some(e=>e[0]==='ROLLBACK'));assert(!c.events.some(e=>e[0]==='COMMIT'));
 });
 await test('lost native COMMIT acknowledgement remains uncertain and never reconnects',async()=>{
  const c=connection('executor'),query=c.client.query.bind(c.client);let connections=0;
  c.client.query=async(sql,args)=>{if(sql==='COMMIT')throw Error('native acknowledgement lost');return query(sql,args);};
  const db=createPostgresControlDatabase({...c.options,connect:async()=>{connections++;return c.client;}});
  await assert.rejects(db.transaction(async()=>true),e=>e.code==='uncertain');assert.equal(connections,1);assert.deepEqual(c.events.at(-1),['release',true]);
 });
 await test('deadline during COMMIT reports uncertainty rather than retryable cancellation',async()=>{
  const c=connection('executor'),query=c.client.query.bind(c.client);
  c.client.query=(sql,args)=>sql==='COMMIT'?new Promise(()=>{}):query(sql,args);
  await assert.rejects(createPostgresControlDatabase({...c.options,timeoutMs:30}).transaction(async()=>true),e=>e.code==='uncertain');assert.deepEqual(c.events.at(-1),['release',true]);
 });
 await test('late original connections are reaped after cancellation without entering a transaction',async()=>{
  const c=connection(),abort=new AbortController();let resolve;
  const db=createPostgresControlDatabase({...c.options,connect:()=>new Promise(r=>{resolve=r;})});
  const pending=db.transaction(async()=>assert.fail('retired callback ran'),{signal:abort.signal});abort.abort();await assert.rejects(pending,e=>e.code==='cancelled');resolve(c.client);await new Promise(r=>setImmediate(r));assert.deepEqual(c.events,[['release',true]]);
 });
 await test('cleanup failure cannot turn an acknowledged commit into a retryable execution',async()=>{
  const c=connection('executor');let destroyed=0;
  c.client.connection.stream.destroy=()=>{destroyed++;};c.client.release=()=>{throw Error('Native pool cleanup failed');};
  assert.equal(await createPostgresControlDatabase(c.options).transaction(async()=> 'acknowledged'), 'acknowledged');
  assert.equal(destroyed,1);assert.equal(c.events.filter(event=>event[0]==='COMMIT').length,1);
 });
 await test('operational control store never queries the test namespace or changes parameter data',async()=>{
  const calls=[],database={role:'reader',controlSchema:'ytv_ai_v1',transaction:async work=>work({query:async(sql,args)=>{calls.push({sql,args});return[];}})};
  await createControlStore(database,{}).revision('literal___ytv_control__');assert(calls[0].sql.includes('ytv_ai_v1.revisions'));assert(!calls[0].sql.includes('ytv_ai_test_v1'));assert.deepEqual(calls[0].args,['literal___ytv_control__']);assert.equal(controlSchemaFor({}),'ytv_ai_test_v1');assert.throws(()=>controlSchemaFor({controlSchema:'public; DROP SCHEMA public'}),e=>e.code==='configuration');
 });
 console.log(JSON.stringify({scope:'operational role-bound storage lifecycle and namespace contracts; no native database or provider calls',results},null,2));
 if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
