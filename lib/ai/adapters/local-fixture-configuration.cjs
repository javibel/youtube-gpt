'use strict';
const {randomUUID}=require('node:crypto');
const socialPreviewFixture=Object.freeze({serviceId:'brand-agent',taskType:'brand.social-post',budgetId:'migration-ui-synthetic-social-preview-budget',model:'synthetic-social-preview-only'});
const messagesFixture=Object.freeze({serviceId:'brand-agent',model:'synthetic-messages-draft-only',tasks:Object.freeze({'brand.gmail-reply':Object.freeze({budgetId:'migration-ui-synthetic-gmail-draft-budget',maxOutputTokens:400}),'brand.youtube-reply':Object.freeze({budgetId:'migration-ui-synthetic-youtube-draft-budget',maxOutputTokens:150})})});
const baseTasks=['youtube.ab-title-suggestions','youtube.best-time-tip'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Provider/model assignments are trusted closed adapter configuration, never
// business fallback selection. Existing revision payloads remain unchanged.
function checkConfiguration(config){
 if(!config||config.fallback!=='none'||!Array.isArray(config.exceptions)||config.exceptions.length||!config.profiles||!Object.hasOwn(config.profiles,config.activeProfile))throw Error('ISOLATION_BLOCKED: unreviewed fixture configuration');
 let configured,messageConfigured;
 for(const tasks of Object.values(config.profiles)){
  const keys=Object.keys(tasks).sort(),hasPreview=Object.hasOwn(tasks,socialPreviewFixture.taskType),messageCount=Object.keys(messagesFixture.tasks).filter(k=>Object.hasOwn(tasks,k)).length,hasMessages=messageCount===2,expected=[...baseTasks,...(hasPreview?[socialPreviewFixture.taskType]:[]),...(hasMessages?Object.keys(messagesFixture.tasks):[])].sort();if(messageCount!==0&&messageCount!==2||messageConfigured!==undefined&&messageConfigured!==hasMessages)throw Error('ISOLATION_BLOCKED: incomplete message fixture profiles');messageConfigured=hasMessages;
  if(!same(keys,expected)||configured!==undefined&&configured!==hasPreview)throw Error('ISOLATION_BLOCKED: incomplete fixture profiles');configured=hasPreview;
  for(const [task,selection]of Object.entries(tasks))if(!selection||!same(Object.keys(selection).sort(),['model','providerId'])||!['anthropic','openai'].includes(selection.providerId)||selection.model!==(task===socialPreviewFixture.taskType?socialPreviewFixture.model:Object.hasOwn(messagesFixture.tasks,task)?messagesFixture.model:'synthetic-only'))throw Error('ISOLATION_BLOCKED: unreviewed fixture assignment');
 }
 if(configured===undefined)throw Error('ISOLATION_BLOCKED: empty fixture profiles');return configured;
}
function previewConfiguration(current){
 if(checkConfiguration(current))throw Error('ISOLATION_BLOCKED: preview fixture already configured');
 const candidate=structuredClone(current);candidate.revision=randomUUID();
 for(const tasks of Object.values(candidate.profiles))tasks[socialPreviewFixture.taskType]={providerId:tasks[baseTasks[0]].providerId,model:socialPreviewFixture.model};
 return candidate;
}
function messagesConfiguration(current){checkConfiguration(current);if(Object.values(current.profiles).every(t=>Object.keys(messagesFixture.tasks).every(k=>Object.hasOwn(t,k))))throw Error('ISOLATION_BLOCKED: messages already configured');const candidate=structuredClone(current);candidate.revision=randomUUID();for(const tasks of Object.values(candidate.profiles))for(const task of Object.keys(messagesFixture.tasks))tasks[task]={providerId:tasks[baseTasks[0]].providerId,model:messagesFixture.model};return candidate;}
module.exports={socialPreviewFixture,messagesFixture,messagesConfiguration,previewConfiguration,checkConfiguration};
