'use strict';
const {randomUUID}=require('node:crypto');const {ContractError}=require('../../contracts/ai/v1/core.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
function createConfigurationService({registry,reader,activator,taskCatalog,getActor,getRuntimes,checkCredential,clock=Date.now,previewTtlMs=300000}={}){
 if(typeof registry?.resolve!=='function'||typeof reader?.active!=='function'||typeof reader?.revision!=='function'||typeof activator?.publish!=='function'||typeof activator?.activate!=='function'||typeof getActor!=='function'||typeof getRuntimes!=='function'||typeof checkCredential!=='function'||typeof clock!=='function'||!taskCatalog||typeof taskCatalog!=='object'||!Number.isSafeInteger(previewTtlMs)||previewTtlMs<1||previewTtlMs>300000)fail('configuration','Trusted operator control dependencies required');
 const catalog=structuredClone(taskCatalog),previews=new Map();
 for(const item of Object.values(catalog))if(!item||!['ai','coding'].includes(item.executor)||!Array.isArray(item.capabilities)||item.capabilities.some(v=>typeof v!=='string'||!v)||!Array.isArray(item.runtimeIds)||!item.runtimeIds.length||item.runtimeIds.some(v=>typeof v!=='string'||!v)||item.agentIds!==undefined&&(!Array.isArray(item.agentIds)||item.agentIds.some(v=>typeof v!=='string'||!v)))fail('configuration','Explicit task capabilities and runtimes required');
 if(!Object.keys(catalog).length)fail('configuration','Task catalog cannot be empty');
 async function actor(action){const id=await getActor(action);if(typeof id!=='string'||!id.trim())fail('permissions','Operator permission required');return id;}
 async function validate(config){
  const runtimes=await getRuntimes();if(!Array.isArray(runtimes)||runtimes.some(r=>!r||typeof r.id!=='string'||!Array.isArray(r.contractVersions)||!r.adapters||typeof r.adapters!=='object'||Array.isArray(r.adapters))||new Set(runtimes.map(r=>r.id)).size!==runtimes.length)fail('configuration','Runtime declarations unavailable or ambiguous');
  if(!config?.profiles||typeof config.profiles!=='object'||!Array.isArray(config.exceptions))fail('configuration','Explicit profiles and exceptions required');
  for(const ex of config.exceptions){if(!ex||!['task','agent'].includes(ex.scope))fail('configuration','Invalid exception');if(ex.scope==='task'&&!Object.hasOwn(catalog,ex.id)||ex.scope==='agent'&&!Object.values(catalog).some(t=>t.agentIds?.includes(ex.id)))fail('configuration','Exception references an unknown task or agent');}
  const resolved=[];
  for(const [profile,tasks] of Object.entries(config.profiles)){
   if(!tasks||stable(Object.keys(tasks).sort())!==stable(Object.keys(catalog).sort()))fail('configuration','Every profile must cover the complete task catalog');
   for(const [taskType,definition] of Object.entries(catalog)){
    const base={...config,activeProfile:profile};
    // Validate the base assignment even when an exception masks it.
    registry.resolve({...base,exceptions:[]},{taskType,requiredCapabilities:definition.capabilities},{executor:definition.executor});
    for(const agentId of [undefined,...definition.agentIds??[]]){
     const snapshot=registry.resolve(base,{taskType,requiredCapabilities:definition.capabilities},{agentId,executor:definition.executor});
     for(const id of definition.runtimeIds){const runtime=runtimes.find(r=>r.id===id);if(!runtime?.contractVersions?.includes(config.contractVersion)||runtime.adapters?.[snapshot.providerId]!==snapshot.adapterVersion)fail('capability','Runtime does not support the selected configuration');if(await checkCredential({runtimeId:id,credentialRef:snapshot.credentialRef,providerId:snapshot.providerId})!==true)fail('credentials','Required runtime credential is unavailable');}
     resolved.push({profile,taskType,agentId:agentId??null,providerId:snapshot.providerId,model:snapshot.model,adapterVersion:snapshot.adapterVersion,exception:snapshot.exception});
    }
   }
  }
  // This also validates activeProfile and the full structural contract.
  const taskType=Object.keys(catalog)[0];registry.resolve(config,{taskType,requiredCapabilities:catalog[taskType].capabilities},{executor:catalog[taskType].executor});
  return resolved;
 }
 async function prepare(config,{reason,existing=false}={}){
  const actorId=await actor('preview');if(typeof reason!=='string'||!reason.trim())fail('invalid_format','A change reason is required');
  const candidate=structuredClone(config);if(!existing&&Array.isArray(candidate?.exceptions))candidate.exceptions=candidate.exceptions.map(ex=>({...ex,authorizedBy:actorId}));
  const assignments=await validate(candidate),previous=await reader.active();
  const stored=await reader.revision(candidate.revision);if(stored&&stable(stored)!==stable(candidate))fail('configuration','Revision identity already contains different configuration');if(existing&&!stored)fail('configuration','Rollback revision is unavailable');
  for(const [id,preview]of previews)if(preview.expiresAt<=clock())previews.delete(id);
  const previewId=randomUUID(),expiresAt=clock()+previewTtlMs;
  previews.set(previewId,{actorId,candidate,expectedRevision:previous?.revision??null,reason,expiresAt});
  return {previewId,expiresAt,previousRevision:previous?.revision??null,revision:candidate.revision,activeProfile:candidate.activeProfile,assignments,exceptions:structuredClone(candidate.exceptions)};
 }
 return Object.freeze({
  async current(){await actor('read');return structuredClone(await reader.active());},
  async validate(config){await actor('validate');return {valid:true,assignments:await validate(structuredClone(config))};},
  preview:prepare,
  async previewRollback(revision,{reason}={}){await actor('preview');const config=await reader.revision(revision);if(!config)fail('configuration','Rollback revision is unavailable');return prepare(config,{reason,existing:true});},
  async activate(previewId){
   const actorId=await actor('activate'),preview=previews.get(previewId);if(!preview||preview.actorId!==actorId||preview.expiresAt<=clock())fail('permissions','Fresh preview for this operator required');
   await validate(preview.candidate);if(preview.expiresAt<=clock())fail('permissions','Preview expired during validation');const current=await reader.active();
   if(current?.revision===preview.candidate.revision){previews.delete(previewId);return {revision:current.revision,alreadyActive:true};}
   if((current?.revision??null)!==preview.expectedRevision)fail('configuration','Active configuration changed; preview again');
   const stored=await reader.revision(preview.candidate.revision);if(stored&&stable(stored)!==stable(preview.candidate))fail('configuration','Candidate revision changed');
   if(!stored)await activator.publish(preview.candidate,{actor:actorId});
   const result=await activator.activate(preview.candidate.revision,{expectedRevision:preview.expectedRevision,actor:actorId,reason:preview.reason});previews.delete(previewId);return result;
  },
 });
}
module.exports={createConfigurationService};
