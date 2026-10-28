'use strict';
const {createConfigurationService}=require('../ai/configuration-service.cjs');
const {messagesFixture,messagesConfiguration,checkConfiguration}=require('../ai/adapters/local-fixture-configuration.cjs');
// Explicit guarded fixture startup owns this NEW configuration operation.
// The existing revision is an input/veto, never a recovered preview or ACK.
// Only this live preview→activation continuation may write the new revision;
// failures propagate without retry, rollback, stored-preview lookup or reset.
async function prepareMessagesFixture({reader,activator,registry,taskCatalog}){
 const at=Date.now(),started=performance.now(),check=()=>{if(process.env.YTV_MIGRATION_WEB_TEST!=='1'||globalThis.__ytvRuntimeGuard!==true||Date.now()<at||Date.now()>=at+30000||performance.now()<started||performance.now()>=started+30000)throw Error('ISOLATION_BLOCKED: original fixture preparation retired');};
 check();const current=await reader.active();check();
 checkConfiguration(current);if(Object.values(current.profiles).every(tasks=>Object.keys(messagesFixture.tasks).every(k=>Object.hasOwn(tasks,k))))return Object.freeze({status:'already-configured',revision:current.revision,configurationChanged:false,businessRecovery:false});
 const candidate=messagesConfiguration(current),ownedActivator={async publish(...args){check();const result=await activator.publish(...args);check();return result;},async activate(...args){check();const result=await activator.activate(...args);check();return result;}};
 const service=createConfigurationService({registry,reader,activator:ownedActivator,taskCatalog,getActor:async()=>{check();return 'synthetic-fixture-seed';},getRuntimes:async()=>{check();return[{id:'web',contractVersions:['1.0'],adapters:{anthropic:'messages-v1',openai:'responses-v1'}}];},checkModelAvailability:async context=>({runtimeId:context.runtimeId,providerId:context.providerId,credentialRef:context.credentialRef,requestedModel:context.model,resolvedModel:context.model,exactModelMatch:true,metadataAccessible:true,selectionUnchanged:true,generationVerified:false,budgetVerified:false}),checkCredential:async({credentialRef})=>{check();return credentialRef==='test:local-fixture';},clock:()=>{check();return Date.now();},previewTtlMs:30000});
 const preview=await service.preview(candidate,{reason:'Explicit isolated private message fixture setup;closed transports only'});check();
 const result=await service.activate(preview.previewId);check();
 if(result.revision!==candidate.revision||result.previousRevision!==current.revision||result.alreadyActive)throw Error('ISOLATION_BLOCKED: fixture preparation ACK unconfirmed');
 return Object.freeze({status:'configured',previousRevision:current.revision,revision:result.revision,configurationChanged:true,businessRecovery:false});
}
module.exports={messagesFixture,messagesConfiguration,prepareMessagesFixture,checkConfiguration};
