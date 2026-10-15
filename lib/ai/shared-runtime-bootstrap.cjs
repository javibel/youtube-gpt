'use strict';
const {performance}=require('node:perf_hooks');
const {ContractError,createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createControlStore}=require('../../contracts/ai/v1/control-store.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const {createTaskFactory}=require('./task-factory.cjs');
const {createConfigurationRuntimeBootstrap}=require('./configuration-runtime-bootstrap.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=128;
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const child of Object.values(v))freeze(child);}return v;};
const count=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):null;
const columns={revisions:['revision','contract_version','payload','actor','created_at'],active_revision:['singleton','revision'],switch_events:['event_id','previous_revision','revision','actor','reason','created_at'],runs:['run_id','request_id','task_type','request_fingerprint','idempotency_key','revision','snapshot','status','usage','created_at','finished_at','dispatch_digest','dispatched_at','agent_id'],reservations:['run_id','budget_id','amount_micros','state','actual_micros'],budgets:['budget_id','currency','limit_micros','reserved_micros','settled_micros','blocked'],results:['run_id','payload','created_at']};
const writable={runs:['status','usage','finished_at','dispatch_digest','dispatched_at'],reservations:['state','actual_micros'],budgets:['reserved_micros','settled_micros','blocked']};
const executorIdentitySql="SELECT current_database() AS database_name,current_user AS role_name,inet_server_addr()::text AS address,inet_server_port() AS port,has_schema_privilege(current_user,'ytv_ai_test_v1','USAGE') AS schema_usage,has_schema_privilege(current_user,'ytv_ai_test_v1','CREATE') AS schema_create,"+Object.entries(columns).flatMap(([table,names])=>[
 `has_table_privilege(current_user,'ytv_ai_test_v1.${table}','SELECT') AS ${table}_read`,
 `has_any_column_privilege(current_user,'ytv_ai_test_v1.${table}','INSERT') AS ${table}_insert`,
 `has_table_privilege(current_user,'ytv_ai_test_v1.${table}','DELETE') AS ${table}_delete`,
 ...names.map(name=>`has_column_privilege(current_user,'ytv_ai_test_v1.${table}','${name}','UPDATE') AS ${table}_${name}_update`)
]).join(',');

// One private registry, three original storage capabilities. Adapters already
// own their explicit transports, credentials, models and pricing functions;
// this composition neither reconstructs them from metadata nor invents defaults.
function createSharedRuntimeBootstrap(options={}){
 const keys=['adapters','readerDatabase','activatorDatabase','executorDatabase','storageIdentity','taskCatalog','policies','budgetBindings','authorize','getRuntimes','checkCredential','timeoutMs'];
 if(!record(options)||Object.keys(options).some(k=>!keys.includes(k))||!Array.isArray(options.adapters)||!options.adapters.length
   ||options.executorDatabase?.role!=='executor'||typeof options.executorDatabase.transaction!=='function'||typeof options.authorize!=='function'
   ||typeof options.checkCredential!=='function'||!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>30000)fail('configuration','Explicit shared runtime capabilities required');
 let identity,catalog,policies,bindings;
 try{({identity,catalog,policies,bindings}=structuredClone({identity:options.storageIdentity,catalog:options.taskCatalog,policies:options.policies,bindings:options.budgetBindings}));}catch{fail('configuration','Invalid shared runtime declarations');}
 if(!record(identity)||Object.keys(identity).sort().join(',')!=='activatorRole,databaseName,executorRole,readerRole'||Object.values(identity).some(v=>!text(v))
   ||new Set([identity.readerRole,identity.activatorRole,identity.executorRole]).size!==3||!record(catalog)||!Object.keys(catalog).length||!record(policies)||!record(bindings)
   ||stable(Object.keys(catalog).sort())!==stable(Object.keys(policies).sort())||stable(Object.keys(catalog).sort())!==stable(Object.keys(bindings).sort()))fail('configuration','Complete catalog, distinct roles and explicit budget bindings required');
 for(const [task,item]of Object.entries(catalog)){
  if(item?.executor!=='ai'||!item.runtimeIds?.includes('web')||!Array.isArray(bindings[task])||!bindings[task].length||bindings[task].some(v=>!text(v))||new Set(bindings[task]).size!==bindings[task].length)fail('configuration','Shared web AI tasks require complete budgets and runtimes');
 }
 freeze(identity);freeze(catalog);freeze(policies);freeze(bindings);
 const executor=Object.freeze({role:'executor',transaction:options.executorDatabase.transaction.bind(options.executorDatabase)}),authorize=options.authorize,checkCredential=options.checkCredential,timeoutMs=options.timeoutMs;
 const registry=createRegistry(),credentials=[];
 for(const adapter of options.adapters){
  if(typeof adapter?.execute!=='function')fail('configuration','Original adapter execution capability required');
  registry.register({...adapter,execute:adapter.execute.bind(adapter)});
  credentials.push(Object.freeze({runtimeId:'web',providerId:adapter.providerId,credentialRef:adapter.credentialRef}));
 }
 const {executorRole,...administrativeIdentity}=identity;
 const administrative=createConfigurationRuntimeBootstrap({registry,readerDatabase:options.readerDatabase,activatorDatabase:options.activatorDatabase,storageIdentity:administrativeIdentity,taskCatalog:catalog,getRuntimes:options.getRuntimes,checkCredential,timeoutMs});
 const store=createControlStore(executor,registry),runner=createTaskRunner({store,registry});
 const composed=createTaskFactory({runner,policies,authorize:async context=>{
  const grant=await authorize(context);
  if(!record(grant)||!bindings[context.taskType]?.includes(grant.budgetId)||grant.agentId!==undefined&&!catalog[context.taskType].agentIds?.includes(grant.agentId))fail('permissions','Task grant differs from shared runtime bindings');
  return grant;
 }});
 const factory=identity=>{
  if(!record(identity)||!Object.hasOwn(catalog,identity.taskType))fail('permissions','Task is outside the shared catalog');
  if(identity.requiredCapabilities!==undefined&&(!Array.isArray(identity.requiredCapabilities)||identity.requiredCapabilities.some(c=>!text(c))))fail('capability','Invalid requested capabilities');
  return composed({...identity,requiredCapabilities:[...new Set([...catalog[identity.taskType].capabilities,...identity.requiredCapabilities??[]])]});
 };
 let original,originalSignal;
 return Object.freeze({prepare({signal}={}){
  if(signal!==undefined&&!(signal instanceof AbortSignal))fail('configuration','Invalid shared cancellation');
  if(original){if(signal!==originalSignal)fail('permissions','Shared preparation already has an original waiter');return original;}
  originalSignal=signal;
  original=(async()=>{
   const controller=new AbortController(),deadline=performance.now()+timeoutMs;let timer,rejectWait;
   const retired=new Promise((_,reject)=>{rejectWait=reject;});void retired.catch(()=>{});
   const stop=code=>{controller.abort();rejectWait(new ContractError(code,'Shared runtime readiness was not confirmed'));};
   const abort=()=>stop('cancelled');signal?.addEventListener('abort',abort,{once:true});
   const check=()=>{if(signal?.aborted||controller.signal.aborted)fail('cancelled','Shared runtime readiness was not confirmed');if(performance.now()>=deadline)fail('deadline','Shared runtime readiness was not confirmed');};
   const wait=async fn=>{check();const value=await Promise.race([Promise.resolve().then(()=>{check();return fn();}),retired]);check();return value;};
   try{
    check();timer=setTimeout(()=>stop('deadline'),timeoutMs);
    const rows=await wait(()=>executor.transaction(tx=>tx.query(executorIdentitySql)));
    if(!Array.isArray(rows)||rows.length!==1)fail('permissions','Executor storage identity unavailable');
    const row=rows[0];
    if(row.database_name!==identity.databaseName||row.role_name!==executorRole||row.schema_usage!==true||row.schema_create!==false)fail('permissions','Executor storage identity differs');
    for(const [table,names]of Object.entries(columns)){
     if(row[table+'_read']!==(table!=='switch_events')||row[table+'_insert']!==['runs','reservations','results'].includes(table)||row[table+'_delete']!==false)fail('permissions','Executor table grants differ');
     for(const name of names)if(row[table+'_'+name+'_update']!==(writable[table]??[]).includes(name))fail('permissions','Executor column grants differ');
    }
    const admin=await wait(()=>administrative.prepare({signal:controller.signal}));
    if(stable(admin.readiness.storage)!==stable({database:row.database_name,address:row.address,port:row.port}))fail('configuration','All storage capabilities must share an endpoint');
    const config=structuredClone(await wait(()=>store.active()));
    if(!config||config.revision!==admin.readiness.configRevision||stable(await wait(()=>store.revision(config.revision)))!==stable(config))fail('configuration','Executor must observe the same immutable configuration');
    const budgetIds=[...new Set(Object.values(bindings).flat())],budgets=await wait(()=>executor.transaction(tx=>tx.query('SELECT budget_id,currency,limit_micros,reserved_micros,settled_micros,blocked FROM ytv_ai_test_v1.budgets WHERE budget_id = ANY($1::text[])',[budgetIds])));
    if(!Array.isArray(budgets)||budgets.length!==budgetIds.length||new Set(budgets.map(b=>b?.budget_id)).size!==budgetIds.length)fail('quota','Shared budgets unavailable');
    for(const [task,ids]of Object.entries(bindings))for(const id of ids){
     const b=budgets.find(b=>b.budget_id===id),limit=count(b?.limit_micros),reserved=count(b?.reserved_micros),settled=count(b?.settled_micros);
     if(!b||b.blocked!==false||b.currency!==policies[task].budget.currency||limit===null||reserved===null||settled===null||reserved>limit||settled>limit-reserved||policies[task].budget.maxCostMicros>limit-reserved-settled)fail('quota','Shared budget has no available capacity');
    }
    for(const credential of credentials)if(await wait(()=>checkCredential({...credential,signal:controller.signal}))!==true)fail('credentials','Shared adapter credential unavailable');
    if(stable(await wait(()=>store.active()))!==stable(config)||stable(await wait(()=>admin.dependencies.reader.active()))!==stable(config))fail('configuration','Configuration changed during shared preparation');
    check();return Object.freeze({factory,configurationDependencies:admin.dependencies,readiness:freeze({...admin.readiness,executorRole,budgetIds,providerIds:credentials.map(c=>c.providerId)})});
   }catch(error){fail(error instanceof ContractError?error.code:'configuration','Shared runtime readiness was not confirmed');}
   finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  })();return original;
 }});
}
module.exports={createSharedRuntimeBootstrap};
