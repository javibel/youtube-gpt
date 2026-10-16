'use strict';
const {randomUUID}=require('node:crypto');
const socialPreviewFixture=Object.freeze({serviceId:'brand-agent',taskType:'brand.social-post',budgetId:'migration-ui-synthetic-social-preview-budget',model:'synthetic-social-preview-only'});
const baseTasks=['youtube.ab-title-suggestions','youtube.best-time-tip'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Provider/model assignments are trusted closed adapter configuration, never
// business fallback selection. Existing revision payloads remain unchanged.
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
module.exports={socialPreviewFixture,previewConfiguration,checkConfiguration};
