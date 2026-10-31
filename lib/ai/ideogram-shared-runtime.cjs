'use strict';
const {ContractError}=require('../../contracts/ai/v1/core.cjs');
const {createIdeogramAdapter}=require('./adapters/ideogram.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const child of Object.values(v))freeze(child);}return v;};
// Inert server composition for the existing atomic shared installer. No model,
// credential, transport, budget, tariff or active revision is inferred here.
function createIdeogramSharedRuntimeDependencies(options={}){
 const keys=['adapters','readerDatabase','activatorDatabase','executorDatabase','storageIdentity','taskCatalog','policies','budgetBindings','operatingBudget','authorize','getRuntimes','checkCredential','checkModelAvailability','timeoutMs','image','catalogAdapters'];
 if(!record(options)||Object.keys(options).some(k=>!keys.includes(k))||!Array.isArray(options.adapters)||typeof options.authorize!=='function')fail('configuration','Explicit shared image composition required');
 const image=options.image;
 if(!record(image)||Object.keys(image).sort().join(',')!=='credentialRef,models,preflight,priceUsage,pricing,transport'
   ||typeof image.transport?.create!=='function'||typeof image.preflight!=='function'||typeof image.priceUsage!=='function'
   ||typeof image.credentialRef!=='string'||!image.credentialRef.trim())fail('configuration','Original image adapter capabilities required');
 let declarations;
 try{declarations=structuredClone({models:image.models,pricing:image.pricing,catalog:options.taskCatalog,policies:options.policies,bindings:options.budgetBindings});}
 catch{fail('configuration','Image declarations cannot be captured');}
 const {models,pricing,catalog,policies,bindings}=declarations,task='brand.image-generation',model=models?.['ideogram-v3'],policy=policies?.[task],item=catalog?.[task];
 if(!record(models)||Object.keys(models).join(',')!=='ideogram-v3'||model?.verified!==true||!model.executors?.includes('ai')
   ||!['text','json','image_generation'].every(c=>model.capabilities?.includes(c))
   ||!record(pricing)||Object.keys(pricing).sort().join(',')!=='currency,version'||!/^[A-Z]{3}$/.test(pricing.currency)||typeof pricing.version!=='string'||!pricing.version.trim()||pricing.version.length>128
   ||item?.executor!=='ai'||!item.runtimeIds?.includes('web')||!['text','json','image_generation'].every(c=>item.capabilities?.includes(c))
   ||policy?.maxToolCalls!==0||JSON.stringify(policy.serviceIds)!=='["brand-agent"]'||policy.budget?.currency!==pricing.currency
   ||!Number.isSafeInteger(policy.budget.maxOutputTokens)||policy.budget.maxOutputTokens<2048
   ||!Number.isSafeInteger(policy.budget.deadlineMs)||policy.budget.deadlineMs<1||policy.budget.deadlineMs>30000
   ||!Array.isArray(bindings?.[task])||!bindings[task].length)fail('configuration','Complete image catalog, bounded policy, tariff and budget bindings required');
 const transport=Object.freeze({create:image.transport.create.bind(image.transport)}),preflight=image.preflight,priceUsage=image.priceUsage,authorize=options.authorize;
 freeze(declarations);
 const quote=async context=>{const value=await preflight(context);if(value?.currency!==pricing.currency||value?.priceVersion!==pricing.version)fail('configuration','Image preflight tariff changed');return value;};
 const price=async context=>{const value=await priceUsage(context);if(value!==null&&(value?.currency!==pricing.currency||value?.priceVersion!==pricing.version))fail('configuration','Image usage tariff changed');return value;};
 const adapter=createIdeogramAdapter({models,credentialRef:image.credentialRef,transport,preflight:quote,priceUsage:price});
 const adapters=options.adapters.map(value=>{if(typeof value?.execute!=='function'||value.providerId==='ideogram')fail('configuration','Original distinct adapters required');return Object.freeze({...value,models:freeze(structuredClone(value.models)),execute:value.execute.bind(value)});});
 adapters.push(Object.freeze(adapter));
 const {image:_image,...shared}=options;
 return Object.freeze({...shared,adapters:Object.freeze(adapters),taskCatalog:catalog,policies,budgetBindings:bindings,authorize:async context=>{
  if(context.taskType===task&&context.serviceId!=='brand-agent')fail('permissions','Image task requires its original service');
  return authorize(context);
 }});
}
module.exports={createIdeogramSharedRuntimeDependencies};
