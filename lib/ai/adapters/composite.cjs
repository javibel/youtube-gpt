'use strict';
const {isDeepStrictEqual}=require('node:util');
const {ContractError,createRegistry}=require('../../../contracts/ai/v1/core.cjs');
const fail=message=>{throw new ContractError('configuration',message);};
// A single provider registration may expose independently implemented executors.
// Component versions form the pinned composite version; no executor fallback.
function composeProviderAdapters({ai,coding}={}){
 const branches={ai,coding};
 for(const [executor,adapter]of Object.entries(branches)){
  if(!adapter)fail('Both explicit executor adapters are required');
  createRegistry().register(adapter);
  if(Object.values(adapter.models).some(model=>model.executors.length!==1||model.executors[0]!==executor))fail('Each component must declare exactly its own executor');
 }
 if(ai.providerId!==coding.providerId||ai.credentialRef!==coding.credentialRef)fail('Composite executors must share provider and credential provenance');
 const models={};
 for(const [executor,adapter]of Object.entries(branches))for(const [name,model]of Object.entries(adapter.models)){
  if(Object.hasOwn(models,name)){
   // v1 has one capability list per model, so reject misleading unions.
   if(!isDeepStrictEqual([...models[name].capabilities].sort(),[...model.capabilities].sort()))fail('Shared model has different executor capabilities; explicit contract migration is required');
   models[name].executors.push(executor);
  }else Object.defineProperty(models,name,{value:structuredClone(model),enumerable:true,writable:true,configurable:true});
 }
 const metadata={providerId:ai.providerId,adapterVersion:JSON.stringify({ai:ai.adapterVersion,coding:coding.adapterVersion}),enabled:ai.enabled&&coding.enabled,credentialRef:ai.credentialRef,models};
 // Pin component functions and metadata now; later object mutation cannot reroute work.
 const execute={ai:ai.execute,coding:coding.execute};
 const supported=Object.fromEntries(Object.entries(branches).map(([name,adapter])=>[name,structuredClone(adapter.models)]));
 return {...metadata,async execute(context){
  const executor=context.snapshot?.executor,branch=Object.hasOwn(supported,executor)?supported[executor]:null;
  const model=branch&&Object.hasOwn(branch,context.snapshot?.model)?branch[context.snapshot.model]:null;
  if(!model||context.snapshot.providerId!==metadata.providerId||context.snapshot.adapterVersion!==metadata.adapterVersion||context.snapshot.credentialRef!==metadata.credentialRef||context.request.requiredCapabilities.some(cap=>!model.capabilities.includes(cap)))throw new ContractError('capability','Pinned executor component is incompatible');
  return execute[executor](context);
 }};
}
module.exports={composeProviderAdapters};
