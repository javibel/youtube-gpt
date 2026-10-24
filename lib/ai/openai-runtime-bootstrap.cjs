'use strict';
const {performance}=require('node:perf_hooks');
const {ContractError,createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createControlStore,controlSchemaFor,sqlForControlSchema}=require('../../contracts/ai/v1/control-store.cjs');
const {createOpenAIAdapter}=require('./adapters/openai.cjs');
const {createOpenAIHttpsTaskFactory}=require('./openai-task-factory.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=128;
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const count=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):null;

// Explicit trusted server composition. Construction is inert; preparation
// performs bounded reads only in the role-bound migration control schema.
// Nothing imports this into startup, publishes configuration, releases a claim
// or treats declared catalogs/tariffs as operational provenance.
function createOpenAIRuntimeBootstrap(options={}){
 const keys=['database','resolveAddress','readCredential','credentialRef','models','preflight','priceUsage','maxRequestBytes','maxResponseBytes','policies','authorize','taskCatalog','pricing','budgetBindings','checkCredential','timeoutMs'];
 if(!record(options)||Object.keys(options).some(k=>!keys.includes(k)))fail('configuration','Explicit bootstrap capabilities required');
 const {resolveAddress,readCredential,credentialRef,preflight,priceUsage,authorize,checkCredential,maxRequestBytes,maxResponseBytes,timeoutMs}=options;
 if(options.database?.role!=='executor'||typeof options.database.transaction!=='function'||typeof checkCredential!=='function'
   ||typeof authorize!=='function'||typeof preflight!=='function'||typeof priceUsage!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)fail('configuration','Bounded executor bootstrap required');
 const controlSchema=controlSchemaFor(options.database),originalTransaction=options.database.transaction.bind(options.database);
 const database=Object.freeze({role:'executor',controlSchema,transaction:work=>originalTransaction(tx=>work(Object.freeze({query:(sql,args)=>tx.query(sqlForControlSchema(controlSchema,sql),args)})))});
 let taskCatalog,pricing,budgetBindings,models,policies;
 try{({taskCatalog,pricing,budgetBindings,models,policies}=structuredClone({taskCatalog:options.taskCatalog,pricing:options.pricing,budgetBindings:options.budgetBindings,models:options.models,policies:options.policies}));}catch{fail('configuration','Bootstrap declarations are invalid');}
 if(!record(pricing)||Object.keys(pricing).sort().join(',')!=='currency,version'||!text(pricing.version)||!/^[A-Z]{3}$/.test(pricing.currency)
   ||!record(taskCatalog)||!Object.keys(taskCatalog).length||!record(policies)||!record(budgetBindings)
   ||stable(Object.keys(taskCatalog).sort())!==stable(Object.keys(policies).sort())||stable(Object.keys(taskCatalog).sort())!==stable(Object.keys(budgetBindings).sort()))fail('configuration','Complete task policies, budget bindings and tariff required');
 for(const [task,item]of Object.entries(taskCatalog)){
  if(!text(task)||!record(item)||Object.keys(item).some(k=>!['capabilities','agentIds'].includes(k))||!Array.isArray(item.capabilities)||!item.capabilities.length||item.capabilities.some(c=>!text(c))
   ||item.agentIds!==undefined&&(!Array.isArray(item.agentIds)||item.agentIds.some(id=>!text(id)))||policies[task]?.budget?.currency!==pricing.currency
   ||!Array.isArray(budgetBindings[task])||!budgetBindings[task].length||budgetBindings[task].some(id=>!text(id))||new Set(budgetBindings[task]).size!==budgetBindings[task].length)fail('configuration','Invalid task catalog or budget binding');
 }
 const quote=async context=>{const value=await preflight(context);if(value?.priceVersion!==pricing.version||value?.currency!==pricing.currency)fail('configuration','Preflight tariff differs from bootstrap');return value;};
 const price=async context=>{const value=await priceUsage(context);if(value!==null&&(value?.priceVersion!==pricing.version||value?.currency!==pricing.currency))fail('configuration','Usage tariff differs from bootstrap');return value;};
 const grant=async context=>{
  const value=await authorize(context);
  if(!record(value)||!budgetBindings[context.taskType]?.includes(value.budgetId)||value.agentId!==undefined&&!taskCatalog[context.taskType].agentIds?.includes(value.agentId))fail('permissions','Task grant differs from bootstrap bindings');
  return value;
 };
 const composed=createOpenAIHttpsTaskFactory({database,resolveAddress,readCredential,credentialRef,models,preflight:quote,priceUsage:price,maxRequestBytes,maxResponseBytes,policies,authorize:grant});
 const factory=async identity=>{
  if(!record(identity)||!Object.hasOwn(taskCatalog,identity.taskType))fail('permissions','Task is not in the bootstrap catalog');
  const item=taskCatalog[identity.taskType];
  if(identity.requiredCapabilities!==undefined&&(!Array.isArray(identity.requiredCapabilities)||identity.requiredCapabilities.some(c=>!text(c))))fail('capability','Invalid requested capabilities');
  return composed({...identity,requiredCapabilities:[...new Set([...item.capabilities,...identity.requiredCapabilities??[]])]});
 };
 const adapter=createOpenAIAdapter({models,credentialRef,preflight:quote,priceUsage:price,transport:{create:async()=>fail('permissions','Bootstrap cannot dispatch')}});
 const registry=createRegistry();registry.register(adapter);
 const store=createControlStore(database,registry),budgetIds=[...new Set(Object.values(budgetBindings).flat())];
 let original,originalSignal;
 return Object.freeze({prepare({signal}={}){
  if(signal!==undefined&&!(signal instanceof AbortSignal))fail('configuration','Invalid bootstrap cancellation');
  if(original){if(signal!==originalSignal)fail('permissions','Bootstrap already has an original waiter');return original;}
  originalSignal=signal;
  original=(async()=>{
   const controller=new AbortController(),deadline=performance.now()+timeoutMs;let rejectWait,timer;
   const retired=new Promise((_,reject)=>{rejectWait=reject;});void retired.catch(()=>{});
   const stop=code=>{controller.abort();rejectWait(new ContractError(code,'Bootstrap readiness was not confirmed'));};
   const abort=()=>stop('cancelled');signal?.addEventListener('abort',abort,{once:true});
   const check=()=>{if(signal?.aborted||controller.signal.aborted)fail('cancelled','Bootstrap readiness was not confirmed');if(performance.now()>=deadline)fail('deadline','Bootstrap readiness was not confirmed');};
   const wait=async fn=>{check();const value=await Promise.race([Promise.resolve().then(()=>{check();return fn();}),retired]);check();return value;};
   try{
    check();timer=setTimeout(()=>stop('deadline'),timeoutMs);
    const config=structuredClone(await wait(()=>store.active()));
    if(!config)fail('configuration','Active control configuration required');
    if(stable(await wait(()=>store.revision(config.revision)))!==stable(config))fail('configuration','Immutable active revision unavailable');
    const assignments=[];
    for(const ex of config.exceptions??[])if(!ex||ex.scope==='task'&&!Object.hasOwn(taskCatalog,ex.id)||ex.scope==='agent'&&!Object.values(taskCatalog).some(t=>t.agentIds?.includes(ex.id)))fail('configuration','Unknown bootstrap exception');
    for(const [profile,tasks]of Object.entries(config.profiles??{})){
     if(stable(Object.keys(tasks).sort())!==stable(Object.keys(taskCatalog).sort()))fail('configuration','Profile does not cover bootstrap catalog');
     for(const [taskType,item]of Object.entries(taskCatalog)){
      const selection={...config,activeProfile:profile};registry.resolve({...selection,exceptions:[]},{taskType,requiredCapabilities:item.capabilities});
      for(const agentId of [undefined,...item.agentIds??[]]){const snapshot=registry.resolve(selection,{taskType,requiredCapabilities:item.capabilities},{agentId});assignments.push({profile,taskType,agentId:agentId??null,model:snapshot.model});}
     }
    }
    // Validate the active profile even when malformed configuration has no profiles.
    const taskType=Object.keys(taskCatalog)[0];registry.resolve(config,{taskType,requiredCapabilities:taskCatalog[taskType].capabilities});
    const rows=await wait(()=>database.transaction(tx=>tx.query('SELECT budget_id,currency,limit_micros,reserved_micros,settled_micros,blocked FROM __ytv_control__.budgets WHERE budget_id = ANY($1::text[])',[budgetIds])));
    if(!Array.isArray(rows)||rows.length!==budgetIds.length||new Set(rows.map(r=>r?.budget_id)).size!==rows.length)fail('quota','Bootstrap budgets unavailable');
    for(const id of budgetIds){const row=rows.find(r=>r.budget_id===id),limit=count(row?.limit_micros),reserved=count(row?.reserved_micros),settled=count(row?.settled_micros);
     if(!row||row.blocked!==false||row.currency!==pricing.currency||limit===null||reserved===null||settled===null||reserved>limit||settled>limit-reserved)fail('quota','Bootstrap budget unavailable');
     for(const [task,ids]of Object.entries(budgetBindings))if(ids.includes(id)&&policies[task].budget.maxCostMicros>limit-reserved-settled)fail('quota','Bootstrap budget has insufficient available capacity');
    }
    if(await wait(()=>checkCredential({runtimeId:'web',providerId:adapter.providerId,credentialRef,signal:controller.signal}))!==true)fail('credentials','Bootstrap credential unavailable');
    if(stable(await wait(()=>store.active()))!==stable(config))fail('configuration','Active configuration changed during bootstrap');
    check();const readiness=Object.freeze({runtimeId:'web',providerId:adapter.providerId,adapterVersion:adapter.adapterVersion,configRevision:config.revision,activeProfile:config.activeProfile,priceVersion:pricing.version,currency:pricing.currency,taskTypes:Object.freeze(Object.keys(taskCatalog)),assignments:Object.freeze(assignments.map(a=>Object.freeze(a)))});
    return Object.freeze({factory,readiness});
   }catch(error){const code=error instanceof ContractError?error.code:'configuration';fail(code,'Bootstrap readiness was not confirmed');}
   finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  })();return original;
 }});
}
module.exports={createOpenAIRuntimeBootstrap};
