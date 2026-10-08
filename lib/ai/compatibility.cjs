'use strict';
const {ContractError,validateRequest}=require('../../contracts/ai/v1/core.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
// Transitional boundary for legacy message consumers. The trusted caller supplies
// identity, task, instructions version and budget; the business body cannot select a provider.
function createMessagesFacade({runner,context,taskType,instructionsVersion,inputVersion='1.0',language,outputSchema,requiredCapabilities=[],incompletePolicy='reject'}={}){
 if(typeof runner?.run!=='function'||!context?.budget||!Number.isSafeInteger(context.maxToolCalls)||context.maxToolCalls<0)fail('configuration','Task runtime context and tool allowance required');
 context={...context,budget:{...context.budget}};
 if(!Array.isArray(requiredCapabilities)||requiredCapabilities.some(cap=>typeof cap!=='string'||!cap.trim()))fail('configuration','Invalid required capabilities');
 requiredCapabilities=[...requiredCapabilities];
 if(!['reject','expose-text'].includes(incompletePolicy)||(incompletePolicy==='expose-text'&&outputSchema))fail('configuration','Incomplete structured output cannot be exposed');
 async function invoke(parameters,options={},readOnly=false){
  if(!options||typeof options!=='object'||Object.keys(options).some(key=>key!=='signal'))fail('invalid_format','Only cancellation may be supplied as an execution option');
  if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))fail('invalid_format','Message parameters required');
  for(const field of Object.keys(parameters))if(!['messages','system','max_tokens','tools'].includes(field))fail('invalid_format','Business layer cannot override '+field);
  if(!Array.isArray(parameters.messages)||!Number.isSafeInteger(parameters.max_tokens)||parameters.max_tokens<1)fail('invalid_format','Messages and output allowance required');
  if(parameters.max_tokens>context.budget.maxOutputTokens)fail('quota','Output allowance exceeds task budget');
  const system=parameters.system??'';if(typeof system!=='string')fail('capability','Structured system blocks require explicit migration');
  const messages=parameters.messages.map(message=>{
   if(!message||Object.keys(message).some(field=>!['role','content'].includes(field)))fail('invalid_format','Unsupported message fields');
   const content=typeof message.content==='string'?[{type:'text',text:message.content}]:message.content;
   if(!Array.isArray(content))fail('invalid_format','Invalid legacy content');
   return {role:message.role,content:content.map(block=>{
    if(block?.type==='text'&&Object.keys(block).every(key=>['type','text'].includes(key)))return {type:'text',text:block.text};
    if(block?.type==='image'&&Object.keys(block).every(key=>['type','source'].includes(key))&&block.source?.type==='url'&&Object.keys(block.source).every(key=>['type','url'].includes(key)))return {type:'image',url:block.source.url,mediaType:'image/unknown'};
    fail('capability','Legacy block requires explicit portable mapping');
   })};
  });
  const capabilities=[...new Set(['text',...requiredCapabilities])];if(messages.some(message=>message.content.some(block=>block.type==='image'))&&!capabilities.includes('vision'))capabilities.push('vision');
  let toolPolicy={allowed:[],maxCalls:0};
  if(parameters.tools!==undefined){
   if(!Array.isArray(parameters.tools)||parameters.tools.length>1)fail('capability','Only one bounded web search declaration is supported');
   if(parameters.tools.length){
    const tool=parameters.tools[0];
    const neutral=tool&&Object.keys(tool).every(key=>['name','maxCalls'].includes(key));
    const legacy=tool&&Object.keys(tool).every(key=>['type','name','max_uses'].includes(key))&&tool.type==='web_search_20250305';
    const maxCalls=neutral?tool.maxCalls:tool?.max_uses;
    if((!neutral&&!legacy)||tool.name!=='web_search'||!Number.isSafeInteger(maxCalls)||maxCalls<1||maxCalls>context.maxToolCalls)fail('permissions','Tool exceeds trusted allowance');
    capabilities.push('web_search');toolPolicy={allowed:['web_search'],maxCalls};
   }
  }
  if(outputSchema)capabilities.push('json');
  const request=validateRequest({requestId:context.requestId,taskType,contractVersion:'1.0',inputVersion,language,instructions:system,instructionsVersion,messages,requiredCapabilities:capabilities,...(outputSchema?{outputSchema}:{}),toolPolicy,budget:{...context.budget,maxOutputTokens:parameters.max_tokens},...(context.idempotencyKey?{idempotencyKey:context.idempotencyKey}:{})});
  const signal=context.signal&&options.signal?AbortSignal.any([context.signal,options.signal]):options.signal??context.signal;
  if(readOnly&&typeof runner.retrieve!=='function')fail('configuration','Read-only result retrieval unavailable');
  const outcome=await runner[readOnly?'retrieve':'run'](request,{runId:context.runId,budgetId:context.budgetId,agentId:context.agentId,principalId:context.principalId,signal});
  if(readOnly&&outcome===null)return null;
  if(readOnly&&outcome?.kind!=='result')fail('uncertain','Retained result receipt unavailable');
  if(outcome.kind==='existing-run')fail('uncertain','Existing execution must be retrieved from business history');
  const result=outcome.result;
  const exposedPartial=incompletePolicy==='expose-text'&&result.status==='incomplete'&&typeof result.text==='string'&&result.text.trim()&&toolPolicy.maxCalls===0;
  if(result.status!=='completed'&&!exposedPartial){
   const error=new ContractError(result.error?.code??(result.status==='cancelled'?'cancelled':'invalid_format'),'Task did not produce a complete result');
   error.result=result;throw error;
  }
  // Missing usage remains null; callers must not invent zeros for accounting.
  return {id:result.runId,model:result.model,content:[{type:'text',text:outputSchema?JSON.stringify(result.data):result.text}],stop_reason:result.status==='completed'?'end_turn':null,incomplete:result.status==='incomplete',usage:{input_tokens:result.usage.inputTokens,output_tokens:result.usage.outputTokens,cache_read_input_tokens:result.usage.cacheReadTokens,cache_creation_input_tokens:result.usage.cacheWriteTokens},execution:result,accounting:outcome.accounting};
 }
 return Object.freeze({create:(parameters,options)=>invoke(parameters,options),
  retrieve:(parameters,options)=>invoke(parameters,options,true)});
}
module.exports={createMessagesFacade};
