'use strict';
const {ContractError,createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createControlStore}=require('../../contracts/ai/v1/control-store.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const {createTaskFactory}=require('./task-factory.cjs');
const {createOpenAIAdapter}=require('./adapters/openai.cjs');
const {createOpenAIHttpTransport}=require('./adapters/openai-http.cjs');

// Explicit server composition for the migration control store. Importing this
// module neither installs a runtime nor reads a credential or opens a socket.
// Bootstrap owns the database/network/auth capabilities; a JSON configuration
// or an authenticated caller cannot supply those capabilities through this API.
function createOpenAITaskFactory(options={}){
 const keys=['database','fetch','readCredential','credentialRef','models','preflight','priceUsage','maxRequestBytes','maxResponseBytes','policies','authorize'];
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!keys.includes(key)))throw new ContractError('configuration','Explicit server capabilities required');
 const {database,fetch,readCredential,credentialRef,models,preflight,priceUsage,maxRequestBytes,maxResponseBytes,policies,authorize}=options;
 if(database?.role!=='executor'||typeof database.transaction!=='function'||typeof priceUsage!=='function')throw new ContractError('configuration','Executor database and explicit pricing required');
 const transport=createOpenAIHttpTransport({fetch,readCredential,credentialRef,maxRequestBytes,maxResponseBytes});
 const registry=createRegistry();
 registry.register(createOpenAIAdapter({models,credentialRef,transport,preflight,priceUsage}));
 const store=createControlStore(database,registry);
 const runner=createTaskRunner({store,registry});
 // Only the authenticated, policy-bounded facade escapes. Neither configuration
 // activation nor direct provider dispatch is exposed to business callers.
 return createTaskFactory({runner,policies,authorize});
}
module.exports={createOpenAITaskFactory};
