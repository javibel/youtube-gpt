'use strict';
const {ContractError}=require('../../contracts/ai/v1/core.cjs');
const {createPostgresControlDatabase}=require('../../contracts/ai/v1/postgres-storage.cjs');
const {createSharedRuntimeBootstrap}=require('./shared-runtime-bootstrap.cjs');
const {captureOperatingBudget}=require('../../contracts/ai/v1/operating-budget.cjs');
const {createIdeogramSharedRuntimeDependencies}=require('./ideogram-shared-runtime.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

// Trusted server code supplies original connection and provider functions.
// This factory does not load an environment, open a socket, grant access or
// install anything. The operational namespace can never alias the fixture.
function createOperationalWebComposition(options={}){
 const allowed=['connections','databaseName','adapters','taskCatalog','policies','budgetBindings','operatingBudget','authorize','getRuntimes','checkCredential','checkModelAvailability','timeoutMs','catalogAdapters','image'];
 if(!options||Object.keys(options).some(k=>!allowed.includes(k))||!options.connections
  ||Object.keys(options.connections).sort().join(',')!=='activator,executor,reader')fail('configuration','Explicit original web capabilities required');
 const connections={reader:options.connections.reader,activator:options.connections.activator,executor:options.connections.executor};
 if(Object.values(connections).some(v=>typeof v!=='function')||new Set(Object.values(connections)).size!==3)fail('configuration','Three distinct native web connection capabilities required');
 if(!Array.isArray(options.adapters)||options.adapters.some(adapter=>typeof adapter?.execute!=='function'))fail('configuration','Original web provider execution capabilities required');
 const databases=Object.fromEntries(Object.entries(connections).map(([role,connect])=>[role,createPostgresControlDatabase({role,connect,controlSchema:'ytv_ai_v1',databaseName:options.databaseName,timeoutMs:options.timeoutMs})]));
 const databaseName=options.databaseName;
 const declarations=freeze(structuredClone({taskCatalog:options.taskCatalog,policies:options.policies,budgetBindings:options.budgetBindings,operatingBudget:options.operatingBudget}));
 captureOperatingBudget(declarations.operatingBudget,declarations.budgetBindings,declarations.policies);
 const adapters=freeze(options.adapters.map(adapter=>Object.freeze({...adapter,models:freeze(structuredClone(adapter.models)),execute:adapter.execute.bind(adapter)})));
 const shared={...declarations,adapters,...(options.catalogAdapters===undefined?{}:{catalogAdapters:freeze(structuredClone(options.catalogAdapters))}),authorize:options.authorize,getRuntimes:options.getRuntimes,checkCredential:options.checkCredential,checkModelAvailability:options.checkModelAvailability,timeoutMs:options.timeoutMs};
 const dependencies=Object.freeze({...shared,readerDatabase:databases.reader,activatorDatabase:databases.activator,executorDatabase:databases.executor,
  storageIdentity:Object.freeze({controlSchema:'ytv_ai_v1',databaseName,readerRole:'ytv_ai_reader',activatorRole:'ytv_ai_activator',executorRole:'ytv_ai_executor'})});
 // Reuse the existing image composition, including its explicit budget and
 // tariff checks. An unfunded image task still fails before any preparation.
 const combined=options.image===undefined?dependencies:createIdeogramSharedRuntimeDependencies({...dependencies,image:options.image});
 const bootstrap=createSharedRuntimeBootstrap(combined);
 return Object.freeze({dependencies:combined,prepare:bootstrap.prepare});
}
module.exports={createOperationalWebComposition};
