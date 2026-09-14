'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {ContractError}=require('../../contracts/ai/v1/core.cjs');
const {createMessagesFacade}=require('./compatibility.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
// Server composition only. Policies and authorization are injected by trusted
// bootstrap; no user body, model output or environment file can install them.
function createTaskFactory({runner,policies,authorize,newIdentity=randomUUID}={}){
 if(typeof runner?.run!=='function'||!policies||typeof policies!=='object'||Array.isArray(policies)||typeof authorize!=='function'||typeof newIdentity!=='function')fail('configuration','Trusted task policy and authorization required');
 const configured=structuredClone(policies);
 for(const policy of Object.values(configured)){
  if(!policy||Object.keys(policy).some(key=>!['budget','maxToolCalls','serviceIds'].includes(key))||!Number.isSafeInteger(policy.maxToolCalls)||policy.maxToolCalls<0||!policy.budget)fail('configuration','Invalid task policy');
  if(policy.serviceIds!==undefined&&(!Array.isArray(policy.serviceIds)||policy.serviceIds.some(id=>typeof id!=='string'||!id.trim())))fail('configuration','Explicit service identities required');
  const b=policy.budget;
  if(Object.keys(b).some(key=>!['currency','maxCostMicros','maxOutputTokens','deadlineMs'].includes(key))||!/^[A-Z]{3}$/.test(b.currency)||!Number.isSafeInteger(b.maxCostMicros)||b.maxCostMicros<0||!Number.isSafeInteger(b.maxOutputTokens)||b.maxOutputTokens<1||!Number.isSafeInteger(b.deadlineMs)||b.deadlineMs<1||b.deadlineMs>2147483647)fail('configuration','Invalid bounded task policy');
 }
 return async function factory(identity){
  if(!identity||Object.keys(identity).some(key=>!['taskType','userId','serviceId','language','instructionsVersion','outputSchema','requiredCapabilities','incompletePolicy'].includes(key)))fail('permissions','Authenticated task identity required');
  identity=structuredClone(identity);
  const principals=['userId','serviceId'].filter(key=>Object.hasOwn(identity,key));
  if(principals.length!==1||typeof identity[principals[0]]!=='string'||!identity[principals[0]].trim())fail('permissions','Exactly one task principal is required');
  const principal=principals[0];
  if(!Object.hasOwn(configured,identity.taskType))fail('configuration','Task has no trusted budget policy');
  if(principal==='serviceId'&&!configured[identity.taskType].serviceIds?.includes(identity.serviceId))fail('permissions','Service is not enabled for this task');
  const grant=await authorize({[principal]:identity[principal],taskType:identity.taskType});
  if(!grant||typeof grant.budgetId!=='string'||!grant.budgetId.trim()||(grant.agentId!==undefined&&(typeof grant.agentId!=='string'||!grant.agentId.trim())))fail('permissions','Task budget is not authorized');
  const nonce=newIdentity();if(typeof nonce!=='string'||!nonce.trim())fail('configuration','Execution identity unavailable');
  const scope=createHash('sha256').update(JSON.stringify([principal,identity[principal],identity.taskType,nonce])).digest('hex');
  const principalId=createHash('sha256').update(JSON.stringify([principal,identity[principal]])).digest('hex');
  const policy=configured[identity.taskType];
  return createMessagesFacade({runner,taskType:identity.taskType,language:identity.language,instructionsVersion:identity.instructionsVersion,outputSchema:identity.outputSchema,requiredCapabilities:identity.requiredCapabilities,incompletePolicy:identity.incompletePolicy,context:{requestId:'request_'+scope,runId:'run_'+scope,budgetId:grant.budgetId,agentId:grant.agentId,principalId,maxToolCalls:policy.maxToolCalls,budget:policy.budget}});
 };
}
module.exports={createTaskFactory};
