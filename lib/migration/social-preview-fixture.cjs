'use strict';
const {randomUUID}=require('node:crypto');
const {createConfigurationService}=require('../ai/configuration-service.cjs');
const socialPreviewFixture=Object.freeze({serviceId:'brand-agent',taskType:'brand.social-post',budgetId:'migration-ui-synthetic-social-preview-budget',model:'synthetic-social-preview-only'});
const baseTasks=['youtube.ab-title-suggestions','youtube.best-time-tip'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function checkConfiguration(config){
 if(!config||config.fallback!=='none'||!Array.isArray(config.exceptions)||config.exceptions.length||!config.profiles||!Object.hasOwn(config.profiles,config.activeProfile))throw Error('ISOLATION_BLOCKED: unreviewed fixture configuration');
 let configured;
 for(const tasks of Object.values(config.profiles)){
  const keys=Object.keys(tasks).sort(),hasPreview=Object.hasOwn(tasks,socialPreviewFixture.taskType),expected=[...baseTasks,...(hasPreview?[socialPreviewFixture.taskType]:[])].sort();
  if(!same(keys,expected)||configured!==undefined&&configured!==hasPreview)throw Error('ISOLATION_BLOCKED: incomplete fixture profiles');configured=hasPreview;
  for(const [task,selection]of Object.entries(tasks))if(!selection||!same(Object.keys(selection).sort(),['model','providerId'])||!['anthropic','openai'].includes(selection.providerId)||selection.model!==(task===socialPreviewFixture.taskType?socialPreviewFixture.model:'synthetic-only'))throw Error('ISOLATION_BLOCKED: unreviewed fixture assignment');
 }
 if(configured===undefined)throw Error('ISOLATION_BLOCKED: empty fixture profiles');return configured;
}
function previewConfiguration(current){
 if(checkConfiguration(current))throw Error('ISOLATION_BLOCKED: preview fixture already configured');
 const candidate=structuredClone(current);candidate.revision=randomUUID();
 for(const tasks of Object.values(candidate.profiles))tasks[socialPreviewFixture.taskType]={providerId:tasks[baseTasks[0]].providerId,model:socialPreviewFixture.model};
 return candidate;
}
// Explicit guarded fixture startup owns this NEW configuration operation.
// The existing revision is an input/veto, never a recovered preview or ACK.
// Only this live preview→activation continuation may write the new revision;
// failures propagate without retry, rollback, stored-preview lookup or reset.
async function prepareSocialPreviewFixture({reader,activator,registry,taskCatalog}){
 const at=Date.now(),started=performance.now(),check=()=>{if(process.env.YTV_MIGRATION_WEB_TEST!=='1'||globalThis.__ytvRuntimeGuard!==true||Date.now()<at||Date.now()>=at+30000||performance.now()<started||performance.now()>=started+30000)throw Error('ISOLATION_BLOCKED: original fixture preparation retired');};
 check();const current=await reader.active();check();
 if(checkConfiguration(current))return Object.freeze({status:'already-configured',revision:current.revision,configurationChanged:false,businessRecovery:false});
 const candidate=previewConfiguration(current),ownedActivator={async publish(...args){check();const result=await activator.publish(...args);check();return result;},async activate(...args){check();const result=await activator.activate(...args);check();return result;}};
 const service=createConfigurationService({registry,reader,activator:ownedActivator,taskCatalog,getActor:async()=>{check();return 'synthetic-fixture-seed';},getRuntimes:async()=>{check();return[{id:'web',contractVersions:['1.0'],adapters:{anthropic:'messages-v1',openai:'responses-v1'}}];},checkCredential:async({credentialRef})=>{check();return credentialRef==='test:local-fixture';},clock:()=>{check();return Date.now();},previewTtlMs:30000});
 const preview=await service.preview(candidate,{reason:'Explicit isolated social preview fixture setup;closed transports only'});check();
 const result=await service.activate(preview.previewId);check();
 if(result.revision!==candidate.revision||result.previousRevision!==current.revision||result.alreadyActive)throw Error('ISOLATION_BLOCKED: fixture preparation ACK unconfirmed');
 return Object.freeze({status:'configured',previousRevision:current.revision,revision:result.revision,configurationChanged:true,businessRecovery:false});
}
module.exports={socialPreviewFixture,previewConfiguration,prepareSocialPreviewFixture,checkConfiguration};
