'use strict';
const {ContractError,validateRequest,validateResult}=require('./core.cjs');
function createTaskRunner({store,registry,executor='ai',clock=Date.now}){
 if(!store||typeof store.admit!=='function'||typeof store.reconcile!=='function'||!registry||typeof registry.runPinned!=='function'||!['ai','coding'].includes(executor))throw new ContractError('configuration','Durable store and registry are required');
 async function executeAdmitted(validated,request,admission,remaining,signal){
  let result;
  if(remaining<=0){
   result=validateResult({status:'failed',error:{code:'deadline',message:'Deadline elapsed before dispatch'},usage:{costMicros:0,currency:request.budget.currency,priceVersion:'not-dispatched-v1',estimated:false}},validated,admission.snapshot,admission.runId);
  }else{
   try{result=await registry.runPinned(admission.snapshot,{...request,budget:{...request.budget,deadlineMs:remaining}},{runId:admission.runId,signal});}
   catch(error){result=validateResult({status:'failed',error:{code:error instanceof ContractError?error.code:'uncertain',message:'Execution could not be normalized'}},validated,admission.snapshot,admission.runId);}
  }
  let accounting;
  try{accounting=await store.reconcile(admission.runId,{status:result.error?.code==='uncertain'?'uncertain':result.status,usage:result.usage,result});}
  catch{throw new ContractError('uncertain','Execution reconciliation unavailable; do not retry the provider');}
  return {kind:'result',result,accounting};
 }
 return Object.freeze({async run(rawRequest,{runId,budgetId,agentId,principalId,signal}={}){
  const started=clock();
  const validated=executor==='coding'?require('./coding.cjs').validateCodingRequest(rawRequest):validateRequest(rawRequest);
  const request=executor==='coding'?Object.fromEntries(Object.entries(validated).filter(([key])=>key!=='outputSchema')):validated;
  const admission=await store.admit(request,{runId,budgetId,agentId,principalId,executor});
  if(admission.replay&&admission.result)return {kind:'result',result:admission.result,accounting:admission.accounting};
  if(admission.replay)return {kind:'existing-run',runId:admission.runId,status:admission.status,snapshot:admission.snapshot};
  const remaining=request.budget.deadlineMs-Math.max(0,clock()-started);
  return executeAdmitted(validated,request,admission,remaining,signal);
 },async runClaimed(rawRequest,{runId,budgetId,agentId,principalId,dispatchDigest,signal}={}){
  if(typeof store.claimDispatch!=='function')throw new ContractError('configuration','One-shot dispatch store required');
  if(signal?.aborted)throw new ContractError('cancelled','Cancelled before dispatch claim');
  const started=clock();
  const validated=executor==='coding'?require('./coding.cjs').validateCodingRequest(rawRequest):validateRequest(rawRequest);
  const request=executor==='coding'?Object.fromEntries(Object.entries(validated).filter(([key])=>key!=='outputSchema')):validated;
  const claimed=await store.claimDispatch(request,{runId,budgetId,agentId,principalId,executor,dispatchDigest});
  if(claimed?.runId!==runId||claimed.dispatchDigest!==dispatchDigest||!claimed.snapshot||typeof claimed.snapshot!=='object')throw new ContractError('uncertain','Dispatch claim receipt does not match the requested execution; reconcile before retrying');
  if(!Number.isFinite(claimed.remainingDeadlineMs)||claimed.remainingDeadlineMs<=0)throw new ContractError('uncertain','Claimed dispatch has no valid deadline; reconcile before retrying');
  const remaining=claimed.remainingDeadlineMs-Math.max(0,clock()-started);
  return executeAdmitted(validated,request,claimed,remaining,signal);
 }});
}
module.exports={createTaskRunner};
