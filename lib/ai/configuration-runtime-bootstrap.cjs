'use strict';
const {performance}=require('node:perf_hooks');
const {types}=require('node:util');
const {ContractError}=require('../../contracts/ai/v1/core.cjs');
const {createControlStore,controlSchemaFor,sqlForControlSchema}=require('../../contracts/ai/v1/control-store.cjs');
const {createConfigurationValidator}=require('./configuration-service.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=128;
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const child of Object.values(v))freeze(child);}return v;};
const tables=['revisions','active_revision','switch_events','runs','reservations','budgets'];
const identitySql="SELECT current_database() AS database_name,current_user AS role_name,inet_server_addr()::text AS address,inet_server_port() AS port,has_schema_privilege(current_user,'__ytv_control__','USAGE') AS schema_usage,"+tables.flatMap(table=>[
 `has_table_privilege(current_user,'__ytv_control__.${table}','SELECT') AS ${table}_read`,
 `has_any_column_privilege(current_user,'__ytv_control__.${table}','INSERT') AS ${table}_insert`,
 `has_any_column_privilege(current_user,'__ytv_control__.${table}','UPDATE') AS ${table}_update`,
 `has_table_privilege(current_user,'__ytv_control__.${table}','DELETE') AS ${table}_delete`
]).join(',');

// Opt-in, inert composition. Only bounded reads during preparation. The schema
// is the existing control-store schema; declared identities are not provenance
// or recovery authority and no operational environment is installed here.
function createConfigurationRuntimeBootstrap(options={}){
 const allowed=['registry','readerDatabase','activatorDatabase','storageIdentity','taskCatalog','getRuntimes','checkCredential','checkModelAvailability','isTaskFunded','timeoutMs','observationRuntimeId'];
 if(options.isTaskFunded!==undefined&&typeof options.isTaskFunded!=='function')fail('configuration','Original task funding capability required');
 const isTaskFunded=options.isTaskFunded?.bind(options);
 if(!record(options)||Object.keys(options).some(k=>!allowed.includes(k))||typeof options.registry?.resolve!=='function'
   ||typeof options.getRuntimes!=='function'||typeof options.checkCredential!=='function'||typeof options.checkModelAvailability!=='function'
   ||!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>30000)fail('configuration','Explicit bounded administrative composition required');
 const registry=Object.freeze({resolve:options.registry.resolve.bind(options.registry)}),getRuntimes=options.getRuntimes,checkCredential=options.checkCredential,checkModelAvailability=options.checkModelAvailability,timeoutMs=options.timeoutMs;
 const capture=(value,role)=>{
  if(types.isProxy(value)||value?.role!==role||typeof value.transaction!=='function')fail('configuration','Distinct role-bound storage capabilities required');
  const controlSchema=controlSchemaFor(value),transaction=value.transaction.bind(value),map=work=>tx=>work(Object.freeze({query:(sql,args)=>tx.query(sqlForControlSchema(controlSchema,sql),args)}));
  const captured={role,controlSchema,transaction:work=>transaction(map(work))};
  // Reader-only optional native capability, captured from this original owner.
  // Never probe an activator's property or infer it from a readiness/JSON flag.
  const descriptor=role==='reader'?Object.getOwnPropertyDescriptor(value,'transactionOriginal'):undefined;
  if(descriptor){
   if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function'||types.isProxy(descriptor.value))fail('configuration','Original native reader capability required');
   const original=descriptor.value.bind(value);
   captured.transactionOriginal=(work,invocation)=>{
    const native=original(map(work),invocation);
    if(!native||typeof native!=='object'||types.isProxy(native)||!Object.isFrozen(native))fail('configuration','Original native reader settlement handle required');
    const fields=Object.getOwnPropertyDescriptors(native);
    if(Reflect.ownKeys(fields).length!==2||!['result','settled'].every(k=>Object.hasOwn(fields[k]??{},'value')&&types.isPromise(fields[k].value)&&!Object.hasOwn(fields[k].value,'then')&&!Object.hasOwn(fields[k].value,'constructor')))fail('configuration','Original native reader settlement handle required');
    return native;
   };
  }
  return Object.freeze(captured);
 };
 const readerDatabase=capture(options.readerDatabase,'reader'),activatorDatabase=capture(options.activatorDatabase,'activator');
 let identity,catalog;
 try{identity=structuredClone(options.storageIdentity);catalog=structuredClone(options.taskCatalog);}catch{fail('configuration','Invalid administrative declarations');}
 if(!record(identity)||Object.keys(identity).filter(k=>k!=='controlSchema').sort().join(',')!=='activatorRole,databaseName,readerRole'||Object.values(identity).some(v=>!text(v))||identity.readerRole===identity.activatorRole
   ||!record(catalog)||!Object.keys(catalog).length)fail('configuration','Explicit storage identity and complete catalog required');
 const controlSchema=controlSchemaFor(identity);if(readerDatabase.controlSchema!==controlSchema||activatorDatabase.controlSchema!==controlSchema)fail('permissions','Administrative storage schemas differ');
 for(const [task,item]of Object.entries(catalog)){
  if(!text(task)||!record(item)||Object.keys(item).some(k=>!['executor','capabilities','runtimeIds','agentIds'].includes(k))||!['ai','coding'].includes(item.executor))fail('configuration','Invalid task declaration');
  for(const field of ['capabilities','runtimeIds','agentIds'])if(field!=='agentIds'||item[field]!==undefined){const values=item[field];if(!Array.isArray(values)||!values.length||values.some(v=>!text(v))||new Set(values).size!==values.length)fail('configuration','Explicit unique task capabilities and runtimes required');}
 }
 freeze(identity);freeze(catalog);
 const observationRuntimeId=options.observationRuntimeId;
 const runtimeIds=[...new Set(Object.values(catalog).flatMap(item=>item.runtimeIds))];
 if(observationRuntimeId!==undefined&&(!text(observationRuntimeId)||!runtimeIds.includes(observationRuntimeId)))fail('configuration','Observation runtime is outside the catalog');
 const observationScope=freeze({kind:observationRuntimeId===undefined?'all':'runtime',runtimeId:observationRuntimeId??null,observedRuntimeIds:runtimeIds.filter(id=>observationRuntimeId===undefined||id===observationRuntimeId),unobservedRuntimeIds:runtimeIds.filter(id=>observationRuntimeId!==undefined&&id!==observationRuntimeId)});
 const reader=createControlStore(readerDatabase,registry),activator=createControlStore(activatorDatabase,registry);
 // Methods are original capabilities, captured before any readiness wait.
 const dependencies=Object.freeze({registry,reader:Object.freeze({active:reader.active,revision:reader.revision,...(readerDatabase.transactionOriginal?{bindingOriginal:reader.bindingOriginal}:{})}),activator:Object.freeze({publish:activator.publish,activate:activator.activate}),taskCatalog:catalog,...(isTaskFunded?{isTaskFunded}:{}),
  getRuntimes:async()=>structuredClone(await getRuntimes()),checkCredential,checkModelAvailability});
 let original,originalSignal;
 return Object.freeze({prepare({signal}={}){
  if(signal!==undefined&&!(signal instanceof AbortSignal))fail('configuration','Invalid administrative cancellation');
  if(original){if(signal!==originalSignal)fail('permissions','Administrative preparation already has an original waiter');return original;}
  originalSignal=signal;
  original=(async()=>{
   const controller=new AbortController(),deadline=performance.now()+timeoutMs;let timer,rejectWait;
   const retired=new Promise((_,reject)=>{rejectWait=reject;});void retired.catch(()=>{});
   const stop=code=>{controller.abort();rejectWait(new ContractError(code,'Administrative readiness was not confirmed'));};
   const abort=()=>stop('cancelled');signal?.addEventListener('abort',abort,{once:true});
   const check=()=>{if(signal?.aborted||controller.signal.aborted)fail('cancelled','Administrative readiness was not confirmed');if(performance.now()>=deadline)fail('deadline','Administrative readiness was not confirmed');};
   const wait=async fn=>{check();const result=await Promise.race([Promise.resolve().then(()=>{check();return fn();}),retired]);check();return result;};
   try{
    check();timer=setTimeout(()=>stop('deadline'),timeoutMs);
    const identities=[];
    for(const [database,expectedRole]of [[readerDatabase,identity.readerRole],[activatorDatabase,identity.activatorRole]]){
     const rows=await wait(()=>database.transaction(tx=>tx.query(identitySql)));
     if(!Array.isArray(rows)||rows.length!==1)fail('configuration','Storage identity unavailable');
     const row=rows[0];if(row.database_name!==identity.databaseName||row.role_name!==expectedRole||row.schema_usage!==true||typeof row.address!=='string'||!Number.isInteger(row.port))fail('permissions','Storage identity differs from declaration');
     for(const table of tables){
      if(['revisions','active_revision','switch_events'].includes(table)&&row[table+'_read']!==true)fail('permissions','Control storage reads unavailable');
      const mayInsert=database.role==='activator'&&['revisions','active_revision','switch_events'].includes(table),mayUpdate=database.role==='activator'&&table==='active_revision';
      if(row[table+'_insert']!==mayInsert||row[table+'_update']!==mayUpdate||row[table+'_delete']!==false)fail('permissions','Control storage grants exceed administrative scope');
     }
     identities.push({database:row.database_name,address:row.address,port:row.port});
    }
    if(stable(identities[0])!==stable(identities[1]))fail('configuration','Administrative storage endpoints differ');
    const configuration=structuredClone(await wait(()=>reader.active()));
    if(!configuration||stable(await wait(()=>reader.revision(configuration.revision)))!==stable(configuration)
      ||stable(await wait(()=>activator.active()))!==stable(configuration)||stable(await wait(()=>activator.revision(configuration.revision)))!==stable(configuration))fail('configuration','Shared immutable active configuration required');
    // This private validator cannot publish, activate or issue preview tokens.
    // The installed administrative service still uses global validation and
    // requireAdmin. Startup can observe only its own runtime, without certifying
    // other runtimes or supplying a fabricated operator identity.
    const validate=createConfigurationValidator({...dependencies,getRuntimes:()=>wait(()=>dependencies.getRuntimes()),
     checkCredential:context=>wait(()=>checkCredential({...context,signal:controller.signal})),checkModelAvailability:context=>wait(()=>checkModelAvailability({...context,signal:controller.signal}))},observationRuntimeId===undefined?undefined:{runtimeId:observationRuntimeId});
    const assignments=await wait(()=>validate(configuration));
    if(stable(await wait(()=>reader.active()))!==stable(configuration)||stable(await wait(()=>activator.active()))!==stable(configuration))fail('configuration','Configuration changed during administrative preparation');
    check();return Object.freeze({dependencies,readiness:freeze({configRevision:configuration.revision,activeProfile:configuration.activeProfile,contractVersion:configuration.contractVersion,taskTypes:Object.keys(catalog),storage:identities[0],assignments:structuredClone(assignments),observationScope})});
   }catch(error){fail(error instanceof ContractError?error.code:'configuration','Administrative readiness was not confirmed');}
   finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  })();return original;
 }});
}
module.exports={createConfigurationRuntimeBootstrap};
