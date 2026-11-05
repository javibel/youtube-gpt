'use strict';
const {performance}=require('node:perf_hooks');
const {types}=require('node:util');
const {ContractError,createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createControlStore,controlSchemaFor,sqlForControlSchema}=require('../../contracts/ai/v1/control-store.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const {createTaskFactory}=require('./task-factory.cjs');
const {createConfigurationRuntimeBootstrap}=require('./configuration-runtime-bootstrap.cjs');
const {captureOperatingBudget}=require('../../contracts/ai/v1/operating-budget.cjs');
const {checkModelMetadata}=require('./model-metadata-readiness.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=128;
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const child of Object.values(v))freeze(child);}return v;};
const count=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):null;
const columns={revisions:['revision','contract_version','payload','actor','created_at'],active_revision:['singleton','revision'],switch_events:['event_id','previous_revision','revision','actor','reason','created_at'],runs:['run_id','request_id','task_type','request_fingerprint','idempotency_key','revision','snapshot','status','usage','created_at','finished_at','dispatch_digest','dispatched_at','agent_id'],reservations:['run_id','budget_id','amount_micros','state','actual_micros'],budgets:['budget_id','currency','limit_micros','reserved_micros','settled_micros','blocked'],results:['run_id','payload','created_at']};
const writable={runs:['status','usage','finished_at','dispatch_digest','dispatched_at'],reservations:['state','actual_micros'],budgets:['reserved_micros','settled_micros','blocked']};
const executorIdentitySql="SELECT current_database() AS database_name,current_user AS role_name,inet_server_addr()::text AS address,inet_server_port() AS port,has_schema_privilege(current_user,'__ytv_control__','USAGE') AS schema_usage,has_schema_privilege(current_user,'__ytv_control__','CREATE') AS schema_create,"+Object.entries(columns).flatMap(([table,names])=>[
 `has_table_privilege(current_user,'__ytv_control__.${table}','SELECT') AS ${table}_read`,
 `has_any_column_privilege(current_user,'__ytv_control__.${table}','INSERT') AS ${table}_insert`,
 `has_table_privilege(current_user,'__ytv_control__.${table}','DELETE') AS ${table}_delete`,
 ...names.map(name=>`has_column_privilege(current_user,'__ytv_control__.${table}','${name}','UPDATE') AS ${table}_${name}_update`)
]).join(',');

// One private registry, three original storage capabilities. Adapters already
// own their explicit transports, credentials, models and pricing functions;
// this composition neither reconstructs them from metadata nor invents defaults.
function createSharedRuntimeBootstrap(options={}){
 const keys=['adapters','readerDatabase','activatorDatabase','executorDatabase','storageIdentity','taskCatalog','policies','budgetBindings','operatingBudget','authorize','getRuntimes','checkCredential','checkModelAvailability','timeoutMs','catalogAdapters','administrativeAgentReadiness'];
 if(!record(options)||Object.keys(options).some(k=>!keys.includes(k))||!Array.isArray(options.adapters)||!options.adapters.length
   ||options.executorDatabase?.role!=='executor'||typeof options.executorDatabase.transaction!=='function'||typeof options.authorize!=='function'
   ||typeof options.checkCredential!=='function'||typeof options.checkModelAvailability!=='function'||!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>30000)fail('configuration','Explicit shared runtime capabilities and model metadata required');
 let identity,catalog,policies,bindings;
 try{({identity,catalog,policies,bindings}=structuredClone({identity:options.storageIdentity,catalog:options.taskCatalog,policies:options.policies,bindings:options.budgetBindings}));}catch{fail('configuration','Invalid shared runtime declarations');}
 if(!record(identity)||Object.keys(identity).filter(k=>k!=='controlSchema').sort().join(',')!=='activatorRole,databaseName,executorRole,readerRole'||Object.values(identity).some(v=>!text(v))
   ||new Set([identity.readerRole,identity.activatorRole,identity.executorRole]).size!==3||!record(catalog)||!Object.keys(catalog).length||!record(policies)||!record(bindings)
   ||Object.keys(policies).length===0)fail('configuration','Complete catalog, distinct roles and explicit budget bindings required');
 const runtimeCatalog=Object.fromEntries(Object.entries(catalog).filter(([,item])=>item?.executor==='ai'&&item.runtimeIds?.includes('web')));
 if(stable(Object.keys(runtimeCatalog).sort())!==stable(Object.keys(policies).sort())||stable(Object.keys(runtimeCatalog).sort())!==stable(Object.keys(bindings).sort()))fail('configuration','Complete scoped web policies and budget bindings required');
 const unfundedTasks=new Set();
 for(const [task,item]of Object.entries(runtimeCatalog)){
  if(!Array.isArray(bindings[task])||bindings[task].some(v=>!text(v))||new Set(bindings[task]).size!==bindings[task].length)fail('configuration','Shared web AI tasks require complete budgets and runtimes');
  if(bindings[task].length===0){if(policies[task]?.budget?.maxCostMicros!==0)fail('configuration','Only explicitly zero-funded tasks may omit a budget');unfundedTasks.add(task);}
 }
 const isTaskFunded=task=>!unfundedTasks.has(task);
 freeze(identity);freeze(catalog);freeze(policies);freeze(bindings);
 const controlSchema=controlSchemaFor(identity),executorSchema=controlSchemaFor(options.executorDatabase);if(controlSchema!==executorSchema)fail('permissions','Executor storage schema differs');
 const operatingBudget=controlSchema==='ytv_ai_v1'||options.operatingBudget!==undefined?captureOperatingBudget(options.operatingBudget,bindings,policies):null;
 const originalTransaction=options.executorDatabase.transaction.bind(options.executorDatabase);
 const executor=Object.freeze({role:'executor',controlSchema,transaction:work=>originalTransaction(tx=>work(Object.freeze({query:(sql,args)=>tx.query(sqlForControlSchema(controlSchema,sql),args)})))}),authorize=options.authorize,checkCredential=options.checkCredential,timeoutMs=options.timeoutMs;
 const registry=createRegistry(),credentials=[],runtimeProviders=new Set();
 for(const adapter of options.adapters){
  if(typeof adapter?.execute!=='function')fail('configuration','Original adapter execution capability required');
  registry.register({...adapter,execute:adapter.execute.bind(adapter)});
  runtimeProviders.add(adapter.providerId);
  credentials.push(Object.freeze({runtimeId:'web',providerId:adapter.providerId,credentialRef:adapter.credentialRef}));
 }
 if(options.catalogAdapters!==undefined){
  if(!Array.isArray(options.catalogAdapters))fail('configuration','Public catalog adapter declarations required');
  for(const adapter of options.catalogAdapters){
   if(!record(adapter)||Object.keys(adapter).some(k=>!['providerId','adapterVersion','enabled','credentialRef','models'].includes(k))||runtimeProviders.has(adapter.providerId))fail('configuration','Catalog-only adapters cannot supply web execution');
   registry.register({...structuredClone(adapter),execute:async()=>fail('permissions','Catalog-only adapter has no web execution capability')});
  }
 }
 const {executorRole,...administrativeIdentity}=identity;
 // Only the administrative full-catalog validator can use these original agent
 // observers. Web execution/readiness below retains its own native checkers.
 let administrativeCredential=checkCredential,administrativeMetadata=options.checkModelAvailability;
 if(options.administrativeAgentReadiness!==undefined){
  const original=options.administrativeAgentReadiness;
  if(!record(original)||types.isProxy(original))fail('configuration','Original administrative agent observers required');
  const d=Object.getOwnPropertyDescriptors(original),names=['checkCredential','checkModelAvailability'];
  if(Reflect.ownKeys(d).length!==2||names.some(k=>!Object.hasOwn(d,k)||!Object.hasOwn(d[k],'value')||typeof d[k].value!=='function'||types.isProxy(d[k].value)))fail('configuration','Original administrative agent observers required');
  const agent=Object.fromEntries(names.map(k=>[k,d[k].value.bind(original)]));
  const route=(input,metadata)=>{
   if(!record(input)||types.isProxy(input))fail('permissions','Exact administrative runtime observation required');
   const d=Object.getOwnPropertyDescriptors(input),required=['runtimeId','providerId','credentialRef',...(metadata?['model']:[])],allowed=[...required,'signal'];
   if(Reflect.ownKeys(d).some(k=>!allowed.includes(k)||!Object.hasOwn(d[k],'value'))||required.some(k=>!d[k]||!text(d[k].value))||!['agent','web'].includes(d.runtimeId.value)||d.signal&&d.signal.value!==undefined&&(!(d.signal.value instanceof AbortSignal)||d.signal.value.aborted))fail('permissions','Exact administrative runtime observation required');
   return Object.freeze(Object.fromEntries(Reflect.ownKeys(d).map(k=>[k,d[k].value])));
  };
  const webMetadata=options.checkModelAvailability;
  administrativeCredential=input=>{const context=route(input,false);return context.runtimeId==='agent'?agent.checkCredential(context):checkCredential(context);};
  administrativeMetadata=input=>{const context=route(input,true);return context.runtimeId==='agent'?agent.checkModelAvailability(context):webMetadata(context);};
 }
 const administrative=createConfigurationRuntimeBootstrap({registry,readerDatabase:options.readerDatabase,activatorDatabase:options.activatorDatabase,storageIdentity:administrativeIdentity,taskCatalog:catalog,getRuntimes:options.getRuntimes,checkCredential:administrativeCredential,checkModelAvailability:administrativeMetadata,isTaskFunded,timeoutMs,observationRuntimeId:'web'});
 const store=createControlStore(executor,registry,operatingBudget?{validateAdmission:operatingBudget.validateAdmission}:{}),runner=createTaskRunner({store,registry});
 const readBudgetOriginal=options.readerDatabase.transactionOriginal?.bind(options.readerDatabase);
 const composed=createTaskFactory({runner,policies,...(operatingBudget&&readBudgetOriginal?{narrowBudget:async context=>{const native=readBudgetOriginal(tx=>operatingBudget.requestMaximum(tx,context),{signal:originalSignal});try{return await native.result;}finally{await native.settled;}}}:{}),authorize:async context=>{
  const grant=await authorize(context);
  if(!record(grant)||!bindings[context.taskType]?.includes(grant.budgetId)||grant.agentId!==undefined&&!catalog[context.taskType].agentIds?.includes(grant.agentId))fail('permissions','Task grant differs from shared runtime bindings');
  return grant;
 }});
 const factory=identity=>{
  if(!record(identity)||!Object.hasOwn(runtimeCatalog,identity.taskType))fail('permissions','Task is outside the shared catalog');
  if(!isTaskFunded(identity.taskType))fail('quota','Task is explicitly unfunded');
  if(identity.requiredCapabilities!==undefined&&(!Array.isArray(identity.requiredCapabilities)||identity.requiredCapabilities.some(c=>!text(c))))fail('capability','Invalid requested capabilities');
  return composed({...identity,requiredCapabilities:[...new Set([...runtimeCatalog[identity.taskType].capabilities,...identity.requiredCapabilities??[]])]});
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
    const operatingAssignments=[],modelMetadata=[],checkedModels=new Set();
    for(const [task,item]of Object.entries(runtimeCatalog))if(isTaskFunded(task))for(const profile of Object.keys(config.profiles))for(const agentId of [undefined,...item.agentIds??[]]){
     const selected=registry.resolve({...config,activeProfile:profile},{taskType:task,requiredCapabilities:item.capabilities},{agentId});
     if(!runtimeProviders.has(selected.providerId))fail('permissions','A web task cannot select a catalog-only provider');
     operatingAssignments.push({taskType:task,providerId:selected.providerId});
     const binding={runtimeId:'web',providerId:selected.providerId,credentialRef:selected.credentialRef,model:selected.model},key=stable(binding);
     if(!checkedModels.has(key)){checkedModels.add(key);const validated=admin.readiness.assignments.find(a=>a.profile===profile&&a.taskType===task&&a.agentId===(agentId??null))?.modelMetadata?.find(m=>m.runtimeId==='web'&&m.providerId===selected.providerId&&m.credentialRef===selected.credentialRef&&m.requestedModel===selected.model);modelMetadata.push(await wait(()=>checkModelMetadata(async()=>validated,binding)));}
    }
    operatingBudget?.verifyAssignments(operatingAssignments);
    const operatingBudgetReadiness=operatingBudget?await wait(()=>executor.transaction(tx=>operatingBudget.verifyStorage(tx))):null;
    const budgetIds=[...new Set(Object.values(bindings).flat())],budgets=await wait(()=>executor.transaction(tx=>tx.query('SELECT budget_id,currency,limit_micros,reserved_micros,settled_micros,blocked FROM __ytv_control__.budgets WHERE budget_id = ANY($1::text[])',[budgetIds])));
    if(!Array.isArray(budgets)||budgets.length!==budgetIds.length||new Set(budgets.map(b=>b?.budget_id)).size!==budgetIds.length)fail('quota','Shared budgets unavailable');
    for(const [task,ids]of Object.entries(bindings))for(const id of ids){
     const b=budgets.find(b=>b.budget_id===id),limit=count(b?.limit_micros),reserved=count(b?.reserved_micros),settled=count(b?.settled_micros);
     if(!b||b.blocked!==false||b.currency!==policies[task].budget.currency||limit===null||reserved===null||settled===null||reserved>limit||settled>limit-reserved||policies[task].budget.maxCostMicros>limit-reserved-settled)fail('quota','Shared budget has no available capacity');
    }
    for(const credential of credentials)if(await wait(()=>checkCredential({...credential,signal:controller.signal}))!==true)fail('credentials','Shared adapter credential unavailable');
    if(stable(await wait(()=>store.active()))!==stable(config)||stable(await wait(()=>admin.dependencies.reader.active()))!==stable(config))fail('configuration','Configuration changed during shared preparation');
    check();return Object.freeze({factory,configurationDependencies:admin.dependencies,readiness:freeze({...admin.readiness,executorRole,budgetIds,modelMetadata,unfundedTaskTypes:[...unfundedTasks],...(operatingBudgetReadiness?{operatingBudget:operatingBudgetReadiness}:{}),providerIds:credentials.map(c=>c.providerId)})});
   }catch(error){fail(error instanceof ContractError?error.code:'configuration','Shared runtime readiness was not confirmed');}
   finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  })();return original;
 }});
}
module.exports={createSharedRuntimeBootstrap};
