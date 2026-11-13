'use strict';
// Protocol adapter only: no SDK construction, environment access or default models.
const {ContractError,validateRequest,validateData}=require('../../../contracts/ai/v1/core.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const finiteCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function toMessage(rawRequest,model){
 const request=validateRequest(rawRequest),system=[],messages=[];
 if(request.instructions)system.push({type:'text',text:request.instructions});
 let seenConversation=false;
 for(const message of request.messages){
  if(message.role==='tool')fail('capability','Portable tool-result history is not implemented');
  if(message.role==='system'){
   if(seenConversation||message.content.some(part=>part.type!=='text'))fail('capability','Only leading text system messages are supported');
   system.push(...message.content.map(part=>({type:'text',text:part.text})));continue;
  }
  seenConversation=true;
  messages.push({role:message.role,content:message.content.map(part=>part.type==='text'?{type:'text',text:part.text}:{type:'image',source:{type:'url',url:part.url}})});
 }
 if(!messages.length||messages[0].role!=='user'||messages.at(-1).role!=='user')fail('capability','Conversation must begin and end with a user message');
 const payload={model,max_tokens:request.budget.maxOutputTokens,messages,stream:false};
 // Pin the already selected standard/global billing scope on new requests.
 // Haiku4.5 rejects inference_geo; it predates geographic pricing modifiers.
 if(['claude-opus-4-8','claude-opus-4-6','claude-sonnet-4-6','claude-haiku-4-5-20251001'].includes(model)){
  payload.service_tier='standard_only';if(model!=='claude-haiku-4-5-20251001')payload.inference_geo='global';
 }
 // No speed parameter: fast mode is opt-in; some models reject even standard
 // without a beta header. This transport does not enable that beta.
 if(request.outputSchema)system.push({type:'text',text:'Return only valid JSON matching this schema: '+JSON.stringify(request.outputSchema)});
 if(request.requiredCapabilities.includes('prompt_cache')){
  if(!system.length)fail('capability','Instruction caching requires a system prefix');
  system.at(-1).cache_control={type:'ephemeral'};
 }
 if(system.length)payload.system=system;
 const search=request.requiredCapabilities.includes('web_search');
 if(request.toolPolicy.allowed.some(name=>name!=='web_search'))fail('capability','Only bounded web search is supported by this adapter');
 if(search!==request.toolPolicy.allowed.includes('web_search')||(search&&request.toolPolicy.maxCalls<1))fail('capability','Web search requires explicit capability and bounded permission');
 if(search)payload.tools=[{type:'web_search_20250305',name:'web_search',max_uses:request.toolPolicy.maxCalls}];
 return payload;
}
function usageOf(message,request){
 const usage=message.usage??{};
 // Missing/nullable server usage is zero only when the actual portable
 // request enables no tools AND the response contains no tool invocation.
 const noTools=request.toolPolicy.allowed.length===0&&request.toolPolicy.maxCalls===0&&Array.isArray(message.content)&&!message.content.some(p=>['server_tool_use','tool_use','web_search_tool_result'].includes(p?.type));
 const toolCalls=usage.server_tool_use==null&&noTools?0:finiteCount(usage.server_tool_use?.web_search_requests);
 return {inputTokens:finiteCount(usage.input_tokens),outputTokens:finiteCount(usage.output_tokens),cacheReadTokens:finiteCount(usage.cache_read_input_tokens),cacheWriteTokens:finiteCount(usage.cache_creation_input_tokens),toolCalls,costMicros:null,priceVersion:null,estimated:true};
}
function normalize(message,request){
 if(!message||!Array.isArray(message.content))fail('invalid_format','Invalid provider response');
 const usage=usageOf(message,request),sources=[],parts=[];let toolFailure=false;
 for(const block of message.content){
  if(block?.type==='text'){
   if(typeof block.text!=='string')fail('invalid_format','Invalid text block');parts.push(block.text);
   for(const citation of block.citations??[])if(citation.type==='web_search_result_location'&&typeof citation.url==='string'&&/^https?:\/\//.test(citation.url)&&typeof citation.title==='string'&&citation.title.trim())sources.push({url:citation.url,title:citation.title});
  }else if(block?.type==='web_search_tool_result'){
   if(block.content?.type==='web_search_tool_result_error')toolFailure=true;
  }else if(!['server_tool_use','thinking','redacted_thinking','tool_use'].includes(block?.type))fail('capability','Unsupported response block');
 }
 let status=message.stop_reason==='end_turn'?'completed':message.stop_reason==='refusal'?'refused':['max_tokens','model_context_window_exceeded','pause_turn','tool_use','stop_sequence'].includes(message.stop_reason)?'incomplete':'failed';
 const result={status,text:parts.join('\n'),data:null,sources:sources.filter((source,index)=>sources.findIndex(other=>other.url===source.url&&other.title===source.title)===index),usage};
 if(status==='failed')result.error={code:'uncertain',message:'Unknown provider stop reason'};
 if(toolFailure){result.status='failed';result.error={code:'transport',message:'Provider search failed'};}
 if(usage.toolCalls!==null&&usage.toolCalls>request.toolPolicy.maxCalls){result.status='failed';result.error={code:'permissions',message:'Provider exceeded tool budget'};}
 if(result.status==='completed'&&request.outputSchema){
  try{const cleaned=result.text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i,'$1').trim();result.data=JSON.parse(cleaned);validateData(request.outputSchema,result.data);}
  catch{result.status='failed';result.data=null;result.error={code:'invalid_format',message:'Structured output did not match the contract'};}
 }else if(result.status==='completed'&&!result.text.trim()){result.status='failed';result.error={code:'invalid_format',message:'Empty completed response'};}
 return result;
}
function normalizeError(error){
 const code=error?.status===401?'credentials':error?.status===403?'permissions':error?.status===402?'quota':error?.status===429?'rate_limit':[400,413,422].includes(error?.status)?'invalid_format':error?.status===404?'capability':'uncertain';
 return {status:'failed',error:{code,message:'Provider request failed'}};
}
function createAnthropicAdapter({models,credentialRef,transport,preflight,priceUsage}={}){
 if(typeof transport?.create!=='function'||typeof preflight!=='function'||(priceUsage!==undefined&&typeof priceUsage!=='function'))fail('configuration','Injected transport and conservative preflight are required');
 return {providerId:'anthropic',adapterVersion:'messages-v1',enabled:true,credentialRef,models,async execute({request,snapshot,signal}){
  let payload,quote;
  try{
   payload=toMessage(request,snapshot.model);
   quote=await preflight({payload:structuredClone(payload),request,snapshot,signal});
   const counted=['authorized-counted-reservation','authorized-context-reservation'].includes(quote?.kind),reserve=counted?quote.reservationMicros:quote?.upperBoundMicros;
   if(!quote||!Number.isSafeInteger(reserve)||reserve<0||quote.currency!==request.budget.currency||typeof quote.priceVersion!=='string'||!quote.priceVersion||counted&&(typeof quote.reservationRevision!=='string'||!quote.reservationRevision||Object.hasOwn(quote,'upperBoundMicros')))fail('configuration','Bounded price or explicitly authorized counted reservation unavailable');
   if(reserve>request.budget.maxCostMicros)fail('quota','Request exceeds reserved budget');
  }catch(error){return {status:'failed',error:{code:error instanceof ContractError?error.code:'configuration',message:'Local preflight rejected'},usage:{costMicros:0,currency:request.budget.currency,priceVersion:'not-dispatched-v1',estimated:false}};}
  if(signal?.aborted)return {status:'cancelled',error:{code:'cancelled',message:'Cancelled before dispatch'}};
  let message,pricingRequest;
  try{if(priceUsage)pricingRequest=structuredClone(payload);message=await transport.create(payload,{signal,timeout:request.budget.deadlineMs,maxRetries:0});}
  catch(error){return normalizeError(error);}
  const result=normalize(message,request);
  if(priceUsage){
   try{const response={model:message.model,usage:structuredClone(message.usage),toolUseObserved:message.content.some(p=>['server_tool_use','tool_use','web_search_tool_result'].includes(p?.type))};if(Object.hasOwn(message,'speed'))response.speed=structuredClone(message.speed);
    const cost=await priceUsage({usage:structuredClone(result.usage),snapshot,quote,anthropic:{request:pricingRequest,response}});if(cost){
    if(!Number.isSafeInteger(cost.costMicros)||cost.costMicros<0||cost.currency!==request.budget.currency||typeof cost.priceVersion!=='string'||!cost.priceVersion||typeof cost.estimated!=='boolean')throw Error('Invalid cost evidence');
    result.usage={...result.usage,costMicros:cost.costMicros,currency:cost.currency,priceVersion:cost.priceVersion,estimated:cost.estimated};
    if(['authorized-counted-reservation','authorized-context-reservation'].includes(quote.kind)&&cost.reservationPolicyBreached===true){result.status='failed';result.error={code:'quota',message:'Request reservation exceeded; measured usage requires reconciliation'};}
   }}
   catch{/* Preserve measured tokens with unknown cost for later reconciliation. */}
  }
  return result;
 }};
}
module.exports={toMessage,normalize,normalizeError,createAnthropicAdapter};
